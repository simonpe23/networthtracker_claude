const { chromium } = require('playwright');
(async () => {
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:5173/');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `screenshots/prototype/dashboard-${w}.png`, fullPage: true });
  const info = await p.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    const small = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 16).length;
    return {
      nw: cs('.net-worth').fontSize, nwFont: cs('.net-worth').fontFamily, h: cs('.page-heading').fontSize,
      scrollW: document.documentElement.scrollWidth, small,
      fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i),
    };
  });
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
})();
