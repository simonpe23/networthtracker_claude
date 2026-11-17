// End-to-end checks in a real browser, at 1440px and 390px wide.
// Start the app first (npm run dev), then: node scripts/verify.cjs [baseUrl]
// Needs Playwright with Chromium available to Node.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const audit = require('./audit.cjs');

const BASE = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(__dirname, '..', 'screenshots');
const KEY = 'sp-net-worth-tracker';
let failed = 0;
const pairsSeen = {};
let minFont = Infinity;

function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function runAudit(page, label) {
  const r = await page.evaluate(audit);
  Object.assign(pairsSeen, r.pairs);
  minFont = Math.min(minFont, r.minFont);
  const ok = r.failures.length === 0 && r.small.length === 0 && r.overflowX <= 0;
  check(`audit ${label}: contrast, text size, no sideways scroll`, ok, ok ? `min text ${r.minFont}px` : JSON.stringify({ f: r.failures.slice(0, 5), s: r.small.slice(0, 5), o: r.overflowX }));
}

const text = (page, sel) => page.locator(sel).first().innerText();
const pick = async (page, label, option, scope = page) => {
  await scope.getByRole('button', { name: new RegExp(`^${label} `) }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};
// Compare data regardless of key order.
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const go = async (page, hash) => {
  await page.goto(BASE + hash);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
};

async function addHolding(page, { kind, name, balance, category, institution }) {
  await page.getByRole('button', { name: 'Add holding' }).click();
  const dlg = page.getByRole('dialog', { name: 'Add holding' });
  if (kind === 'debt') await dlg.getByRole('button', { name: 'Debt' }).click();
  await dlg.getByLabel('Name').fill(name);
  await dlg.getByLabel(kind === 'debt' ? 'Amount owed' : 'Current balance').fill(balance);
  if (category) await pick(page, 'Category', category, dlg);
  if (institution) {
    await dlg.getByRole('button', { name: 'Add account details (optional)' }).click();
    await dlg.getByLabel('Institution or account').fill(institution);
  }
  await dlg.getByRole('button', { name: 'Save holding' }).click();
}

async function functional(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // Example portfolio
  await go(page, '#/');
  check('first visit shows the labelled example portfolio', (await text(page, '.example-note')).includes('Example portfolio'));
  check('example net worth = assets - debts', (await text(page, '.net-worth')) === '$1,086,650' && (await text(page, '.totals')).replace(/\s+/g, ' ') === 'Total assets $1,104,200 Total debts $17,550');

  // Filters and search
  await page.getByLabel('Search holdings').fill('chase');
  check('search matches name and institution', (await page.locator('.holdings .row').count()) === 2);
  await page.getByLabel('Search holdings').fill('');
  await pick(page, 'Category', 'Index Funds');
  check('category filter', (await page.locator('.holdings .row').count()) === 2 && (await text(page, '.holdings .group')).includes('2 of 8 holdings'));
  await pick(page, 'Category', 'All categories');
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Debts' }).click();
  check('asset or debt filter', (await page.locator('.holdings .row').count()) === 2 && (await text(page, '.holdings .group')).startsWith('Debts'));

  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All', exact: true }).click();

  // Start my portfolio
  await page.getByRole('button', { name: 'Start my portfolio' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start my portfolio' }).click();
  check('start my portfolio empties everything', (await text(page, '.net-worth')) === '$0' && (await page.locator('.example-note').count()) === 0);

  // Validation
  await page.getByRole('button', { name: 'Add holding' }).click();
  await page.getByRole('button', { name: 'Save holding' }).click();
  let dlg = page.getByRole('dialog');
  check('empty form shows clear errors', (await dlg.getByText('Error: Enter a name.').count()) === 1 && (await dlg.getByText('Error: Enter an amount.').count()) === 1);
  await dlg.getByLabel('Current balance').fill('-5');
  check('negative balance is rejected', await dlg.getByText('Error: Enter a number of 0 or more').waitFor({ timeout: 3000 }).then(() => true, () => false));
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  check('cancel adds nothing', (await stored(page)).holdings.length === 0);

  // Add holdings
  await addHolding(page, { kind: 'asset', name: 'Savings', balance: '20,000', category: 'Cash', institution: 'Marcus' });
  await addHolding(page, { kind: 'asset', name: 'Bitcoin', balance: '30000', category: 'Bitcoin' });
  await addHolding(page, { kind: 'asset', name: 'World fund', balance: '50000', category: 'Index Funds' });
  await addHolding(page, { kind: 'debt', name: 'Loan', balance: '12500' });
  check('net worth after adding 3 assets and 1 debt', (await text(page, '.net-worth')) === '$87,500');
  check('totals', (await text(page, '.totals')).replace(/\s+/g, ' ') === 'Total assets $100,000 Total debts $12,500');
  const btcRow = page.locator('.holdings .row', { hasText: 'Bitcoin' }).first();
  check('share uses assets before debts (30,000 / 100,000)', (await btcRow.locator('.share-num').innerText()) === '30.0%');
  check('institution shown under name', (await text(page, '.holdings .row .inst')) === 'Marcus');

  // Persistence
  await page.reload();
  check('data survives a reload', (await text(page, '.net-worth')) === '$87,500' && (await page.locator('.holdings .row').count()) === 4);

  // Snapshot 1
  await page.getByRole('button', { name: 'Take snapshot' }).first().click();
  check('snapshot confirmation', (await text(page, '.notice')).includes('Snapshot saved on'));
  const snap1 = JSON.stringify((await stored(page)).snapshots);

  // Edit: rename, revalue, recategorise
  await page.getByRole('button', { name: 'Edit Savings' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill('Emergency fund');
  await dlg.getByLabel('Current balance').fill('25000');
  await pick(page, 'Category', 'Bitcoin', dlg);
  await dlg.getByRole('button', { name: 'Save changes' }).click();
  check('edit updates name, value and totals', (await text(page, '.net-worth')) === '$92,500' && (await page.locator('.holdings .row', { hasText: 'Emergency fund' }).count()) === 1);

  // Bulk update
  await page.getByRole('button', { name: 'Update balances' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Bitcoin/).fill('45000');
  check('bulk update previews the result', (await dlg.locator('.bulk-summary').innerText()).includes('1 balance changed. Net worth after saving: $107,500'));
  await dlg.getByRole('button', { name: 'Save balances' }).click();
  check('bulk update applied', (await text(page, '.net-worth')) === '$107,500');

  // Allocation targets
  await go(page, '#/allocation');
  await page.getByRole('button', { name: 'Edit categories and targets' }).click();
  const rows = page.locator('.cat-row');
  const setTarget = async (name, v) => {
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      if ((await rows.nth(i).getByLabel('Category name').inputValue()) === name) return rows.nth(i).getByLabel('Target %').fill(v);
    }
    throw new Error('no category ' + name);
  };
  await setTarget('Cash', '25');
  await setTarget('Bitcoin', '25');
  await setTarget('Index Funds', '40');
  await page.getByRole('button', { name: 'Save categories' }).click();
  check('targets that total 90% are refused', (await page.getByText('Error: targets must add up to exactly 100%').count()) === 1 && (await text(page, '.target-total')).includes('Targets total 90%. Add 10% to reach 100%.'));
  await setTarget('Index Funds', '50');
  await page.getByRole('button', { name: 'Add category' }).click();
  await rows.last().getByLabel('Category name').fill('Property');
  await page.getByRole('button', { name: 'Save categories' }).click();
  check('targets that total 100% are saved, new category created', (await page.locator('.cat-row').count()) === 0 && (await stored(page)).categories.some((c) => c.name === 'Property' && c.target === 0));
  const alloc = async (name) => (await page.locator('.allocation tbody tr', { hasText: name }).first().innerText()).replace(/\s+/g, ' ');
  // Assets 120,000: Bitcoin category 70,000, Index Funds 50,000, Cash 0.
  check('over target shown with sign, word and amount', (await alloc('Bitcoin')) === 'Bitcoin $70,000 58.3% 25.0% +33.3 pts over +$40,000 over', await alloc('Bitcoin'));
  check('under target shown with sign, word and amount', (await alloc('Index Funds')) === 'Index Funds $50,000 41.7% 50.0% −8.3 pts under −$10,000 under', await alloc('Index Funds'));
  const colours = await page.evaluate(() => [getComputedStyle(document.querySelector('.over')).color, getComputedStyle(document.querySelector('.under')).color]);
  check('over is #1a6b3c and under is #a3261c', colours[0] === 'rgb(26, 107, 60)' && colours[1] === 'rgb(163, 38, 28)');

  // Delete a holding, then a second snapshot on the same day
  await go(page, '#/');
  const worldId = (await stored(page)).holdings.find((h) => h.name === 'World fund').id;
  const btcId = (await stored(page)).holdings.find((h) => h.name === 'Bitcoin').id;
  await page.getByRole('button', { name: 'Edit World fund' }).click();
  await page.getByRole('button', { name: 'Delete holding' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete holding' }).click();
  check('delete removes the holding from totals', (await text(page, '.net-worth')) === '$57,500');
  await page.getByRole('button', { name: 'Take snapshot' }).first().click();
  const data = await stored(page);
  check('two snapshots on the same day', data.snapshots.length === 2 && data.snapshots[0].takenAt.slice(0, 10) === data.snapshots[1].takenAt.slice(0, 10));
  check('first snapshot is byte-for-byte unchanged after rename, recategorise, revalue and delete', JSON.stringify([data.snapshots[0]]) === snap1);

  // History: expand the original snapshot
  await go(page, '#/history');
  check('history lists both snapshots', (await page.locator('.snapshots tbody tr').count()) === 2);
  await page.getByRole('button', { name: /^View holdings/ }).nth(1).click();
  const detail = (await text(page, '.detail-row')).replace(/\s+/g, ' ');
  check('expanded snapshot shows the original holdings', detail.includes('World fund Index Funds $50,000 50.0%') && detail.includes('Savings (Marcus) Cash $20,000 20.0%') && detail.includes('Loan Debt −$12,500'), detail);
  check('portfolio chart drawn with a line and 2 snapshot dots', (await page.locator('.chart svg circle[fill="#ffc61a"]').count()) === 2 && (await page.locator('.chart svg').count()) === 1);
  const chartColours = await page.evaluate(() => {
    const dot = document.querySelector('.chart svg circle[fill="#ffc61a"]');
    return [dot.getAttribute('stroke'), document.querySelector('.chart').getBoundingClientRect().height];
  });
  check('snapshot dots have a #131313 outline, chart is at least 360px tall', chartColours[0] === '#131313' && chartColours[1] >= 360, `${chartColours[1]}px`);
  check('legend separates daily history from saved snapshots', (await text(page, '.legend')).replace(/\s+/g, ' ') === 'Daily history Saved snapshot');

  // Keyboard-readable chart tooltip
  await page.locator('.chart').focus();
  await page.keyboard.press('ArrowLeft');
  check('chart values can be read with the keyboard', (await page.locator('.tooltip').count()) === 1 && /Saved snapshot|Daily update/.test(await text(page, '.tooltip')));

  // Deleted holding history
  await pick(page, 'Show history for', 'World fund (deleted)');
  check('deleted holding keeps its history', page.url().endsWith(`#/history/${worldId}`) && (await text(page, '.holding-meta')).includes('Deleted on') && (await page.locator('.chart svg').count()) === 2);
  check('deleted holding appears in its snapshot list', (await text(page, '.stack-table tbody')).replace(/\s+/g, ' ').includes('World fund Index Funds $50,000 50.0%'));

  // Per-asset history
  await go(page, `#/history/${btcId}`);
  const heads = await page.locator('.chart-block .sub-heading').allInnerTexts();
  check('per-asset history has value and share charts', heads.join('|') === 'Value over time|Share of total assets over time' && (await page.locator('.chart svg').count()) === 2);
  const series = (await stored(page)).daily.at(-1);
  check('daily history holds today with per-holding values', series.values[btcId] === 45000 && series.totalAssets === 70000 && !(worldId in series.values));

  // Custom date range with the custom calendar
  await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: 'Custom' }).click();
  await page.getByRole('button', { name: /^From / }).click();
  check('custom calendar opens, no native date input', (await page.locator('.calendar').count()) === 1 && (await page.locator('input[type=date], select').count()) === 0);
  await page.keyboard.press('Escape');

  // Currency label
  await go(page, '#/settings');
  await pick(page, 'Currency label', 'EUR, Euro');
  await go(page, '#/');
  check('currency change relabels without converting', (await text(page, '.net-worth')) === '€57,500');
  await go(page, '#/settings');
  check('currency explanation is shown', (await page.locator('.setting', { hasText: 'Currency label' }).innerText()).includes('It does not convert them'));

  // Backup: export, wipe, import
  const before = await stored(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup (JSON)' }).click()]);
  const file = path.join(require('os').tmpdir(), `sp-backup-${Date.now()}.json`);
  await download.saveAs(file);
  check('backup file name', /^sp-net-worth-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel (.xlsx)' }).click()]);
  const xlsxFile = path.join(require('os').tmpdir(), `sp-${Date.now()}.xlsx`);
  await xlsx.saveAs(xlsxFile);
  const sheets = require('child_process').execSync(`unzip -p "${xlsxFile}" xl/workbook.xml`).toString().match(/<sheet [^>]*name="([^"]+)"/g).map((m) => m.match(/name="([^"]+)"/)[1]);
  check('Excel export has the 6 sheets', /^sp-net-worth-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsx.suggestedFilename()) && sheets.join('|') === 'Summary|Holdings|Allocation|Snapshots|Snapshot holdings|Daily history', sheets.join('|'));
  await page.getByRole('button', { name: 'Erase everything and start again' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Erase everything' }).click();
  check('erase empties the portfolio', (await stored(page)).holdings.length === 0 && (await stored(page)).snapshots.length === 0);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace with backup' }).click();
  check('import restores exactly what was exported', canon(await stored(page)) === canon(before));

  // Invalid imports
  const bad = path.join(require('os').tmpdir(), `sp-bad-${Date.now()}.json`);
  fs.writeFileSync(bad, JSON.stringify({ holdings: [{ name: 'A', value: 'lots' }] }));
  await page.locator('input[type=file]').setInputFiles(bad);
  check('invalid backup is refused with the reason', (await text(page, '.setting .error')).includes('holdings[0].value must be a number. Your current data is unchanged.') && canon(await stored(page)) === canon(before));

  // Older total-only snapshots
  const old = path.join(require('os').tmpdir(), `sp-old-${Date.now()}.json`);
  fs.writeFileSync(old, JSON.stringify({ holdings: [{ name: 'Savings', type: 'asset', balance: 500, category: 'Cash' }], snapshots: [{ date: '2024-03-01T10:00:00.000Z', netWorth: 1000 }] }));
  await page.locator('input[type=file]').setInputFiles(old);
  check('older file is recognised', (await text(page, 'dialog')).includes('1 older snapshot with totals only'));
  await page.getByRole('dialog').getByRole('button', { name: 'Replace with backup' }).click();
  await go(page, '#/history');
  await page.getByRole('button', { name: /^View holdings/ }).click();
  check('total-only snapshot kept without invented holdings', (await text(page, '.snapshots tbody')).includes('Not recorded') && (await text(page, '.detail-row')).includes('recorded totals only'));
  const d = await stored(page);
  check('no asset history invented for the old snapshot', d.snapshots[0].holdings === null && d.daily.length === 1 && d.daily[0].date !== '2024-03-01');

  // Visible focus on every control reached with Tab
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  for (const hash of ['#/', '#/allocation', '#/history', '#/settings']) {
    await go(page, hash);
    let bad = 0;
    let count = 0;
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const target = el.matches('.checkbox input') ? el.nextElementSibling : el;
        const cs = getComputedStyle(target);
        return { id: el.outerHTML.slice(0, 120), w: cs.outlineWidth, s: cs.outlineStyle, c: cs.outlineColor, o: cs.outlineOffset };
      });
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      count++;
      if (!(r.w === '2px' && r.s === 'solid' && r.c === 'rgb(19, 19, 19)' && r.o === '2px')) {
        bad++;
        console.log('   focus style missing on', r.id, JSON.stringify(r));
      }
    }
    check(`visible 2px #131313 focus outline on ${count} controls at ${hash}`, bad === 0 && count > 5);
  }

  // Keyboard-only: operate a custom select
  await go(page, '#/');
  await page.getByRole('button', { name: /^Category / }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('custom select works from the keyboard', (await page.getByRole('button', { name: /^Category / }).innerText()).trim() === 'Index Funds');

  check('no browser errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function visual(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = async (name, full = true) => page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: full });
  const tag = (s) => `${s} @${width}`;

  await go(page, '#/');
  const sizes = await page.evaluate(() => ({
    nw: getComputedStyle(document.querySelector('.net-worth')).fontSize,
    nwFont: getComputedStyle(document.querySelector('.net-worth')).fontFamily,
    h: getComputedStyle(document.querySelector('.page-heading')).fontSize,
    totals: getComputedStyle(document.querySelector('.totals')).fontSize,
    body: getComputedStyle(document.body).fontSize,
    left: document.querySelector('main').getBoundingClientRect().left + parseFloat(getComputedStyle(document.querySelector('main')).paddingLeft),
    right: innerWidth - document.querySelector('.holdings').getBoundingClientRect().right,
    chart: document.querySelector('.chart').getBoundingClientRect().height,
    order: [...document.querySelectorAll('main h1, main h2')].map((h) => h.textContent),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  const wide = width >= 1000;
  check(tag(`net worth is ${wide ? 72 : 44}px EB Garamond`), sizes.nw === (wide ? '72px' : '44px') && sizes.nwFont.includes('EB Garamond'), sizes.nw);
  check(tag(`headings ${wide ? 36 : 28}px, totals 20px, body 17px`), sizes.h === (wide ? '36px' : '28px') && sizes.totals === '20px' && sizes.body === '17px');
  check(tag('equal page margins'), Math.abs(sizes.left - sizes.right) < 0.5 && (wide ? sizes.left === 120 : sizes.left === 24), `${sizes.left}px / ${sizes.right}px`);
  check(tag('holdings come before the charts'), sizes.order.join('|') === 'Net worth|Holdings|Portfolio growth|Allocation', sizes.order.join('|'));
  check(tag('page background #f5f4f0'), sizes.bg === 'rgb(245, 244, 240)');
  if (wide) check(tag('chart at least 360px tall'), sizes.chart >= 360, `${sizes.chart}px`);
  await runAudit(page, tag('holdings'));
  await shot('holdings');

  if (!wide) {
    await page.getByRole('button', { name: 'Menu' }).click();
    check(tag('menu button opens the navigation'), await page.getByRole('link', { name: 'Allocation', exact: true }).isVisible());
    await runAudit(page, tag('menu open'));
    await shot('menu', false);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Filters' }).click();
    await runAudit(page, tag('filters open'));
    const row = await page.evaluate(() => {
      const r = document.querySelector('.holdings .row');
      const name = r.querySelector('.c-name').getBoundingClientRect();
      const value = r.querySelector('.c-value').getBoundingClientRect();
      return { sameLine: Math.abs(name.top - value.top) < 6, rightAligned: Math.abs(value.right - (innerWidth - 24)) < 1 };
    });
    check(tag('holding rows are rebuilt: name and value share a line, value right-aligned'), row.sameLine && row.rightAligned);
  }

  // Chart tooltip
  const box = await page.locator('.chart svg').boundingBox();
  await page.locator('.chart').scrollIntoViewIfNeeded();
  const b2 = await page.locator('.chart svg').boundingBox();
  await page.mouse.move(b2.x + b2.width * 0.6, b2.y + b2.height * 0.5);
  await page.waitForTimeout(100);
  check(tag('chart tooltip appears on hover'), (await page.locator('.tooltip').count()) === 1 && box.width > 300);
  await runAudit(page, tag('chart tooltip'));
  await shot('chart-tooltip', false);
  await page.mouse.move(0, 0);

  // Select open
  await page.evaluate(() => scrollTo(0, 0));
  if (!wide && !(await page.getByRole('button', { name: /^Category / }).isVisible())) await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByRole('button', { name: /^Category / }).click();
  await runAudit(page, tag('select open'));
  await shot('select-open', false);
  await page.keyboard.press('Escape');

  // Add holding form with errors
  await page.getByRole('button', { name: 'Add holding' }).click();
  await page.getByRole('button', { name: 'Add account details (optional)' }).click();
  await page.getByRole('button', { name: 'Save holding' }).click();
  await runAudit(page, tag('add holding form with errors'));
  const form = await page.evaluate(() => {
    const d = document.querySelector('dialog');
    const input = d.querySelector('input');
    return { bg: getComputedStyle(d).backgroundColor, input: getComputedStyle(input).backgroundColor, color: getComputedStyle(input).color, fits: d.getBoundingClientRect().right <= innerWidth && d.getBoundingClientRect().left >= 0, size: getComputedStyle(input).fontSize };
  });
  check(tag('form on #ecebe8 surface, white fields, dark text, fits the screen'), form.bg === 'rgb(236, 235, 232)' && form.input === 'rgb(255, 255, 255)' && form.color === 'rgb(0, 0, 0)' && form.fits && form.size === '17px');
  await shot('add-holding', false);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Bulk update
  await page.getByRole('button', { name: 'Update balances' }).click();
  await page.getByRole('dialog').getByLabel(/^Bitcoin/).fill('280000');
  await runAudit(page, tag('bulk update'));
  await shot('update-balances', false);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Allocation
  await go(page, '#/allocation');
  await runAudit(page, tag('allocation'));
  await shot('allocation');
  await page.getByRole('button', { name: 'Edit categories and targets' }).click();
  await page.locator('.cat-row').first().getByLabel('Target %').fill('40');
  await page.getByRole('button', { name: 'Save categories' }).click();
  await runAudit(page, tag('category editor with error'));
  await shot('allocation-edit');

  // History
  await go(page, '#/history');
  await page.getByRole('button', { name: /^View holdings/ }).first().click();
  await runAudit(page, tag('history with expanded snapshot'));
  const panel = await page.evaluate(() => getComputedStyle(document.querySelector('.detail-row .panel')).backgroundColor);
  check(tag('expanded snapshot uses the #ecebe8 surface'), panel === 'rgb(236, 235, 232)');
  await shot('history');
  await page.getByRole('group', { name: 'Date range' }).getByRole('button', { name: 'Custom' }).click();
  await page.getByRole('button', { name: /^From / }).click();
  await runAudit(page, tag('calendar open'));
  await shot('date-picker', false);
  await page.keyboard.press('Escape');

  await go(page, '#/history/ex-btc');
  await runAudit(page, tag('holding history'));
  await shot('history-holding');
  await go(page, '#/history/ex-oldbroker');
  await runAudit(page, tag('deleted holding history'));
  await shot('history-deleted-holding');

  // Settings
  await go(page, '#/settings');
  await runAudit(page, tag('settings'));
  await shot('settings');
  await page.getByRole('button', { name: 'Start my portfolio' }).last().click();
  await runAudit(page, tag('confirm dialog'));
  await page.getByRole('dialog').getByRole('button', { name: 'Start my portfolio' }).click();
  await go(page, '#/');
  await runAudit(page, tag('empty portfolio'));
  await shot('empty-portfolio');
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  await functional(browser);
  await visual(browser, 1440, 900);
  await visual(browser, 390, 844);
  await browser.close();
  console.log('\nRendered text pairings (contrast ratio):');
  for (const [k, v] of Object.entries(pairsSeen).sort((a, b) => a[1] - b[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`Smallest rendered text: ${minFont}px`);
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
})();
