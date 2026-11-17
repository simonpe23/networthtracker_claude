// Browser checks for sync between two devices (a 1440px laptop and a 390px phone).
// The sync service is replaced by an in-memory stand-in that applies the same rules
// as the real table (one row per user, revision check on update), so no real account
// or network is touched. Start the app first with sync configured, for example:
//   VITE_SUPABASE_URL=https://sync.test VITE_SUPABASE_PUBLISHABLE_KEY=test npm run dev
// then: node scripts/verify-sync.cjs [baseUrl]
const { chromium } = require('playwright');
const path = require('path');
const audit = require('./audit.cjs');

const BASE = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(__dirname, '..', 'screenshots');
const KEY = 'sp-net-worth-tracker';
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---- Stand-in sync service ----
const server = { users: new Map(), rows: new Map(), offline: new Set(), writes: 0 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (u) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${u.id}`,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

async function handle(route, device) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (server.offline.has(device)) return route.abort('internetdisconnected');
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const body = req.postData() ? JSON.parse(req.postData()) : null;

  if (url.pathname === '/auth/v1/settings') return json(200, { external: { email: true, google: server.google === true } });
  if (url.pathname === '/auth/v1/authorize') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: '<title>provider</title>' });
  if (url.pathname === '/auth/v1/signup') {
    const id = `00000000-0000-4000-8000-${String(server.users.size + 1).padStart(12, '0')}`;
    server.users.set(body.email, { id, email: body.email, password: body.password, confirmed: false });
    return json(200, { id, aud: 'authenticated', role: 'authenticated', email: body.email, confirmation_sent_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [] });
  }
  if (url.pathname === '/auth/v1/token') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const u = [...server.users.values()].find((x) => `refresh-${x.id}` === body.refresh_token);
      return u ? json(200, session(u)) : json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    }
    const u = server.users.get(body.email);
    if (!u || u.password !== body.password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    if (!u.confirmed) return json(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
    return json(200, session(u));
  }
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
  if (url.pathname === '/auth/v1/user') {
    const uid = JSON.parse(Buffer.from((req.headers().authorization || '').split('.')[1] || 'e30', 'base64url').toString()).sub;
    const u = [...server.users.values()].find((x) => x.id === uid);
    return u ? json(200, session(u).user) : json(401, { msg: 'no user' });
  }

  if (url.pathname === '/rest/v1/net_worth_portfolios') {
    // Row level security: a request only ever sees the row of the signed-in user.
    const token = (req.headers().authorization || '').replace('Bearer ', '');
    let uid = null;
    try {
      uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub || null;
    } catch {
      uid = null;
    }
    const eq = (k) => (url.searchParams.get(k) || '').replace(/^eq\./, '') || null;
    const view = (r) => (r ? [{ data: r.data, revision: r.revision, updated_at: r.updated_at }] : []);
    const mine = uid && server.rows.get(uid);
    if (req.method() === 'GET') return json(200, uid && eq('user_id') === uid ? view(mine) : []);
    if (!uid) return json(401, { code: '42501', message: 'new row violates row-level security policy' });
    const row = Array.isArray(body) ? body[0] : body;
    if (req.method() === 'POST') {
      if (row.user_id !== uid) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
      const upsert = (req.headers().prefer || '').includes('merge-duplicates');
      if (mine && !upsert) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
      server.rows.set(uid, { data: row.data, revision: row.revision, updated_at: row.updated_at });
      server.writes++;
      return json(201, view(server.rows.get(uid)));
    }
    if (req.method() === 'PATCH') {
      if (!mine || eq('user_id') !== uid || String(mine.revision) !== eq('revision')) return json(200, []);
      server.rows.set(uid, { data: row.data, revision: row.revision, updated_at: row.updated_at });
      server.writes++;
      return json(200, view(server.rows.get(uid)));
    }
  }
  return json(404, { message: `not handled: ${req.method()} ${url.pathname}` });
}

// ---- Helpers ----
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    try {
      if (await fn()) return true;
    } catch {
      /* keep waiting */
    }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
};
const go = async (page, hash) => {
  await page.goto(BASE + hash);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
};
const netWorth = (page) => page.locator('.net-worth').innerText();
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const refocus = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const runAudit = async (page, label) => {
  const r = await page.evaluate(audit);
  const ok = r.failures.length === 0 && r.small.length === 0 && r.overflowX <= 0;
  check(`audit ${label}: contrast, text size, no sideways scroll`, ok, ok ? `min text ${r.minFont}px` : JSON.stringify({ f: r.failures.slice(0, 4), s: r.small.slice(0, 4), o: r.overflowX }));
};
async function device(browser, name, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.route(/\/(auth|rest)\/v1\//, (route) => handle(route, name));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error on ${name}`, false, e.message));
  return page;
}
async function signIn(page, email, password) {
  await go(page, '#/settings');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
async function addHolding(page, name, balance) {
  await page.getByRole('button', { name: 'Add holding' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill(name);
  await dlg.getByLabel('Current balance').fill(balance);
  await dlg.getByRole('button', { name: 'Save holding' }).click();
}
async function setBalance(page, name, balance) {
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Current balance').fill(balance);
  await dlg.getByRole('button', { name: 'Save changes' }).click();
}

(async () => {
  const browser = await chromium.launch();
  const laptop = await device(browser, 'laptop', 1440, 900);
  const phone = await device(browser, 'phone', 390, 844);
  const EMAIL = 'me@example.com';
  const PW = 'correct-horse-1';

  // Account creation and sign-in errors
  await go(laptop, '#/settings');
  check('sync section is offered when signed out', await laptop.getByRole('heading', { name: 'Sync across devices' }).isVisible());
  await laptop.getByRole('button', { name: 'Sign in' }).click();
  check('empty sign-in form shows clear errors', (await laptop.getByText('Error: Enter your email address.').count()) === 1 && (await laptop.getByText('Error: Enter a password of at least 8 characters.').count()) === 1);
  await runAudit(laptop, 'sign-in form with errors @1440');
  await laptop.getByLabel('Email').fill(EMAIL);
  await laptop.getByLabel('Password').fill(PW);
  await laptop.getByRole('button', { name: 'Create account' }).click();
  check('account creation asks to confirm the email', await until(async () => (await laptop.locator('.setting').first().innerText()).includes('Account created. Open the confirmation link sent to me@example.com')));
  await laptop.getByRole('button', { name: 'Sign in' }).click();
  check('sign-in before confirming explains why', await until(async () => (await laptop.locator('.setting .error').innerText()).includes('Confirm your email first')));
  server.users.get(EMAIL).confirmed = true;
  await laptop.getByLabel('Password').fill('wrong-password');
  await laptop.getByRole('button', { name: 'Sign in' }).click();
  check('wrong password is reported', await until(async () => (await laptop.locator('.setting .error').innerText()) === 'Error: Email or password is wrong.'));
  await laptop.getByLabel('Password').fill(PW);
  await laptop.getByRole('button', { name: 'Sign in' }).click();
  check('sign-in works', await until(async () => (await laptop.locator('.setting').first().innerText()).includes('Signed in as me@example.com')));
  check('the example portfolio is never uploaded', server.rows.size === 0 && (await stored(laptop)).isExample === true);
  await runAudit(laptop, 'signed in @1440');
  await laptop.screenshot({ path: path.join(OUT, 'sync-signed-in-1440.png') });

  // First real data goes up
  await go(laptop, '#/');
  await laptop.getByRole('button', { name: 'Start my portfolio' }).click();
  await laptop.getByRole('dialog').getByRole('button', { name: 'Start my portfolio' }).click();
  await addHolding(laptop, 'Savings', '20000');
  await addHolding(laptop, 'Bitcoin', '30000');
  const row = () => [...server.rows.values()][0];
  check('changes on the laptop are saved to the account', await until(() => row() && row().data.holdings.length === 2), row() ? `revision ${row().revision}` : 'no row');
  check('only the signed-in user owns the row', server.rows.size === 1 && server.rows.has(server.users.get(EMAIL).id));

  // Phone pulls it
  await go(phone, '#/');
  check('phone starts with the example', (await netWorth(phone)) === '$1,086,650');
  await signIn(phone, EMAIL, PW);
  check('phone signs in', await until(async () => (await phone.locator('.setting').first().innerText()).includes('Signed in as me@example.com')));
  await runAudit(phone, 'signed in @390');
  await phone.screenshot({ path: path.join(OUT, 'sync-signed-in-390.png') });
  await go(phone, '#/');
  check('phone shows the laptop data (20,000 + 30,000)', await until(async () => (await netWorth(phone)) === '$50,000'), await netWorth(phone));
  check('example note is gone on the phone', (await phone.locator('.example-note').count()) === 0);

  // Phone edits, laptop receives
  await setBalance(phone, 'Bitcoin', '45000');
  check('phone edit is saved to the account', await until(() => row().data.holdings.find((h) => h.name === 'Bitcoin').value === 45000));
  await refocus(laptop);
  check('laptop picks up the phone edit when it comes back into view', await until(async () => (await netWorth(laptop)) === '$65,000'), await netWorth(laptop));

  // Snapshots travel too
  await laptop.getByRole('button', { name: 'Take snapshot' }).first().click();
  await until(() => row().data.snapshots.length === 1);
  await refocus(phone);
  check('a snapshot taken on the laptop appears on the phone', await until(async () => (await stored(phone)).snapshots.length === 1));

  // Reload keeps the session and the data
  await laptop.reload();
  check('laptop stays signed in and in sync after a reload', await until(async () => (await netWorth(laptop)) === '$65,000'));

  // Offline edits, then a conflict
  server.offline.add('laptop');
  await setBalance(laptop, 'Savings', '21000');
  check('offline edit is kept on the device and reported', await until(async () => (await laptop.locator('.notice').innerText()).includes('Sync problem')) && (await netWorth(laptop)) === '$66,000');
  await setBalance(phone, 'Savings', '25000');
  await until(() => row().data.holdings.find((h) => h.name === 'Savings').value === 25000);
  const before = row().revision;
  server.offline.delete('laptop');
  await refocus(laptop);
  check('both devices changed: the laptop asks instead of overwriting', await until(() => laptop.getByRole('dialog', { name: 'This device and your account hold different data' }).isVisible()));
  check('the account copy is untouched while the question is open', row().revision === before && row().data.holdings.find((h) => h.name === 'Savings').value === 25000);
  const text = (await laptop.getByRole('dialog').innerText()).replace(/\s+/g, ' ');
  check('the prompt shows both sides', text.includes('This device: 2 holdings, net worth $66,000.') && text.includes('Your account: 2 holdings, net worth $70,000, last saved'), text.slice(0, 200));
  await runAudit(laptop, 'conflict dialog @1440');
  await laptop.screenshot({ path: path.join(OUT, 'sync-conflict-1440.png') });
  await laptop.getByRole('button', { name: "Keep this device's data" }).click();
  check('keeping the device data replaces the account copy', await until(() => row().data.holdings.find((h) => h.name === 'Savings').value === 21000 && row().revision === before + 1));
  await refocus(phone);
  check('the phone then follows', await until(async () => (await netWorth(phone)) === '$66,000'), await netWorth(phone));

  // Sign out stops syncing but keeps the data
  await go(phone, '#/settings');
  await phone.getByRole('button', { name: 'Sign out' }).click();
  await until(() => phone.getByRole('button', { name: 'Sign in' }).isVisible());
  await go(phone, '#/');
  const writes = server.writes;
  await setBalance(phone, 'Savings', '99000');
  await phone.waitForTimeout(1800);
  check('after sign-out the data stays on the phone and nothing is uploaded', (await netWorth(phone)) === '$144,000' && server.writes === writes);

  // Meanwhile the laptop changes the account. Signing back in on the phone must ask.
  await setBalance(laptop, 'Bitcoin', '46000');
  await until(() => row().data.holdings.find((h) => h.name === 'Bitcoin').value === 46000);
  await signIn(phone, EMAIL, PW);
  check('signing back in when both sides changed asks which to keep', await until(() => phone.getByRole('dialog').isVisible()));
  await runAudit(phone, 'conflict dialog @390');
  const fits = await phone.evaluate(() => {
    const r = document.querySelector('dialog').getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth;
  });
  check('conflict dialog fits a 390px screen', fits);
  await phone.screenshot({ path: path.join(OUT, 'sync-conflict-390.png') });
  await phone.getByRole('button', { name: 'Keep account data' }).click();
  await go(phone, '#/');
  check('keeping the account data restores it on the phone (21,000 + 46,000)', await until(async () => (await netWorth(phone)) === '$67,000'), await netWorth(phone));

  // A second person cannot read the first person's row
  server.users.set('other@example.com', { id: '00000000-0000-4000-8000-000000000099', email: 'other@example.com', password: PW, confirmed: true });
  const stranger = await device(browser, 'stranger', 1440, 900);
  await signIn(stranger, 'other@example.com', PW);
  await until(async () => (await stranger.locator('.setting').first().innerText()).includes('Signed in as other@example.com'));
  await go(stranger, '#/');
  check('another account sees none of this data', (await netWorth(stranger)) === '$1,086,650' && (await stored(stranger)).isExample === true);

  // Google sign-in is offered only when the sync service has it switched on
  check('no Google button while Google sign-in is off', (await laptop.getByRole('button', { name: 'Continue with Google' }).count()) === 0);
  server.google = true;
  const visitor = await device(browser, 'visitor', 390, 844);
  await go(visitor, '#/settings');
  check('Google button appears once Google sign-in is on', await until(() => visitor.getByRole('button', { name: 'Continue with Google' }).isVisible()));
  await runAudit(visitor, 'sign-in with Google option @390');
  await visitor.screenshot({ path: path.join(OUT, 'sync-sign-in-390.png') });
  const [request] = await Promise.all([
    visitor.waitForRequest((r) => r.url().includes('/auth/v1/authorize')),
    visitor.getByRole('button', { name: 'Continue with Google' }).click(),
  ]);
  const target = new URL(request.url());
  check('the button starts Google sign-in and returns to this app', target.searchParams.get('provider') === 'google' && target.searchParams.get('redirect_to') === BASE, request.url().slice(0, 140));

  await browser.close();
  console.log(failed === 0 ? '\nAll sync checks passed.' : `\n${failed} sync check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
})();
