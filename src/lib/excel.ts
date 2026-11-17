import type { AppData } from '../types';
import { allocation, outsideAllocation, share, totals } from './calc';
import { localDate, parseLocalDate } from './format';

type Cell = { value: string | number | Date; type: typeof String | typeof Number | typeof Date; format?: string; fontWeight?: 'bold'; align?: 'right' } | null;

export interface Sheet {
  sheet: string;
  data: Cell[][];
  columns: { width: number }[];
  stickyRowsCount: number;
}

const MONEY = '#,##0.00';
const PCT = '0.0%';
const text = (value: string): Cell => ({ value, type: String });
const money = (value: number | null): Cell => (value === null ? null : { value, type: Number, format: MONEY });
const pct = (value: number | null): Cell => (value === null ? null : { value: value / 100, type: Number, format: PCT });
// Excel has no time zones and the writer stores dates as UTC, so shift each date
// to keep the local clock time the app shows on screen.
const asShown = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
const day = (date: string): Cell => {
  const d = parseLocalDate(date);
  return { value: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), type: Date, format: 'yyyy-mm-dd' };
};
const time = (iso: string): Cell => ({ value: asShown(new Date(iso)), type: Date, format: 'yyyy-mm-dd hh:mm' });

function sheet(name: string, headers: [string, number, ('right' | undefined)?][], rows: Cell[][]): Sheet {
  return {
    sheet: name,
    data: [headers.map(([value, , align]) => ({ value, type: String, fontWeight: 'bold', align })), ...rows],
    columns: headers.map(([, width]) => ({ width })),
    stickyRowsCount: 1,
  };
}

/**
 * A readable workbook of everything in the app. For viewing and analysis only:
 * the JSON backup remains the format that can be imported again.
 */
export function buildWorkbook(data: AppData, now: Date = new Date()): Sheet[] {
  const t = totals(data.holdings);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const kind = (k: 'asset' | 'debt') => (k === 'asset' ? 'Asset' : 'Debt');
  const sorted = [...data.holdings].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'asset' ? -1 : 1));
  const R = 'right' as const;

  return [
    sheet(
      'Summary',
      [['Item', 28], ['Value', 20, R]],
      [
        [text('Exported'), time(now.toISOString())],
        [text('Currency'), { value: data.currency, type: String, align: 'right' }],
        [text('Net worth'), money(t.netWorth)],
        [text('Total assets'), money(t.totalAssets)],
        [text('Total debts'), money(t.totalDebts)],
        [text('Holdings'), { value: data.holdings.length, type: Number }],
        [text('Saved snapshots'), { value: data.snapshots.length, type: Number }],
        [text('Days of daily history'), { value: data.daily.length, type: Number }],
      ],
    ),
    sheet(
      'Holdings',
      [['Name', 30], ['Institution or account', 26], ['Type', 10], ['Category', 20], ['Value', 18, R], ['% of assets', 14, R]],
      sorted.map((h) => [
        text(h.name),
        text(h.institution),
        text(kind(h.kind)),
        text(h.kind === 'debt' ? '' : (h.categoryId && catName.get(h.categoryId)) || 'Uncategorised'),
        money(h.value),
        h.kind === 'asset' ? pct(share(h.value, t.totalAssets)) : null,
      ]),
    ),
    sheet(
      'Allocation',
      [['Category', 24], ['Value', 18, R], ['Actual %', 12, R], ['Target %', 12, R], ['Difference (points)', 20, R], ['Amount vs target', 20, R]],
      [
        ...allocation(data).map((r) => [
        text(r.name),
        money(r.value),
        pct(r.actual),
        pct(r.target),
        r.diffPct === null ? null : { value: Math.round(r.diffPct * 100) / 100, type: Number, format: '+0.0;-0.0;0.0' },
        r.diffAmount === null ? null : { value: r.diffAmount, type: Number, format: '+#,##0.00;-#,##0.00;0.00' },
        ]),
        ...outsideAllocation(data).map((r) => [text(r.name), money(r.value), null, null, null, { value: 'Outside allocation', type: String, align: 'right' } as Cell]),
      ],
    ),
    sheet(
      'Snapshots',
      [['Saved', 20], ['Net worth', 18, R], ['Total assets', 18, R], ['Total debts', 18, R], ['Holdings recorded', 20, R]],
      data.snapshots.map((s) => [
        time(s.takenAt),
        money(s.netWorth),
        money(s.totalAssets),
        money(s.totalDebts),
        s.holdings ? { value: s.holdings.length, type: Number } : { value: 'Totals only', type: String, align: 'right' },
      ]),
    ),
    sheet(
      'Snapshot holdings',
      [['Saved', 20], ['Name', 30], ['Institution or account', 26], ['Type', 10], ['Category', 20], ['Value', 18, R], ['% of assets', 14, R]],
      data.snapshots.flatMap((s) =>
        (s.holdings ?? []).map((h) => [
          time(s.takenAt),
          text(h.name),
          text(h.institution),
          text(kind(h.kind)),
          text(h.kind === 'debt' ? '' : h.category ?? 'Uncategorised'),
          money(h.value),
          pct(h.pct),
        ]),
      ),
    ),
    sheet(
      'Daily history',
      [['Date', 14], ['Net worth', 18, R], ['Total assets', 18, R], ['Total debts', 18, R]],
      data.daily.map((d) => [day(d.date), money(d.netWorth), money(d.totalAssets), money(d.totalDebts)]),
    ),
  ];
}

export const workbookFileName = (now: Date = new Date()) => `sp-net-worth-${localDate(now)}.xlsx`;
