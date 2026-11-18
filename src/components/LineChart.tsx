import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDate, fmtMonth, fmtShortDate, fmtTime } from '../lib/format';

export interface ChartPoint {
  t: number; // position on the time axis, in milliseconds
  v: number;
  /** When it really happened, if that differs from its position (snapshots sit on their day). */
  at?: number;
}

interface Props {
  /** What the chart shows, e.g. "Net worth". Used in the accessible name. */
  label: string;
  line: ChartPoint[]; // automatic daily history
  dots: ChartPoint[]; // explicitly saved snapshots
  formatValue: (n: number) => string;
  formatAxis: (ticks: number[]) => (n: number) => string;
}

const INK = '#131313';
const LINE = '#d6d5d2';
const ACCENT = '#ffc61a';
const DAY = 86400000;

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v < max + step - step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function ChartLegend() {
  return (
    <ul className="legend" aria-label="Legend">
      <li>
        <svg width="28" height="16" aria-hidden="true"><line x1="0" y1="8" x2="28" y2="8" stroke={INK} strokeWidth="2" /></svg>
        Daily history
      </li>
      <li>
        <svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill={ACCENT} stroke={INK} strokeWidth="1.5" /></svg>
        Saved snapshot
      </li>
    </ul>
  );
}

export function LineChart({ label, line, dots, formatValue, formatAxis }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(
    () =>
      [...line.map((p) => ({ ...p, snapshot: false })), ...dots.map((p) => ({ ...p, snapshot: true }))].sort((a, b) => a.t - b.t),
    [line, dots],
  );
  useEffect(() => setActive(null), [points]);

  const narrow = width < 640;
  const height = narrow ? 320 : 400;
  // On narrow screens the value labels sit inside the plot, above each grid line,
  // so the line keeps the full width.
  const m = narrow ? { top: 30, right: 8, bottom: 40, left: 0 } : { top: 16, right: 16, bottom: 44, left: 96 };
  const plotW = Math.max(10, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;

  if (points.length === 0) {
    return (
      <div ref={wrap} className="chart">
        <p className="chart-empty">No history recorded in this date range.</p>
      </div>
    );
  }

  const values = points.map((p) => p.v);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values), narrow ? 3 : 4);
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];
  let t0 = points[0].t;
  let t1 = points[points.length - 1].t;
  if (t0 === t1) {
    t0 -= DAY;
    t1 += DAY;
  }
  const x = (t: number) => m.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => m.top + (1 - (v - y0) / (y1 - y0)) * plotH;
  const axis = formatAxis(yTicks);

  const xCount = Math.max(2, Math.min(6, Math.floor(plotW / 170)));
  // Short ranges get one tick per day, at midday where that day's points sit, so no date repeats.
  let xTicks: number[];
  if ((t1 - t0) / DAY <= 21) {
    const first = new Date(t0 - DAY / 2);
    first.setHours(12, 0, 0, 0);
    const days: number[] = [];
    for (const d = first; d.getTime() <= t1 + DAY / 2; d.setDate(d.getDate() + 1)) {
      if (d.getTime() >= t0 - DAY / 4 && d.getTime() <= t1 + DAY / 4) days.push(d.getTime());
    }
    const step = Math.max(1, Math.ceil(days.length / xCount));
    xTicks = days.filter((_, i) => i % step === 0);
  } else {
    xTicks = Array.from({ length: xCount }, (_, i) => t0 + ((t1 - t0) * i) / (xCount - 1));
  }
  const xLabel = t1 - t0 > 120 * DAY ? fmtMonth : fmtShortDate;

  const path = line.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const cur = active === null ? null : points[active];

  const nearest = (clientX: number) => {
    const px = clientX - wrap.current!.getBoundingClientRect().left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      // Snapshots win ties, so a dot on top of the line stays reachable.
      const d = Math.abs(x(p.t) - px) - (p.snapshot ? 8 : 0);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setActive(best);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const last = points.length - 1;
    const i = active ?? last;
    const next: Record<string, number> = { ArrowLeft: Math.max(0, i - 1), ArrowRight: Math.min(last, i + 1), Home: 0, End: last };
    if (e.key === 'Escape') setActive(null);
    else if (e.key in next) setActive(active === null ? last : next[e.key]);
    else return;
    e.preventDefault();
  };

  const describe = (p: (typeof points)[number]) => {
    const d = new Date(p.at ?? p.t);
    return p.snapshot
      ? { when: `${fmtDate(d)}, ${fmtTime(d)}`, kind: 'Saved snapshot' }
      : { when: fmtDate(d), kind: 'Daily update' };
  };
  const tip = cur && describe(cur);
  const TIP_W = 230;
  const cx = cur ? x(cur.t) : 0;
  const cy = cur ? y(cur.v) : 0;

  return (
    <div
      ref={wrap}
      className="chart"
      tabIndex={0}
      role="group"
      aria-roledescription="chart"
      aria-label={`${label} chart, ${fmtDate(new Date(t0))} to ${fmtDate(new Date(t1))}. ${line.length} daily values and ${dots.length} saved snapshots. Use the left and right arrow keys to read each value.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="presentation"
          onPointerMove={(e) => nearest(e.clientX)}
          onPointerDown={(e) => nearest(e.clientX)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} stroke={LINE} strokeWidth="1" />
              <text
                x={narrow ? 0 : m.left - 16}
                y={narrow ? y(v) - 7 : y(v)}
                textAnchor={narrow ? 'start' : 'end'}
                dominantBaseline={narrow ? 'auto' : 'middle'}
                className={narrow ? 'axis-text halo' : 'axis-text'}
              >
                {axis(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={m.top + plotH} y2={m.top + plotH + 6} stroke={INK} strokeWidth="1" />
              <text
                x={x(t)}
                y={m.top + plotH + 28}
                textAnchor={x(t) - m.left < 44 ? 'start' : width - m.right - x(t) < 44 ? 'end' : 'middle'}
                className="axis-text"
              >
                {xLabel(new Date(t))}
              </text>
            </g>
          ))}
          <line x1={m.left} x2={width - m.right} y1={m.top + plotH} y2={m.top + plotH} stroke={INK} strokeWidth="1" />
          {cur && <line x1={cx} x2={cx} y1={m.top} y2={m.top + plotH} stroke={INK} strokeWidth="1" strokeDasharray="3 4" />}
          {line.length > 1 && <path d={path} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {line.length === 1 && <circle cx={x(line[0].t)} cy={y(line[0].v)} r="3.5" fill={INK} />}
          {dots.map((p, i) => (
            <circle key={i} cx={x(p.t)} cy={y(p.v)} r="6" fill={ACCENT} stroke={INK} strokeWidth="1.5" />
          ))}
          {cur &&
            (cur.snapshot ? (
              <circle cx={cx} cy={cy} r="9" fill={ACCENT} stroke={INK} strokeWidth="2.5" />
            ) : (
              <circle cx={cx} cy={cy} r="5.5" fill="#ffffff" stroke={INK} strokeWidth="2.5" />
            ))}
        </svg>
      )}
      {cur && tip && (
        <div
          className="tooltip"
          style={{
            width: TIP_W,
            left: Math.max(0, Math.min(cx - TIP_W / 2, width - TIP_W)),
            top: cy > 130 ? cy - 16 : cy + 18,
            transform: cy > 130 ? 'translateY(-100%)' : undefined,
          }}
        >
          <span className="tooltip-value">{formatValue(cur.v)}</span>
          <span>{tip.when}</span>
          <span className="tooltip-kind">
            {cur.snapshot ? (
              <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill={ACCENT} stroke={INK} strokeWidth="1.5" /></svg>
            ) : (
              <svg width="14" height="14" aria-hidden="true"><line x1="0" y1="7" x2="14" y2="7" stroke={INK} strokeWidth="2" /></svg>
            )}
            {tip.kind}
          </span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{cur && tip ? `${tip.kind}, ${tip.when}: ${formatValue(cur.v)}` : ''}</p>
    </div>
  );
}
