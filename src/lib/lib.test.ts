import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { allocation, targetsValid, targetTotal, totals } from './calc';
import { exportJson, parseBackup } from './backup';
import { parseAmount } from './format';
import { buildExample } from './sample';
import { emptyData, holdingSeries, reduce } from './store';
import { decide, EMPTY_META, type SyncMeta } from './syncLogic';

const day = (d: number, h = 10) => new Date(2026, 10, d, h, 0);

function seed(): AppData {
  let data = emptyData([
    { id: 'cash', name: 'Cash', target: 25 },
    { id: 'btc', name: 'Bitcoin', target: 25 },
    { id: 'index', name: 'Index Funds', target: 50 },
  ]);
  const add = (name: string, value: number, categoryId: string | null, kind: 'asset' | 'debt' = 'asset') => {
    data = reduce(data, { type: 'addHolding', input: { kind, name, institution: '', notes: '', categoryId, value } }, day(1));
  };
  add('Savings', 20000, 'cash');
  add('Bitcoin', 30000, 'btc');
  add('World fund', 50000, 'index');
  add('Loan', 12500.5, null, 'debt');
  return data;
}
const idOf = (data: AppData, name: string) => data.holdings.find((h) => h.name === name)!.id;

describe('calculations', () => {
  it('net worth is assets minus debts', () => {
    expect(totals(seed().holdings)).toEqual({ totalAssets: 100000, totalDebts: 12500.5, netWorth: 87499.5 });
  });

  it('sums cents without floating point drift', () => {
    const t = totals([
      { kind: 'asset', value: 0.1 },
      { kind: 'asset', value: 0.2 },
      { kind: 'debt', value: 0.3 },
    ]);
    expect(t).toEqual({ totalAssets: 0.3, totalDebts: 0.3, netWorth: 0 });
  });

  it('allocation uses total assets before debts', () => {
    const rows = allocation(seed());
    expect(rows.map((r) => [r.name, r.actual, r.target, r.diffPct, r.diffAmount])).toEqual([
      ['Cash', 20, 25, -5, -5000],
      ['Bitcoin', 30, 25, 5, 5000],
      ['Index Funds', 50, 50, 0, 0],
    ]);
    expect(rows.reduce((s, r) => s + r.actual, 0)).toBe(100);
  });

  it('puts assets without a category in an uncategorised bucket', () => {
    const data = reduce(seed(), { type: 'saveCategories', categories: seed().categories.filter((c) => c.id !== 'btc') });
    const rows = allocation(data);
    expect(rows.at(-1)).toMatchObject({ id: null, name: 'Uncategorised', value: 30000, actual: 30 });
  });

  it('targets must total 100 or all be empty', () => {
    expect(targetsValid([{ target: 60 }, { target: 40 }])).toBe(true);
    expect(targetsValid([{ target: 33.33 }, { target: 33.33 }, { target: 33.34 }])).toBe(true);
    expect(targetsValid([{ target: 60 }, { target: 30 }])).toBe(false);
    expect(targetsValid([{ target: 60 }, { target: null }])).toBe(false);
    expect(targetsValid([{ target: null }, { target: null }])).toBe(true);
    expect(targetTotal([{ target: 60 }, { target: 30 }])).toBe(90);
  });

  it('parses typed amounts', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('$ 5000')).toBe(5000);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});

describe('portfolio editing', () => {
  it('adds, edits and deletes holdings', () => {
    let data = seed();
    expect(data.holdings).toHaveLength(4);
    const id = idOf(data, 'Savings');
    data = reduce(data, { type: 'updateHolding', id, input: { name: 'Emergency fund', institution: 'Marcus', notes: '', categoryId: 'cash', value: 25000 } }, day(2));
    expect(data.holdings.find((h) => h.id === id)).toMatchObject({ name: 'Emergency fund', value: 25000, institution: 'Marcus' });
    expect(totals(data.holdings).totalAssets).toBe(105000);
    data = reduce(data, { type: 'deleteHolding', id }, day(3));
    expect(data.holdings).toHaveLength(3);
    expect(totals(data.holdings).totalAssets).toBe(80000);
  });

  it('bulk update changes several balances at once', () => {
    let data = seed();
    data = reduce(data, { type: 'bulkUpdate', values: { [idOf(data, 'Bitcoin')]: 45000, [idOf(data, 'Loan')]: 10000 } }, day(2));
    expect(totals(data.holdings)).toEqual({ totalAssets: 115000, totalDebts: 10000, netWorth: 105000 });
  });
});

