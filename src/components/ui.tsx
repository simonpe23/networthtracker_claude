import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Start at the title instead of the first button, for dialogs that are mainly read. */
  focusTitle?: boolean;
}

export function Dialog({ title, onClose, children, wide, focusTitle }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    if (focusTitle) {
      heading.current?.focus();
      d.scrollTop = 0;
    }
    return () => d.close();
  }, [focusTitle]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <h2 id={id} ref={heading} className="sub-heading" tabIndex={focusTitle ? -1 : undefined}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Confirm(props: { title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <div className="dialog-text">{props.body}</div>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={props.onConfirm}>{props.confirmLabel}</button>
        <button type="button" className="btn btn-secondary" onClick={props.onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <span className="label" id={id}>{label}</span>
      <div className="segmented" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  inputMode?: 'decimal' | 'text';
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
}

export function TextField({ label, value, onChange, error, hint, inputMode, multiline, autoFocus, className, type, autoComplete }: TextFieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const shared = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    autoComplete: autoComplete ?? 'off',
    autoFocus,
  };
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...shared} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type={type ?? 'text'} inputMode={inputMode} className={inputMode === 'decimal' ? 'num' : undefined} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="error" id={`${id}-error`}>Error: {error}</p>}
    </div>
  );
}

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Overrides the accessible name when the visible label is short or hidden. */
  ariaLabel?: string;
  labelClassName?: string;
}

export function Checkbox({ label, checked, onChange, ariaLabel, labelClassName }: CheckboxProps) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} aria-label={ariaLabel} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" aria-hidden="true">
        {checked && (
          <svg width="16" height="12" viewBox="0 0 16 12"><path d="M1.5 6l4.5 4.5 8.5-9" fill="none" stroke="#131313" strokeWidth="2.25" /></svg>
        )}
      </span>
      <span className={labelClassName}>{label}</span>
    </label>
  );
}
