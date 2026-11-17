import type { AppData, Category, Holding } from '../types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sums in whole cents so repeated additions never drift. */
export const sum = (values: number[]) => values.reduce((s, v) => s + Math.round(v * 100), 0) / 100;

export interface Totals {
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
}

export function totals(holdings: Pick<Holding, 'kind' | 'value'>[]): Totals {
  const totalAssets = sum(holdings.filter((h) => h.kind === 'asset').map((h) => h.value));
  const totalDebts = sum(holdings.filter((h) => h.kind === 'debt').map((h) => h.value));
  return { totalAssets, totalDebts, netWorth: round2(totalAssets - totalDebts) };
}

/** Percentage of total assets (before debts). null when there are no assets. */
export function share(value: number, totalAssets: number): number | null {
  return totalAssets > 0 ? (value / totalAssets) * 100 : null;
}

export interface AllocationRow {
  id: string | null; // null is the uncategorised bucket
  name: string;
  count: number;
  value: number;
  actual: number; // percent of total assets
  target: number | null; // percent
  diffPct: number | null; // actual minus target, in percentage points
  diffAmount: number | null; // value minus target value, in money
}

export function allocation(data: Pick<AppData, 'holdings' | 'categories'>): AllocationRow[] {
  const assets = data.holdings.filter((h) => h.kind === 'asset');
  const totalAssets = sum(assets.map((h) => h.value));
  const known = new Set(data.categories.map((c) => c.id));
  const row = (id: string | null, name: string, target: number | null, members: Holding[]): AllocationRow => {
    const value = sum(members.map((h) => h.value));
    const actual = share(value, totalAssets) ?? 0;
    return {
      id,
      name,
      count: members.length,
      value,
      actual,
      target,
      diffPct: target === null ? null : actual - target,
      diffAmount: target === null ? null : round2(value - (target / 100) * totalAssets),
    };
  };
  const rows = data.categories.map((c) => row(c.id, c.name, c.target, assets.filter((h) => h.categoryId === c.id)));
  const loose = assets.filter((h) => h.categoryId === null || !known.has(h.categoryId));
  if (loose.length > 0) {
    const anyTarget = data.categories.some((c) => c.target !== null);
    rows.push(row(null, 'Uncategorised', anyTarget ? 0 : null, loose));
  }
  return rows;
}

export const hasTargets = (categories: Category[]) => categories.some((c) => c.target !== null);

export const targetTotal = (categories: Pick<Category, 'target'>[]) =>
  round2(categories.reduce((s, c) => s + (c.target ?? 0), 0));

/** Targets are valid when none are set, or when they add up to exactly 100. */
export function targetsValid(categories: Pick<Category, 'target'>[]): boolean {
  if (categories.every((c) => c.target === null)) return true;
  return Math.abs(targetTotal(categories) - 100) < 0.005;
}
