import type { AppData, Category, DailyEntry, Holding, Kind, RemovedHolding, Snapshot, SnapshotHolding } from '../types';
import { round2, totals } from './calc';
import { uid } from './store';

export function exportJson(data: AppData, now: Date = new Date()): string {
  return JSON.stringify({ ...data, exportedAt: now.toISOString() }, null, 2);
}

export type ParseResult = { ok: true; data: AppData; notes: string[] } | { ok: false; error: string };

class Invalid extends Error {}
const fail = (msg: string): never => {
  throw new Invalid(msg);
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const amount = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${path} must be a number.`);
  return round2(v);
};
const optAmount = (v: unknown, path: string) => (v === undefined || v === null ? null : amount(v, path));
const list = (v: unknown, path: string): unknown[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : fail(`${path} must be a list.`);
};
const isoTime = (v: unknown, path: string): string => {
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return fail(`${path} must be a valid date.`);
  return d.toISOString();
};
const kindOf = (v: unknown, path: string): Kind => {
  if (v === 'asset' || v === 'debt') return v;
  if (v === 'liability') return 'debt';
  return fail(`${path} must be "asset" or "debt".`);
};

/**
 * Checks a backup file and converts it to the current format.
 * Accepts current backups (version 2) and older files (version 1 or no version),
 * where holdings may use "type" and "balance" and name their category directly,
 * and snapshots may hold totals only.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  try {
    return normalise(raw);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

function normalise(raw: unknown): ParseResult {
  if (!isObj(raw)) return fail('The file must contain a single JSON object.');
  if (raw.app !== undefined && raw.app !== 'sp-net-worth-tracker') fail('This is not an SP Net Worth Tracker backup.');
  const version = raw.version === undefined ? 1 : raw.version;
  if (version !== 1 && version !== 2) fail(`Backup version ${String(version)} is not supported by this version of the app.`);
  if (!Array.isArray(raw.holdings) && !Array.isArray(raw.snapshots)) fail('The file has no "holdings" or "snapshots" list.');
  const notes: string[] = [];

  // Categories
  const categories: Category[] = [];
  const byName = new Map<string, Category>();
  const catIds = new Set<string>();
  list(raw.categories, 'categories').forEach((c, i) => {
    const o = isObj(c) ? c : typeof c === 'string' ? { name: c } : fail(`categories[${i}] must be an object.`);
    const name = str(o.name) || fail(`categories[${i}].name is missing.`);
    if (byName.has(name.toLowerCase())) fail(`categories[${i}].name "${name}" appears twice.`);
    const target = optAmount(o.target ?? o.targetPercent, `categories[${i}].target`);
    if (target !== null && (target < 0 || target > 100)) fail(`categories[${i}].target must be between 0 and 100.`);
    let id = str(o.id) || uid();
    if (catIds.has(id)) id = uid();
    catIds.add(id);
    // Older files have no flag: every category then counts in the allocation.
    const inAlloc = o.inAllocation !== false;
    const cat = { id, name, target: inAlloc ? target : null, inAllocation: inAlloc };
    categories.push(cat);
    byName.set(name.toLowerCase(), cat);
  });
  const targetSum = round2(categories.reduce((s, c) => s + (c.target ?? 0), 0));
  if (categories.some((c) => c.target !== null) && Math.abs(targetSum - 100) >= 0.005) {
    notes.push(`Category targets total ${targetSum}%, not 100%. Fix them on the Allocation page.`);
  }
  const categoryByName = (name: string) => {
    let cat = byName.get(name.toLowerCase());
    if (!cat) {
      cat = { id: uid(), name, target: null, inAllocation: true };
      categories.push(cat);
      byName.set(name.toLowerCase(), cat);
      catIds.add(cat.id);
    }
    return cat;
  };

  // Holdings
  const holdingIds = new Set<string>();
  const holdings: Holding[] = list(raw.holdings, 'holdings').map((h, i) => {
    if (!isObj(h)) return fail(`holdings[${i}] must be an object.`);
    const path = `holdings[${i}]`;
    const kind = kindOf(h.kind ?? h.type ?? 'asset', `${path}.kind`);
    const name = str(h.name) || fail(`${path}.name is missing.`);
    const value = amount(h.value ?? h.balance, `${path}.value`);
    if (value < 0) fail(`${path}.value must be 0 or more. Record debts as type "debt" with a positive amount.`);
    const id = str(h.id) || uid();
    if (holdingIds.has(id)) fail(`${path}.id "${id}" appears twice.`);
    holdingIds.add(id);
    let categoryId: string | null = null;
    if (kind === 'asset') {
      if (typeof h.categoryId === 'string' && catIds.has(h.categoryId)) categoryId = h.categoryId;
      else if (str(h.category)) categoryId = categoryByName(str(h.category)).id;
    }
    const createdAt = h.createdAt === undefined ? new Date().toISOString() : isoTime(h.createdAt, `${path}.createdAt`);
    return {
      id,
      kind,
      name,
      institution: str(h.institution ?? h.account),
      notes: str(h.notes),
      categoryId,
      value,
      createdAt,
      updatedAt: h.updatedAt === undefined ? createdAt : isoTime(h.updatedAt, `${path}.updatedAt`),
    };
  });

  const removedHoldings: RemovedHolding[] = list(raw.removedHoldings, 'removedHoldings').map((h, i) => {
    if (!isObj(h)) return fail(`removedHoldings[${i}] must be an object.`);
    const path = `removedHoldings[${i}]`;
    const id = str(h.id) || fail(`${path}.id is missing.`);
    if (holdingIds.has(id)) fail(`${path}.id "${id}" is also a current holding.`);
    return {
      id,
      kind: kindOf(h.kind, `${path}.kind`),
      name: str(h.name) || fail(`${path}.name is missing.`),
      category: str(h.category) || null,
      deletedAt: isoTime(h.deletedAt, `${path}.deletedAt`),
    };
  });

  // Automatic daily history
  const days = new Set<string>();
  const daily: DailyEntry[] = list(raw.daily, 'daily').map((d, i) => {
    if (!isObj(d)) return fail(`daily[${i}] must be an object.`);
    const path = `daily[${i}]`;
    const date = str(d.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) fail(`${path}.date must look like 2026-11-17.`);
    if (days.has(date)) fail(`${path}.date ${date} appears twice.`);
    days.add(date);
    const values: Record<string, number> = {};
    if (d.values !== undefined) {
      if (!isObj(d.values)) fail(`${path}.values must be an object.`);
      for (const [k, v] of Object.entries(d.values as Obj)) values[k] = amount(v, `${path}.values.${k}`);
    }
    const totalAssets = amount(d.totalAssets, `${path}.totalAssets`);
    const totalDebts = amount(d.totalDebts, `${path}.totalDebts`);
    return { date, totalAssets, totalDebts, netWorth: round2(totalAssets - totalDebts), values };
  });
  daily.sort((a, b) => a.date.localeCompare(b.date));

  // Saved snapshots
  let totalOnly = 0;
  const snapshots: Snapshot[] = list(raw.snapshots, 'snapshots').map((s, i) => {
    if (!isObj(s)) return fail(`snapshots[${i}] must be an object.`);
    const path = `snapshots[${i}]`;
    const takenAt = isoTime(s.takenAt ?? s.date ?? s.createdAt, `${path}.takenAt`);
    const totalAssets = optAmount(s.totalAssets ?? s.assets, `${path}.totalAssets`);
    const totalDebts = optAmount(s.totalDebts ?? s.debts, `${path}.totalDebts`);
    const stated = optAmount(s.netWorth ?? s.total, `${path}.netWorth`);
    const netWorth =
      stated ?? (totalAssets !== null && totalDebts !== null ? round2(totalAssets - totalDebts) : fail(`${path} has no net worth or totals.`));
    let rows: SnapshotHolding[] | null = null;
    if (Array.isArray(s.holdings)) {
      rows = s.holdings.map((h, j) => {
        if (!isObj(h)) return fail(`${path}.holdings[${j}] must be an object.`);
        const p = `${path}.holdings[${j}]`;
        const kind = kindOf(h.kind ?? h.type ?? 'asset', `${p}.kind`);
        return {
          holdingId: str(h.holdingId ?? h.id) || uid(),
          name: str(h.name) || fail(`${p}.name is missing.`),
          institution: str(h.institution),
          kind,
          category: kind === 'asset' ? str(h.category) || null : null,
          value: amount(h.value ?? h.balance, `${p}.value`),
          pct: kind === 'asset' ? optAmountRaw(h.pct, `${p}.pct`) : null,
        };
      });
      // Fill in a missing percentage only when the snapshot itself holds everything needed.
      const assets = totalAssets ?? totals(rows).totalAssets;
      rows = rows.map((r) => (r.kind === 'asset' && r.pct === null && assets > 0 ? { ...r, pct: (r.value / assets) * 100 } : r));
    } else {
      totalOnly++;
    }
    return { id: str(s.id) || uid(), takenAt, netWorth, totalAssets, totalDebts, holdings: rows };
  });
  snapshots.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (totalOnly > 0) {
    notes.push(`${totalOnly} older snapshot${totalOnly === 1 ? '' : 's'} with totals only. Kept as recorded, without holdings.`);
  }

  const currency = /^[A-Z]{3}$/.test(str(raw.currency)) ? str(raw.currency) : 'USD';
  return {
    ok: true,
    notes,
    data: {
      app: 'sp-net-worth-tracker',
      version: 2,
      currency,
      showCents: raw.showCents === true,
      isExample: raw.isExample === true,
      categories,
      holdings,
      removedHoldings,
      daily,
      snapshots,
    },
  };
}

function optAmountRaw(v: unknown, path: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`${path} must be a number.`);
  return v;
}
