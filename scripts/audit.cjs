// Runs inside the page. Measures every rendered text pairing.
module.exports = function audit() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.99) return c;
      if (c && c.a > 0) return { r: -1, g: -1, b: -1, a: c.a };
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const pairs = new Map();
  const failures = [];
  let minFont = Infinity;
  const small = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    if (el.closest('.sr-only, script, style') || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (el.closest('button:disabled')) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10);
    minFont = Math.min(minFont, size);
    if (size < 16) small.push(`${size}px "${n.textContent.trim().slice(0, 30)}"`);
    const isSvg = el instanceof SVGElement;
    const fg = parse(isSvg ? cs.fill : cs.color);
    const bg = bgOf(el);
    if (!fg || bg.r < 0) {
      failures.push(`unmeasurable: "${n.textContent.trim().slice(0, 30)}"`);
      continue;
    }
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const key = `${hex(fg)} on ${hex(bg)}${large ? ' (large)' : ''}`;
    if (!pairs.has(key)) pairs.set(key, Math.round(ratio * 100) / 100);
    if (ratio < need) failures.push(`${key} = ${ratio.toFixed(2)} < ${need}: "${n.textContent.trim().slice(0, 30)}"`);
  }
  // Pseudo-element labels in stacked tables.
  for (const el of document.querySelectorAll('td[data-label]')) {
    const cs = getComputedStyle(el, '::before');
    if (cs.content === 'none' || cs.display === 'none') continue;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    minFont = Math.min(minFont, parseFloat(cs.fontSize));
    pairs.set(`${hex(fg)} on ${hex(bg)}`, Math.round(ratio * 100) / 100);
    if (ratio < 4.5) failures.push(`label ${hex(fg)} on ${hex(bg)} = ${ratio.toFixed(2)}`);
  }
  const de = document.documentElement;
  return {
    pairs: Object.fromEntries(pairs),
    failures,
    minFont,
    small,
    overflowX: de.scrollWidth - de.clientWidth,
  };
};
