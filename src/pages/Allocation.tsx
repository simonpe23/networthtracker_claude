import { useState } from 'react';
import type { Category } from '../types';
import { hasTargets, round2, targetsValid, targetTotal, totals } from '../lib/calc';
import { uid } from '../lib/store';
import { useStore } from '../state';
import { AllocationTable } from '../components/AllocationTable';
import { TextField } from '../components/ui';

interface Draft {
  id: string;
  name: string;
  target: string;
}

const parseTarget = (raw: string): number | null | 'bad' => {
  const s = raw.trim().replace(/%$/, '').trim();
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return 'bad';
  const n = Number(s);
  return n > 100 ? 'bad' : round2(n);
};

function CategoryEditor({ onClose }: { onClose: () => void }) {
  const { data, dispatch, notify } = useStore();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    data.categories.map((c) => ({ id: c.id, name: c.name, target: c.target === null ? '' : String(c.target) })),
  );
  const [submitted, setSubmitted] = useState(false);
  const set = (id: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const parsed = drafts.map((d) => ({ ...d, name: d.name.trim(), value: parseTarget(d.target) }));
  const nameError = (d: (typeof parsed)[number]) =>
    !d.name
      ? 'Enter a name.'
      : parsed.some((o) => o.id !== d.id && o.name.toLowerCase() === d.name.toLowerCase())
        ? 'This name is already used.'
        : null;
  const targetError = (d: (typeof parsed)[number]) => (d.value === 'bad' ? 'Enter a number from 0 to 100.' : null);
  const fieldsOk = parsed.every((d) => !nameError(d) && !targetError(d));
  const targets = parsed.map((d) => ({ target: d.value === 'bad' ? null : d.value }));
  const total = targetTotal(targets);
  const anyTarget = targets.some((t) => t.target !== null);
  // A blank target counts as 0% once any target is set.
  const totalOk = !anyTarget || Math.abs(total - 100) < 0.005;

  const removed = data.categories.filter((c) => !drafts.some((d) => d.id === c.id));
  const orphaned = data.holdings.filter((h) => removed.some((c) => c.id === h.categoryId)).length;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!fieldsOk || !totalOk) {
      const form = e.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const categories: Category[] = parsed.map((d) => ({
      id: d.id,
      name: d.name,
      target: anyTarget ? ((d.value as number | null) ?? 0) : null,
    }));
    if (!targetsValid(categories)) return;
    dispatch({ type: 'saveCategories', categories });
    notify({ text: anyTarget ? 'Categories saved. Targets total 100%.' : 'Categories saved without targets.' });
    onClose();
  };

  return (
    <form className="panel form" onSubmit={save} noValidate aria-labelledby="cat-editor-title">
      <h2 id="cat-editor-title" className="sub-heading">Edit categories and targets</h2>
      <p className="hint">Targets are a share of total assets and must add up to exactly 100%. Leave every target empty to track without targets.</p>
      {drafts.map((d, i) => (
        <fieldset className="cat-row" key={d.id}>
          <legend className="sr-only">Category {i + 1}</legend>
          <TextField label="Category name" value={d.name} onChange={(name) => set(d.id, { name })} error={submitted ? nameError(parsed[i]) : null} />
          <TextField
            label="Target %"
            value={d.target}
            onChange={(target) => set(d.id, { target })}
            inputMode="decimal"
            error={submitted ? targetError(parsed[i]) : null}
          />
          <button type="button" className="link" aria-label={`Remove ${d.name || `category ${i + 1}`}`} onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}>
            Remove
          </button>
        </fieldset>
      ))}
      <div>
        <button type="button" className="btn btn-secondary" onClick={() => setDrafts((ds) => [...ds, { id: uid(), name: '', target: '' }])}>
          Add category
        </button>
      </div>
      <p className="target-total" role="status">
        {!anyTarget ? (
          'No targets set.'
        ) : totalOk ? (
          <>Targets total <strong>100%</strong>.</>
        ) : total < 100 ? (
          <>Targets total <strong>{total}%</strong>. Add {round2(100 - total)}% to reach 100%.</>
        ) : (
          <>Targets total <strong>{total}%</strong>. Remove {round2(total - 100)}% to reach 100%.</>
        )}
      </p>
      {submitted && !totalOk && <p className="error" role="alert">Error: targets must add up to exactly 100% before you can save.</p>}
      {orphaned > 0 && (
        <p className="hint">
          {orphaned} {orphaned === 1 ? 'holding' : 'holdings'} in removed categories will become Uncategorised.
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Save categories</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export function AllocationPage() {
  const { data, fmt } = useStore();
  const [editing, setEditing] = useState(false);
  const { totalAssets } = totals(data.holdings);
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="section-head">
        <h1 id="page-title" className="page-heading">Allocation</h1>
        {!editing && (
          <div className="section-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>Edit categories and targets</button>
          </div>
        )}
      </div>
      <p className="lead">
        Shares are calculated on total assets before debts: {fmt.money(totalAssets)}.
        {!hasTargets(data.categories) && ' No targets are set yet.'}
      </p>
      {editing && <CategoryEditor onClose={() => setEditing(false)} />}
      <AllocationTable />
    </section>
  );
}
