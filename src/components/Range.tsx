import { fmtDate, localDate, parseLocalDate } from '../lib/format';
import { DateField } from './DateField';
import { Segmented } from './ui';

export type Preset = '1M' | '3M' | '1Y' | 'all' | 'custom';
export interface Range {
  preset: Preset;
  from: string;
  to: string;
}

const DAYS: Record<string, number> = { '1M': 30, '3M': 91, '1Y': 365 };

export function defaultRange(preset: Preset = '1Y'): Range {
  const now = new Date();
  return { preset, from: localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 91)), to: localDate(now) };
}

/** Start and end of a range in milliseconds. */
export function resolveRange(range: Range): [number, number] {
  const now = new Date();
  if (range.preset === 'all') return [-Infinity, Infinity];
  if (range.preset === 'custom') {
    const from = parseLocalDate(range.from);
    const to = parseLocalDate(range.to);
    return [from.setHours(0, 0, 0, 0), to.setHours(23, 59, 59, 999)];
  }
  return [new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS[range.preset]).getTime(), Infinity];
}

export function inRange<T extends { t: number }>(points: T[], range: Range): T[] {
  const [a, b] = resolveRange(range);
  return points.filter((p) => p.t >= a && p.t <= b);
}

export function RangeControl({ range, onChange, earliest }: { range: Range; onChange: (r: Range) => void; earliest?: string }) {
  const today = localDate(new Date());
  return (
    <div className="range">
      <Segmented
        label="Date range"
        className="range-presets"
        value={range.preset}
        onChange={(preset) => onChange({ ...range, preset })}
        options={[
          { value: '1M', label: '1M' },
          { value: '3M', label: '3M' },
          { value: '1Y', label: '1Y' },
          { value: 'all', label: 'All' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {range.preset === 'custom' && (
        <>
          <DateField label="From" value={range.from} min={earliest} max={range.to} onChange={(from) => onChange({ ...range, from })} />
          <DateField label="To" value={range.to} min={range.from} max={today} onChange={(to) => onChange({ ...range, to })} />
        </>
      )}
    </div>
  );
}

/** "17 Nov 2025 to 17 Nov 2026", from the points actually shown. */
export function spanText(points: { t: number }[]): string {
  if (points.length === 0) return 'No history in this range';
  const ts = points.map((p) => p.t);
  return `${fmtDate(new Date(Math.min(...ts)))} to ${fmtDate(new Date(Math.max(...ts)))}`;
}
