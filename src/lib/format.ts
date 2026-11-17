const MINUS = '−';

export interface Fmt {
  money: (n: number) => string;
  signedMoney: (n: number) => string;
  axisMoney: (ticks: number[]) => (n: number) => string;
  currency: string;
}

export function makeFmt(currency: string, showCents: boolean): Fmt {
  const digits = showCents ? 2 : 0;
  const make = (opts: Intl.NumberFormatOptions) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...opts });
    } catch {
      return new Intl.NumberFormat('en-US', opts);
    }
  };
  const full = make({ minimumFractionDigits: digits, maximumFractionDigits: digits });
  const withSign = (n: number, s: string) => (n < 0 ? MINUS + s : s);
  const money = (n: number) => withSign(n, full.format(Math.abs(n)));
  return {
    currency,
    money,
    signedMoney: (n) => (n < 0 ? MINUS : '+') + full.format(Math.abs(n)),
    // Short axis labels, with just enough decimals that every tick reads differently.
    axisMoney: (ticks) => {
      for (const d of [0, 1, 2, 3]) {
        const f = make({ notation: 'compact', maximumFractionDigits: d });
        const labels = ticks.map((t) => f.format(Math.abs(t)));
        if (new Set(labels).size === ticks.length) return (n) => withSign(n, f.format(Math.abs(n)));
      }
      return money;
    },
  };
}

export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

/** Signed percentage points, e.g. "+4.3 pts". */
export const signedPts = (n: number) => `${n < 0 ? MINUS : '+'}${Math.abs(n).toFixed(1)} pts`;

export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s,]/g, '').replace(/^[^\d.-]+/, '');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 1e13) return null;
  return Math.round(n * 100) / 100;
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export const fmtDate = (d: Date | string) => dateFmt.format(typeof d === 'string' ? (d.length === 10 ? parseLocalDate(d) : new Date(d)) : d);
export const fmtShortDate = (d: Date) => shortFmt.format(d);
export const fmtMonth = (d: Date) => monthFmt.format(d);
export const fmtTime = (d: Date | string) => timeFmt.format(typeof d === 'string' ? new Date(d) : d);
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
