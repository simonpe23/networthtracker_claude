import type { AppData, DailyEntry, Holding, Kind, Snapshot } from '../types';
import { share, totals } from './calc';
import { localDate } from './format';

// Deterministic pseudo-random numbers, so the example looks the same on every visit.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spec {
  id: string;
  kind: Kind;
  name: string;
  institution: string;
  cat: string | null;
  value: number;
  /** Value one year ago as a multiple of the latest value. */
  start: number;
  /** Day-to-day movement. 0 gives a smooth line. */
  vol: number;
  /** First and last day (in days ago) with a recorded balance. */
  from?: number;
  until?: number;
}

const DAYS = 365;

const CATS: { id: string; name: string; target: number | null; inAllocation: boolean }[] = [
  { id: 'ex-cat-index', name: 'Index Funds', target: 55, inAllocation: true },
  { id: 'ex-cat-btc', name: 'Bitcoin', target: 20, inAllocation: true },
  { id: 'ex-cat-cash', name: 'Cash', target: 15, inAllocation: true },
  { id: 'ex-cat-risk', name: 'High Risk', target: 10, inAllocation: true },
  // Counted in net worth, kept out of the allocation percentages.
  { id: 'ex-cat-other', name: 'Other', target: null, inAllocation: false },
];

const SPECS: Spec[] = [
  { id: 'ex-global', kind: 'asset', name: 'Global index fund', institution: 'Interactive Brokers', cat: 'ex-cat-index', value: 412300, start: 0.8, vol: 0.006 },
  { id: 'ex-btc', kind: 'asset', name: 'Bitcoin', institution: 'Cold wallet', cat: 'ex-cat-btc', value: 268400, start: 0.62, vol: 0.022 },
  { id: 'ex-sp500', kind: 'asset', name: 'S&P 500 fund', institution: 'Interactive Brokers', cat: 'ex-cat-index', value: 186750, start: 0.78, vol: 0.007 },
  { id: 'ex-savings', kind: 'asset', name: 'Savings account', institution: 'Marcus', cat: 'ex-cat-cash', value: 94200, start: 0.74, vol: 0 },
  { id: 'ex-angel', kind: 'asset', name: 'Angel investments', institution: '', cat: 'ex-cat-risk', value: 60000, start: 0.75, vol: 0 },
  { id: 'ex-alts', kind: 'asset', name: 'Altcoins', institution: 'Kraken', cat: 'ex-cat-risk', value: 41900, start: 0.7, vol: 0.03, from: 200 },
  { id: 'ex-car', kind: 'asset', name: 'Car', institution: '', cat: 'ex-cat-other', value: 22000, start: 1.16, vol: 0 },
  { id: 'ex-checking', kind: 'asset', name: 'Checking account', institution: 'Chase', cat: 'ex-cat-cash', value: 18650, start: 0.9, vol: 0.02 },
  { id: 'ex-carloan', kind: 'debt', name: 'Car loan', institution: 'Chase', cat: null, value: 14300, start: 1.42, vol: 0 },
  { id: 'ex-card', kind: 'debt', name: 'Credit card', institution: 'Amex', cat: null, value: 3250, start: 0.8, vol: 0.05 },
  // Deleted 120 days ago. Its recorded history stays available.
  { id: 'ex-oldbroker', kind: 'asset', name: 'Old brokerage account', institution: 'Robinhood', cat: 'ex-cat-risk', value: 12400, start: 0.85, vol: 0.012, until: 121 },
];

/** A path of DAYS + 1 values that begins at value * start and ends at value. */
function path(spec: Spec, rand: () => number): number[] {
  const steps: number[] = [0];
  for (let i = 1; i <= DAYS; i++) steps.push(steps[i - 1] + (rand() - 0.5) * 2 * spec.vol);
  const logStart = Math.log(spec.start);
  return steps.map((s, i) => {
    const f = i / DAYS;
    const w = s - f * steps[DAYS] + (1 - f) * logStart;
    return i === DAYS ? spec.value : Math.round(spec.value * Math.exp(w));
  });
}

export function buildExample(now: Date): AppData {
  const rand = mulberry32(20261117);
  const paths = new Map(SPECS.map((s) => [s.id, path(s, rand)]));
  const dayAt = (daysAgo: number, h = 12, m = 0) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m);
    return d;
  };
  const live = (s: Spec, daysAgo: number) => daysAgo <= (s.from ?? DAYS) && daysAgo >= (s.until ?? 0);
  const catName = new Map(CATS.map((c) => [c.id, c.name]));

  const daily: DailyEntry[] = [];
  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const members = SPECS.filter((s) => live(s, daysAgo)).map((s) => ({ id: s.id, kind: s.kind, value: paths.get(s.id)![DAYS - daysAgo] }));
    daily.push({
      date: localDate(dayAt(daysAgo)),
      ...totals(members),
      values: Object.fromEntries(members.map((m) => [m.id, m.value])),
    });
  }

  const snapshotAt = (daysAgo: number, h: number, m: number): Snapshot => {
    const members = SPECS.filter((s) => live(s, daysAgo));
    const valued = members.map((s) => ({ s, value: paths.get(s.id)![DAYS - daysAgo] }));
    const t = totals(valued.map((v) => ({ kind: v.s.kind, value: v.value })));
    return {
      id: `ex-snap-${daysAgo}`,
      takenAt: dayAt(daysAgo, h, m).toISOString(),
      ...t,
      holdings: valued.map(({ s, value }) => ({
        holdingId: s.id,
        name: s.name,
        institution: s.institution,
        kind: s.kind,
        category: s.cat ? catName.get(s.cat)! : null,
        value,
        pct: s.kind === 'asset' ? share(value, t.totalAssets) : null,
      })),
    };
  };

  const created = dayAt(DAYS).toISOString();
  const holdings: Holding[] = SPECS.filter((s) => s.until === undefined).map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    institution: s.institution,
    notes: '',
    categoryId: s.cat,
    value: s.value,
    createdAt: s.from ? dayAt(s.from).toISOString() : created,
    updatedAt: now.toISOString(),
  }));

  return {
    app: 'sp-net-worth-tracker',
    version: 2,
    currency: 'USD',
    showCents: false,
    isExample: true,
    categories: CATS.map((c) => ({ ...c })),
    holdings,
    removedHoldings: SPECS.filter((s) => s.until !== undefined).map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      category: s.cat ? catName.get(s.cat)! : null,
      deletedAt: dayAt(s.until! - 1).toISOString(),
    })),
    daily,
    snapshots: [
      snapshotAt(320, 18, 30),
      snapshotAt(259, 9, 12),
      snapshotAt(198, 20, 5),
      snapshotAt(137, 17, 48),
      snapshotAt(76, 8, 40),
      snapshotAt(16, 19, 15),
    ],
  };
}
