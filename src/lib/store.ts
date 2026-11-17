import type { AppData, Category, DailyEntry, Holding, Kind, Snapshot } from '../types';
import { share, totals } from './calc';
import { localDate } from './format';
import { buildExample } from './sample';

export const STORAGE_KEY = 'sp-net-worth-tracker';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const DEFAULT_CATEGORY_NAMES = ['Cash', 'Bitcoin', 'High Risk', 'Index Funds'];

export function emptyData(categories?: Category[]): AppData {
  return {
    app: 'sp-net-worth-tracker',
    version: 2,
    currency: 'USD',
    showCents: false,
    isExample: false,
    categories: categories ?? DEFAULT_CATEGORY_NAMES.map((name) => ({ id: uid(), name, target: null, inAllocation: true })),
    holdings: [],
    removedHoldings: [],
    daily: [],
    snapshots: [],
  };
}

export interface HoldingInput {
  kind: Kind;
  name: string;
  institution: string;
  notes: string;
  categoryId: string | null;
  value: number;
}

export type Action =
  | { type: 'addHolding'; input: HoldingInput }
  | { type: 'updateHolding'; id: string; input: Omit<HoldingInput, 'kind'> }
  | { type: 'deleteHolding'; id: string }
  | { type: 'bulkUpdate'; values: Record<string, number> }
  | { type: 'saveCategories'; categories: Category[] }
  | { type: 'takeSnapshot' }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'setCurrency'; currency: string }
  | { type: 'setShowCents'; value: boolean }
  | { type: 'startFresh' }
  | { type: 'loadExample' }
  | { type: 'replace'; data: AppData }
  | { type: 'tick' };

/** Writes today's entry in the automatic daily history from the current balances. */
export function recordToday(data: AppData, now: Date): AppData {
  if (data.holdings.length === 0 && data.daily.length === 0) return data;
  const date = localDate(now);
  const entry: DailyEntry = {
    date,
    ...totals(data.holdings),
    values: Object.fromEntries(data.holdings.map((h) => [h.id, h.value])),
  };
  const daily = data.daily.filter((d) => d.date !== date);
  daily.push(entry);
  daily.sort((a, b) => a.date.localeCompare(b.date));
  return { ...data, daily };
}

/** A self-contained copy: it stores names, categories and values, not references. */
export function buildSnapshot(data: AppData, now: Date): Snapshot {
  const t = totals(data.holdings);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  return {
    id: uid(),
    takenAt: now.toISOString(),
    ...t,
    holdings: data.holdings.map((h) => ({
      holdingId: h.id,
      name: h.name,
      institution: h.institution,
      kind: h.kind,
      category: h.kind === 'asset' ? (h.categoryId ? catName.get(h.categoryId) ?? null : null) : null,
      categoryId: h.kind === 'asset' ? h.categoryId : null,
      value: h.value,
      pct: h.kind === 'asset' ? share(h.value, t.totalAssets) : null,
    })),
  };
}

export function reduce(data: AppData, action: Action, now: Date = new Date()): AppData {
  const stamp = now.toISOString();
  switch (action.type) {
    case 'addHolding': {
      const input = action.input;
      const holding: Holding = {
        ...input,
        id: uid(),
        categoryId: input.kind === 'asset' ? input.categoryId : null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      return recordToday({ ...data, holdings: [...data.holdings, holding] }, now);
    }
    case 'updateHolding': {
      const holdings = data.holdings.map((h) =>
        h.id === action.id
          ? { ...h, ...action.input, categoryId: h.kind === 'asset' ? action.input.categoryId : null, updatedAt: stamp }
          : h,
      );
      return recordToday({ ...data, holdings }, now);
    }
    case 'deleteHolding': {
      const h = data.holdings.find((x) => x.id === action.id);
      if (!h) return data;
      const next = recordToday({ ...data, holdings: data.holdings.filter((x) => x.id !== h.id) }, now);
      const hasHistory =
        next.daily.some((d) => h.id in d.values) || next.snapshots.some((s) => s.holdings?.some((x) => x.holdingId === h.id));
      if (!hasHistory) return next;
      const category = data.categories.find((c) => c.id === h.categoryId)?.name ?? null;
      return {
        ...next,
        removedHoldings: [...next.removedHoldings, { id: h.id, kind: h.kind, name: h.name, category, deletedAt: stamp }],
      };
    }
    case 'bulkUpdate': {
      const holdings = data.holdings.map((h) =>
        h.id in action.values && action.values[h.id] !== h.value ? { ...h, value: action.values[h.id], updatedAt: stamp } : h,
      );
      return recordToday({ ...data, holdings }, now);
    }
    case 'saveCategories': {
      const ids = new Set(action.categories.map((c) => c.id));
      const holdings = data.holdings.map((h) => (h.categoryId && !ids.has(h.categoryId) ? { ...h, categoryId: null } : h));
      return { ...data, categories: action.categories, holdings };
    }
    case 'takeSnapshot':
      return { ...data, snapshots: [...data.snapshots, buildSnapshot(data, now)] };
    case 'deleteSnapshot':
      return { ...data, snapshots: data.snapshots.filter((s) => s.id !== action.id) };
    case 'setCurrency':
      return { ...data, currency: action.currency };
    case 'setShowCents':
      return { ...data, showCents: action.value };
    case 'startFresh': {
      const fresh = emptyData(data.categories.map((c) => ({ ...c, target: null })));
      return { ...fresh, currency: data.currency, showCents: data.showCents };
    }
    case 'loadExample':
      return { ...buildExample(now), currency: data.currency, showCents: data.showCents };
    case 'replace':
      return recordToday(action.data, now);
    case 'tick':
      return recordToday(data, now);
  }
}

export interface HistoryPoint {
  date: string;
  value: number;
  pct: number | null;
}

/** Daily history of one holding, including holdings that were later deleted. */
export function holdingSeries(data: AppData, id: string): HistoryPoint[] {
  const kind = data.holdings.find((h) => h.id === id)?.kind ?? data.removedHoldings.find((h) => h.id === id)?.kind;
  return data.daily
    .filter((d) => id in d.values)
    .map((d) => ({
      date: d.date,
      value: d.values[id],
      pct: kind === 'asset' ? share(d.values[id], d.totalAssets) : null,
    }));
}
