import type { AppData, DailyEntry, Snapshot, SnapshotHolding } from '../types';
import { inAllocation, round2, sum } from './calc';

/** Categories currently left out of net worth, as ids and names. */
export interface Exclusion {
  active: boolean;
  ids: Set<string>;
  names: Set<string>;
  label: string; // "Car Value and Retirement"
}

const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '');

export function makeExclusion(data: Pick<AppData, 'categories'>, hidden: Set<string>): Exclusion {
  const cats = data.categories.filter((c) => !inAllocation(c) && hidden.has(c.id));
  return { active: cats.length > 0, ids: new Set(cats.map((c) => c.id)), names: new Set(cats.map((c) => c.name)), label: listNames(cats.map((c) => c.name)) };
}

/** Matched by category id when the snapshot recorded it, otherwise by the category name it was saved with. */
export function snapshotHoldingExcluded(h: SnapshotHolding, ex: Exclusion): boolean {
  if (!ex.active || h.kind !== 'asset') return false;
  return h.categoryId ? ex.ids.has(h.categoryId) : h.category !== null && ex.names.has(h.category);
}

export interface AdjustedTotals {
  netWorth: number;
  totalAssets: number | null;
  totalDebts: number | null;
  excluded: number;
}

/**
 * A snapshot's totals with excluded categories taken out. The snapshot itself never
 * changes. Returns null for an older total-only snapshot, which cannot be split.
 */
export function adjustSnapshot(s: Snapshot, ex: Exclusion): AdjustedTotals | null {
  if (!ex.active) return { netWorth: s.netWorth, totalAssets: s.totalAssets, totalDebts: s.totalDebts, excluded: 0 };
  if (!s.holdings) return null;
  const excluded = sum(s.holdings.filter((h) => snapshotHoldingExcluded(h, ex)).map((h) => h.value));
  return {
    netWorth: round2(s.netWorth - excluded),
    totalAssets: s.totalAssets === null ? null : round2(s.totalAssets - excluded),
    totalDebts: s.totalDebts,
    excluded,
  };
}

/** Amount to take out of each day of the automatic history. */
export function dailyExcluder(data: Pick<AppData, 'holdings' | 'removedHoldings'>, ex: Exclusion): (d: DailyEntry) => number {
  if (!ex.active) return () => 0;
  const ids = new Set<string>();
  for (const h of data.holdings) if (h.kind === 'asset' && h.categoryId !== null && ex.ids.has(h.categoryId)) ids.add(h.id);
  for (const h of data.removedHoldings) if (h.kind === 'asset' && h.category !== null && ex.names.has(h.category)) ids.add(h.id);
  return (d) => sum(Object.entries(d.values).filter(([id]) => ids.has(id)).map(([, v]) => v));
}