describe('daily history', () => {
  it('keeps one entry per day and overwrites it during the day', () => {
    let data = seed();
    expect(data.daily).toHaveLength(1);
    expect(data.daily[0]).toMatchObject({ date: '2026-11-01', netWorth: 87499.5 });
    data = reduce(data, { type: 'bulkUpdate', values: { [idOf(data, 'Bitcoin')]: 40000 } }, day(1, 15));
    expect(data.daily).toHaveLength(1);
    expect(data.daily[0].totalAssets).toBe(110000);
    data = reduce(data, { type: 'tick' }, day(2));
    expect(data.daily.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('tracks value and share of assets per holding, and keeps them after deletion', () => {
    let data = seed();
    const id = idOf(data, 'Bitcoin');
    data = reduce(data, { type: 'bulkUpdate', values: { [id]: 50000 } }, day(2));
    data = reduce(data, { type: 'deleteHolding', id }, day(3));
    expect(data.holdings.some((h) => h.id === id)).toBe(false);
    expect(data.removedHoldings).toMatchObject([{ id, name: 'Bitcoin', kind: 'asset', category: 'Bitcoin' }]);
    const series = holdingSeries(data, id);
    expect(series.map((p) => [p.date, p.value])).toEqual([
      ['2026-11-01', 30000],
      ['2026-11-02', 50000],
    ]);
    expect(series[0].pct).toBe(30);
    expect(series[1].pct).toBeCloseTo((50000 / 120000) * 100, 10);
    expect(data.daily.at(-1)).toMatchObject({ date: '2026-11-03', totalAssets: 70000 });
  });

  it('gives no share of assets for debts', () => {
    const data = seed();
    expect(holdingSeries(data, idOf(data, 'Loan'))).toEqual([{ date: '2026-11-01', value: 12500.5, pct: null }]);
  });
});

describe('snapshots', () => {
  it('captures totals, holdings, shares and time, and allows several per day', () => {
    let data = seed();
    data = reduce(data, { type: 'takeSnapshot' }, day(5, 9));
    data = reduce(data, { type: 'takeSnapshot' }, day(5, 17));
    expect(data.snapshots).toHaveLength(2);
    const s = data.snapshots[0];
    expect(s).toMatchObject({ totalAssets: 100000, totalDebts: 12500.5, netWorth: 87499.5, takenAt: day(5, 9).toISOString() });
    expect(s.holdings!.map((h) => [h.name, h.category, h.value, h.pct])).toEqual([
      ['Savings', 'Cash', 20000, 20],
      ['Bitcoin', 'Bitcoin', 30000, 30],
      ['World fund', 'Index Funds', 50000, 50],
      ['Loan', null, 12500.5, null],
    ]);
  });

  it('stay unchanged after edits, renames, recategorising and deletion', () => {
    let data = seed();
    data = reduce(data, { type: 'takeSnapshot' }, day(5));
    const before = JSON.stringify(data.snapshots);
    const id = idOf(data, 'Savings');
    data = reduce(data, { type: 'updateHolding', id, input: { name: 'Renamed', institution: 'X', notes: '', categoryId: 'btc', value: 1 } }, day(6));
    data = reduce(data, { type: 'saveCategories', categories: [{ id: 'btc', name: 'Crypto', target: 100 }] }, day(6));
    data = reduce(data, { type: 'deleteHolding', id: idOf(data, 'World fund') }, day(7));
    data = reduce(data, { type: 'bulkUpdate', values: { [idOf(data, 'Bitcoin')]: 99 } }, day(8));
    expect(JSON.stringify(data.snapshots)).toBe(before);
  });
});

describe('backup', () => {
  it('restores an export exactly', () => {
    let data = seed();
    data = reduce(data, { type: 'takeSnapshot' }, day(5));
    data = reduce(data, { type: 'deleteHolding', id: idOf(data, 'Bitcoin') }, day(6));
    const result = parseBackup(exportJson(data));
    expect(result.ok && result.data).toEqual(data);
  });

  it('restores the example portfolio exactly', () => {
    const data = buildExample(day(17));
    const result = parseBackup(exportJson(data));
    expect(result.ok && result.data).toEqual(data);
    expect(data.daily).toHaveLength(366);
    expect(data.daily.at(-1)).toMatchObject(totals(data.holdings));
  });

  it('rejects files that are not valid backups, naming the problem', () => {
    const err = (text: string) => {
      const r = parseBackup(text);
      return r.ok ? 'ok' : r.error;
    };
    expect(err('nope')).toBe('This file is not valid JSON.');
    expect(err('[]')).toBe('The file must contain a single JSON object.');
    expect(err('{"app":"other","holdings":[]}')).toBe('This is not an SP Net Worth Tracker backup.');
    expect(err('{"version":9,"holdings":[]}')).toBe('Backup version 9 is not supported by this version of the app.');
    expect(err('{"foo":1}')).toBe('The file has no "holdings" or "snapshots" list.');
    expect(err('{"holdings":[{"name":"A","value":"12"}]}')).toBe('holdings[0].value must be a number.');
    expect(err('{"holdings":[{"name":"","value":1}]}')).toBe('holdings[0].name is missing.');
    expect(err('{"holdings":[{"name":"A","value":-1}]}')).toContain('holdings[0].value must be 0 or more.');
    expect(err('{"holdings":[{"id":"x","name":"A","value":1},{"id":"x","name":"B","value":1}]}')).toBe('holdings[1].id "x" appears twice.');
    expect(err('{"holdings":[],"snapshots":[{"takenAt":"never","netWorth":1}]}')).toBe('snapshots[0].takenAt must be a valid date.');
  });

  it('keeps older total-only snapshots without inventing holdings', () => {
    const old = {
      holdings: [{ name: 'Savings', type: 'asset', balance: 500, category: 'Cash' }],
      snapshots: [
        { date: '2024-03-01T10:00:00.000Z', netWorth: 1000 },
        { date: '2024-04-01T10:00:00.000Z', totalAssets: 1500, totalDebts: 200 },
      ],
    };
    const r = parseBackup(JSON.stringify(old));
    if (!r.ok) throw new Error(r.error);
    expect(r.data.snapshots).toMatchObject([
      { netWorth: 1000, totalAssets: null, totalDebts: null, holdings: null },
      { netWorth: 1300, totalAssets: 1500, totalDebts: 200, holdings: null },
    ]);
    expect(r.data.daily).toEqual([]);
    expect(r.data.holdings[0]).toMatchObject({ name: 'Savings', kind: 'asset', value: 500 });
    expect(r.data.categories.map((c) => c.name)).toEqual(['Cash']);
    expect(r.notes).toEqual(['2 older snapshots with totals only. Kept as recorded, without holdings.']);
  });
});

describe('start my portfolio', () => {
  it('clears example data but keeps category names', () => {
    const fresh = reduce(buildExample(day(17)), { type: 'startFresh' }, day(17));
    expect(fresh).toMatchObject({ isExample: false, holdings: [], daily: [], snapshots: [], removedHoldings: [] });
    expect(fresh.categories.map((c) => [c.name, c.target])).toEqual([
      ['Index Funds', null],
      ['Bitcoin', null],
      ['Cash', null],
      ['High Risk', null],
      ['Other', null],
    ]);
  });
});

describe('sync decisions', () => {
  const user = 'user-1';
  const own = seed();
  const example = buildExample(day(17));
  const empty = emptyData();
  const meta = (m: Partial<SyncMeta>): SyncMeta => ({ ...EMPTY_META, ...m });

  it('first sign-in with nothing in the account', () => {
    expect(decide(own, EMPTY_META, null, user)).toBe('push');
    expect(decide(example, EMPTY_META, null, user)).toBe('none');
    expect(decide(empty, EMPTY_META, null, user)).toBe('none');
  });

  it('first sign-in on a device when the account already has data', () => {
    expect(decide(example, EMPTY_META, { revision: 4 }, user)).toBe('pull');
    expect(decide(empty, EMPTY_META, { revision: 4 }, user)).toBe('pull');
    expect(decide(own, EMPTY_META, { revision: 4 }, user)).toBe('conflict');
    expect(decide(own, meta({ userId: 'someone-else', revision: 4 }), { revision: 4 }, user)).toBe('conflict');
  });

  it('a device that is already linked', () => {
    const linked = meta({ userId: user, revision: 4 });
    expect(decide(own, linked, { revision: 4 }, user)).toBe('none');
    expect(decide(own, { ...linked, dirty: true }, { revision: 4 }, user)).toBe('push');
    expect(decide(own, linked, { revision: 5 }, user)).toBe('pull');
    expect(decide(own, { ...linked, dirty: true }, { revision: 5 }, user)).toBe('conflict');
  });
});
