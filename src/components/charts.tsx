import { useMemo, useState } from 'react';
import type { AppData } from '../types';
import { fmtDate, parseLocalDate, pct } from '../lib/format';
import { holdingSeries } from '../lib/store';
import { useStore } from '../state';
import { ChartLegend, LineChart, type ChartPoint } from './LineChart';
import { defaultRange, inRange, RangeControl, spanText, type Range } from './Range';

export type Metric = 'netWorth' | 'totalAssets' | 'totalDebts';
export const METRIC_LABEL: Record<Metric, string> = { netWorth: 'Net worth', totalAssets: 'Total assets', totalDebts: 'Total debts' };

const noon = (date: string) => parseLocalDate(date).getTime();

export function portfolioSeries(data: AppData, metric: Metric): { line: ChartPoint[]; dots: ChartPoint[] } {
  return {
    line: data.daily.map((d) => ({ t: noon(d.date), v: d[metric] })),
    // Older total-only snapshots may lack assets or debts. Those are left out, not estimated.
    dots: data.snapshots.flatMap((s) => (s[metric] === null ? [] : [{ t: new Date(s.takenAt).getTime(), v: s[metric] as number }])),
  };
}

export function useRange(initial: Range = defaultRange()) {
  return useState<Range>(initial);
}

function Block(props: { title?: string; label: string; line: ChartPoint[]; dots: ChartPoint[]; range: Range; money: boolean }) {
  const { fmt } = useStore();
  const line = inRange(props.line, props.range);
  const dots = inRange(props.dots, props.range);
  return (
    <div className="chart-block">
      {props.title && <h3 className="sub-heading">{props.title}</h3>}
      <div className="chart-meta">
        <p className="muted">{spanText([...line, ...dots])}</p>
        <ChartLegend />
      </div>
      <LineChart
        label={props.label}
        line={line}
        dots={dots}
        formatValue={props.money ? fmt.money : (n) => pct(n, 2)}
        formatAxis={props.money ? fmt.axisMoney : () => (n) => pct(n, 1)}
      />
    </div>
  );
}

export function PortfolioChart({ metric, range, onRange }: { metric: Metric; range: Range; onRange: (r: Range) => void }) {
  const { data } = useStore();
  const series = useMemo(() => portfolioSeries(data, metric), [data, metric]);
  return (
    <>
      <RangeControl range={range} onChange={onRange} earliest={data.daily[0]?.date} />
      <Block label={METRIC_LABEL[metric]} {...series} range={range} money />
    </>
  );
}

export function HoldingCharts({ id, range, onRange }: { id: string; range: Range; onRange: (r: Range) => void }) {
  const { data } = useStore();
  const kind = data.holdings.find((h) => h.id === id)?.kind ?? data.removedHoldings.find((h) => h.id === id)?.kind ?? 'asset';
  const series = useMemo(() => holdingSeries(data, id), [data, id]);
  const snaps = useMemo(
    () =>
      data.snapshots.flatMap((s) => {
        const h = s.holdings?.find((x) => x.holdingId === id);
        return h ? [{ t: new Date(s.takenAt).getTime(), value: h.value, pct: h.pct }] : [];
      }),
    [data, id],
  );
  return (
    <>
      <RangeControl range={range} onChange={onRange} earliest={series[0]?.date} />
      <Block
        title={kind === 'asset' ? 'Value over time' : 'Amount owed over time'}
        label={kind === 'asset' ? 'Value' : 'Amount owed'}
        line={series.map((p) => ({ t: noon(p.date), v: p.value }))}
        dots={snaps.map((s) => ({ t: s.t, v: s.value }))}
        range={range}
        money
      />
      {kind === 'asset' ? (
        <Block
          title="Share of total assets over time"
          label="Share of total assets"
          line={series.flatMap((p) => (p.pct === null ? [] : [{ t: noon(p.date), v: p.pct }]))}
          dots={snaps.flatMap((s) => (s.pct === null ? [] : [{ t: s.t, v: s.pct }]))}
          range={range}
          money={false}
        />
      ) : (
        <p className="muted chart-block">Debts are not part of the allocation, so they have no share of total assets.</p>
      )}
    </>
  );
}

export const deletedLabel = (iso: string) => `Deleted on ${fmtDate(iso)}`;
