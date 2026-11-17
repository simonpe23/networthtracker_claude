import { useId, useState } from 'react';
import type { Holding } from '../types';
import { totals } from '../lib/calc';
import { parseAmount } from '../lib/format';
import { useStore } from '../state';
import { Dialog } from './ui';

/** One screen to retype every balance: tab from field to field, then save once. */
export function BulkUpdate({ onClose }: { onClose: () => void }) {
  const { data, dispatch, notify, fmt } = useStore();
  const id = useId();
  const sorted = [...data.holdings].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'asset' ? -1 : 1));
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(sorted.map((h) => [h.id, String(h.value)])));
  const [submitted, setSubmitted] = useState(false);

  const parsed = Object.fromEntries(sorted.map((h) => [h.id, parseAmount(drafts[h.id])]));
  const invalid = sorted.filter((h) => parsed[h.id] === null);
  const changed = sorted.filter((h) => parsed[h.id] !== null && parsed[h.id] !== h.value);
  const preview = totals(sorted.map((h) => ({ kind: h.kind, value: parsed[h.id] ?? h.value })));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (invalid.length > 0) {
      document.getElementById(`${id}-${invalid[0].id}`)?.focus();
      return;
    }
    if (changed.length > 0) {
      dispatch({ type: 'bulkUpdate', values: Object.fromEntries(changed.map((h) => [h.id, parsed[h.id] as number])) });
      notify({ text: `Updated ${changed.length} ${changed.length === 1 ? 'balance' : 'balances'}. Net worth is now ${fmt.money(preview.netWorth)}.` });
    }
    onClose();
  };

  const row = (h: Holding) => {
    const bad = submitted && parsed[h.id] === null;
    const isChanged = parsed[h.id] !== null && parsed[h.id] !== h.value;
    return (
      <div className="bulk-row" key={h.id}>
        <label htmlFor={`${id}-${h.id}`}>
          <span className="name">{h.name}</span>
          {h.institution && <span className="muted">{h.institution}</span>}
        </label>
        <input
          id={`${id}-${h.id}`}
          className="num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={drafts[h.id]}
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-${h.id}-note`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDrafts((d) => ({ ...d, [h.id]: e.target.value }))}
        />
        <p className="bulk-note" id={`${id}-${h.id}-note`}>
          {bad ? <span className="error">Error: enter a number of 0 or more.</span> : isChanged ? `Was ${fmt.money(h.value)}` : ''}
        </p>
      </div>
    );
  };

  return (
    <Dialog title="Update balances" onClose={onClose} wide>
      <form className="form" onSubmit={save} noValidate>
        <p className="dialog-text">Type the latest balance for each holding, in {fmt.currency}. Leave the others as they are.</p>
        {(['asset', 'debt'] as const).map((kind) => {
          const group = sorted.filter((h) => h.kind === kind);
          return group.length === 0 ? null : (
            <fieldset className="bulk-group" key={kind}>
              <legend>{kind === 'asset' ? 'Assets' : 'Debts (amount owed)'}</legend>
              {group.map(row)}
            </fieldset>
          );
        })}
        <p className="bulk-summary" role="status">
          {changed.length} {changed.length === 1 ? 'balance' : 'balances'} changed. Net worth after saving: <strong>{fmt.money(preview.netWorth)}</strong>
        </p>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Save balances</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}
