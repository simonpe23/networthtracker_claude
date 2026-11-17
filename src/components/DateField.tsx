import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fmtDate, localDate, parseLocalDate } from '../lib/format';
import { usePopover } from './popover';

interface Props {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** A custom date control: a button that opens a calendar grid. */
export function DateField({ label, value, onChange, min, max }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(value);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const style = usePopover(open, button, panel, close, { width: 328, height: 400 });

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [open, cursor]);

  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);
  const clamp = (d: string) => (min && d < min ? min : max && d > max ? max : d);
  const move = (days: number, months = 0) => {
    const c = parseLocalDate(cursor);
    const next = months
      ? new Date(c.getFullYear(), c.getMonth() + months, Math.min(c.getDate(), new Date(c.getFullYear(), c.getMonth() + months + 1, 0).getDate()), 12)
      : new Date(c.getFullYear(), c.getMonth(), c.getDate() + days, 12);
    setCursor(clamp(localDate(next)));
  };
  const pick = (d: string) => {
    onChange(d);
    setOpen(false);
    button.current?.focus();
  };

  const c = parseLocalDate(cursor);
  const first = new Date(c.getFullYear(), c.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: count }, (_, i) => localDate(new Date(c.getFullYear(), c.getMonth(), i + 1, 12))),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const onKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      PageUp: () => move(0, -1),
      PageDown: () => move(0, 1),
      Escape: () => {
        setOpen(false);
        button.current?.focus();
      },
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    e.stopPropagation();
    keys[e.key]();
  };

  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>{label}</span>
      <button
        ref={button}
        type="button"
        className="select"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => {
          setCursor(clamp(value));
          setOpen((o) => !o);
        }}
      >
        <span id={`${id}-value`} className="select-value">{fmtDate(value)}</span>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M2 4.5h14v11.5H2zM2 8h14M5.5 2v4M12.5 2v4" fill="none" stroke="#131313" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div ref={panel} className="popover calendar" role="dialog" aria-label={`${label}: choose a date`} style={style} onKeyDown={onKey}>
          <div className="calendar-head">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => move(0, -1)}>
              <svg width="9" height="14" viewBox="0 0 9 14" aria-hidden="true"><path d="M7.5 1l-6 6 6 6" fill="none" stroke="#131313" strokeWidth="1.75" /></svg>
            </button>
            <span aria-live="polite">{monthTitle.format(c)}</span>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => move(0, 1)}>
              <svg width="9" height="14" viewBox="0 0 9 14" aria-hidden="true"><path d="M1.5 1l6 6-6 6" fill="none" stroke="#131313" strokeWidth="1.75" /></svg>
            </button>
          </div>
          <table className="calendar-grid">
            <thead>
              <tr>{WEEKDAYS.map((d, i) => <th key={d} scope="col" abbr={WEEKDAY_NAMES[i]}>{d}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((d, i) => (
                    <td key={i}>
                      {d && (
                        <button
                          type="button"
                          className="day"
                          tabIndex={d === cursor ? 0 : -1}
                          disabled={!allowed(d)}
                          aria-pressed={d === value}
                          aria-label={dayTitle.format(parseLocalDate(d))}
                          onClick={() => pick(d)}
                        >
                          {Number(d.slice(8))}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
