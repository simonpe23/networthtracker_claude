import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePopover } from './popover';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}

const Chevron = () => (
  <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
    <path d="M1 1.5l6 6 6-6" fill="none" stroke="#131313" strokeWidth="1.75" />
  </svg>
);

/** A custom select (button plus listbox) that follows the page's own styling. */
export function Select<T extends string>({ label, value, options, onChange, className }: Props<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const style = usePopover(open, button, listbox, close, { height: Math.min(options.length * 48 + 10, 300) });
  const selected = options.find((o) => o.value === value) ?? options[0];

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  useEffect(() => {
    if (open) listbox.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const choose = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    button.current?.focus();
  };

  // Handled on the wrapper, so keys work whether focus is on the button or the list.
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show();
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else if (e.key.length === 1) {
      const start = active + 1;
      const hit = [...options.slice(start), ...options.slice(0, start)].find((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit) setActive(options.indexOf(hit));
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={`field ${className ?? ''}`} onKeyDown={onKey}>
      <span className="label" id={`${id}-label`}>{label}</span>
      <button
        ref={button}
        type="button"
        className="select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <span id={`${id}-value`} className="select-value">{selected?.label}</span>
        <Chevron />
      </button>
      {open && (
        <ul
          ref={listbox}
          className="popover listbox"
          role="listbox"
          tabIndex={-1}
          style={style}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onBlur={() => setOpen(false)}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'is-active' : undefined}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
                  <path d="M1.5 6l4.5 4.5 8.5-9" fill="none" stroke="#131313" strokeWidth="2" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
