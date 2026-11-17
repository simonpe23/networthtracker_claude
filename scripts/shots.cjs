// Quick look at every page at both widths. Usage: node scripts/shots.cjs [outDir]
const { chromium } = require('playwright');
const out = process.argv[2] || 'screenshots';
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
    p.on('pageerror', (e) => console.log('page error:', e.message));
    for (const [name, hash] of [['holdings', '#/'], ['allocation', '#/allocation'], ['history', '#/history'], ['history-holding', '#/history/ex-btc'], ['settings', '#/settings']]) {
      await p.goto('http://localhost:5173/' + hash);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await b.close();
})();
