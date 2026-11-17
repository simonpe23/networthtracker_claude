import { useState } from 'react';
import type { Holding, Kind } from '../types';
import { hasTargets } from '../lib/calc';
import { parseAmount } from '../lib/format';
import { uid } from '../lib/store';
import { useStore } from '../state';
import { Select } from './Select';
import { Dialog, Segmented, TextField } from './ui';

const NONE = '__none__';
const NEW = '__new__';

export function HoldingForm({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const { data, dispatch, notify, fmt } = useStore();
  const [kind, setKind] = useState<Kind>(holding?.kind ?? 'asset');
  const [name, setName] = useState(holding?.name ?? '');
  const [balance, setBalance] = useState(holding ? String(holding.value) : '');
  const [categoryId, setCategoryId] = useState(holding ? holding.categoryId ?? NONE : data.categories[0]?.id ?? NONE);
  const [newCategory, setNewCategory] = useState('');
  const [institution, setInstitution] = useState(holding?.institution ?? '');
  const [notes, setNotes] = useState(holding?.notes ?? '');
  const [details, setDetails] = useState(Boolean(holding?.institution || holding?.notes));
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const value = parseAmount(balance);
  const errors = {
    name: name.trim() ? null : 'Enter a name.',
    balance: balance.trim() === '' ? 'Enter an amount.' : value === null ? 'Enter a number of 0 or more, for example 1250.50.' : null,
    newCategory: kind === 'asset' && categoryId === NEW && !newCategory.trim() ? 'Enter a name for the new category.' : null,
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.balance || errors.newCategory || value === null) {
      const form = e.currentTarget as HTMLFormElement;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    // A category typed here is created on the spot. An existing name is reused.
    let chosen: string | null = categoryId === NONE ? null : categoryId;
    let created: string | null = null;
    if (kind === 'asset' && categoryId === NEW) {
      const wanted = newCategory.trim();
      const existing = data.categories.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
      chosen = existing?.id ?? uid();
      if (!existing) {
        created = wanted;
        dispatch({
          type: 'saveCategories',
          categories: [...data.categories, { id: chosen, name: wanted, target: hasTargets(data.categories) ? 0 : null }],
        });
      }
    }
    const input = {
      name: name.trim(),
      institution: institution.trim(),
      notes: notes.trim(),
      categoryId: chosen,
      value,
    };
    const extra = created ? ` New category: ${created}${hasTargets(data.categories) ? ', with a 0% target' : ''}.` : '';
    if (holding) {
      dispatch({ type: 'updateHolding', id: holding.id, input });
      notify({ text: `Saved ${input.name}.${extra}`, link: created ? { href: '#/allocation', label: 'Manage categories' } : undefined });
    } else {
      dispatch({ type: 'addHolding', input: { ...input, kind } });
      notify({ text: `Added ${input.name} at ${fmt.money(value)}.${extra}`, link: created ? { href: '#/allocation', label: 'Manage categories' } : undefined });
    }
    onClose();
  };

  if (holding && confirmDelete) {
    return (
      <Dialog title={`Delete ${holding.name}?`} onClose={onClose}>
        <div className="dialog-text">
          <p>It is removed from your holdings and from today's totals.</p>
          <p>Its recorded history and every saved snapshot that includes it are kept.</p>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              dispatch({ type: 'deleteHolding', id: holding.id });
              notify({ text: `Deleted ${holding.name}. Its history is kept.`, link: { href: `#/history/${holding.id}`, label: 'View history' } });
              onClose();
            }}
          >
            Delete holding
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Keep holding</button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={holding ? `Edit ${holding.name}` : 'Add holding'} onClose={onClose}>
      <form className="form" onSubmit={save} noValidate>
        {holding ? (
          <p className="form-static"><span className="label">Type</span>{holding.kind === 'asset' ? 'Asset' : 'Debt'}</p>
        ) : (
          <Segmented
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'asset', label: 'Asset' },
              { value: 'debt', label: 'Debt' },
            ]}
          />
        )}
        <TextField label="Name" value={name} onChange={setName} error={submitted ? errors.name : null} autoFocus={!holding} />
        <TextField
          label={kind === 'asset' ? 'Current balance' : 'Amount owed'}
          hint={kind === 'asset' ? `Amount in ${fmt.currency}.` : `Amount in ${fmt.currency}, as a positive number.`}
          value={balance}
          onChange={setBalance}
          inputMode="decimal"
          error={submitted ? errors.balance : null}
        />
        {kind === 'asset' && (
          <Select
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={[
              ...data.categories.map((c) => ({ value: c.id, label: c.name })),
              { value: NONE, label: 'Uncategorised' },
              { value: NEW, label: 'New category...' },
            ]}
          />
        )}
        {kind === 'asset' && categoryId === NEW && (
          <TextField label="New category name" value={newCategory} onChange={setNewCategory} error={submitted ? errors.newCategory : null} autoFocus />
        )}
        <div className="disclosure">
          <button type="button" className="link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            {details ? 'Hide account details' : 'Add account details (optional)'}
          </button>
          {details && (
            <div className="form">
              <TextField label="Institution or account" value={institution} onChange={setInstitution} />
              <TextField label="Notes" value={notes} onChange={setNotes} multiline />
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">{holding ? 'Save changes' : 'Save holding'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {holding && (
            <button type="button" className="link form-delete" onClick={() => setConfirmDelete(true)}>Delete holding</button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
