import { useState } from 'react';
import type { Holding } from '../types';
import { allocationBase, share, sum } from '../lib/calc';
import { pct } from '../lib/format';
import { useStore } from '../state';
import { BulkUpdate } from './BulkUpdate';
import { HoldingForm } from './HoldingForm';
import { Select } from './Select';
import { Checkbox, Segmented, TextField } from './ui';

type Show = 'all' | 'asset' | 'debt';
const ALL = '__all__';
const NONE = '__none__';

interface Props {
  /** Categories outside the allocation that are left out of the net worth figure. */
  hiddenCategoryIds?: Set<string>;
  onToggleCategory?: (categoryId: string, hide: boolean) => void;
}

export function HoldingsSection({ hiddenCategoryIds, onToggleCategory }: Props) {
  const { data, fmt } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [show, setShow] = useState<Show>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [form, setForm] = useState<{ holding: Holding | null } | null>(null);
  const [bulk, setBulk] = useState(false);

  const { base, counts, anyExcluded } = allocationBase(data);
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const categoryOf = (h: Holding) => (h.kind === 'debt' ? 'Debt' : (h.categoryId && catName.get(h.categoryId)) || 'Uncategorised');
  const q = search.trim().toLowerCase();
  const matches = (h: Holding) => {
    if (show !== 'all' && h.kind !== show) return false;
    if (category !== ALL) {
      if (h.kind !== 'asset') return false;
      const id = h.categoryId && catName.has(h.categoryId) ? h.categoryId : NONE;
      if (id !== category) return false;
    }
    return !q || [h.name, h.institution, categoryOf(h)].some((s) => s.toLowerCase().includes(q));
  };
  const byValue = (a: Holding, b: Holding) => b.value - a.value;
  const allAssets = data.holdings.filter((h) => h.kind === 'asset');
  const allDebts = data.holdings.filter((h) => h.kind === 'debt');
  // Allocated holdings first, highest value first. Holdings outside the allocation always go last.
  const assets = allAssets.filter(matches).sort((a, b) => Number(!counts(a)) - Number(!counts(b)) || byValue(a, b));
  const debts = allDebts.filter(matches).sort(byValue);
  const filtered = Boolean(q) || category !== ALL || show !== 'all';
  const activeFilters = (category !== ALL ? 1 : 0) + (show !== 'all' ? 1 : 0);
  const countText = (shown: number, all: number) => (shown === all ? `${all} ${all === 1 ? 'holding' : 'holdings'}` : `${shown} of ${all} holdings`);

  // Holdings outside the allocation carry an "in net worth" checkbox for their category.
  const showInclude = anyExcluded && Boolean(onToggleCategory);
  const leftOut = (h: Holding) => h.kind === 'asset' && h.categoryId !== null && Boolean(hiddenCategoryIds?.has(h.categoryId));
  const excludedTotal = sum(allAssets.filter(leftOut).map((h) => h.value));
  const includeCell = (h: Holding) =>
    showInclude ? (
      <td className="c-include">
        {h.kind === 'asset' && !counts(h) && h.categoryId !== null && (
          <Checkbox
            label="In net worth"
            labelClassName="include-label"
            ariaLabel={`Include ${categoryOf(h)} in net worth`}
            checked={!leftOut(h)}
            onChange={(include) => onToggleCategory!(h.categoryId as string, !include)}
          />
        )}
      </td>
    ) : null;
  const actions = (h: Holding) => (
    <td className="c-actions">
      <button className="link" type="button" aria-label={`Edit ${h.name}`} onClick={() => setForm({ holding: h })}>Edit</button>
      <a className="link" href={`#/history/${h.id}`} aria-label={`History for ${h.name}`}>History</a>
    </td>
  );
  const nameCell = (h: Holding) => (
    <th scope="row" className="c-name">
      <span className="name">{h.name}</span>
      {h.institution && <span className="inst">{h.institution}</span>}
    </th>
  );

  return (
    <section className="section" aria-labelledby="holdings-heading">
      <div className="section-head">
        <h2 id="holdings-heading" className="page-heading">Holdings</h2>
        <div className="section-actions">
          {data.holdings.length > 0 && (
            <button className="btn btn-secondary" type="button" onClick={() => setBulk(true)}>Update balances</button>
          )}
          <button className="btn btn-primary" type="button" onClick={() => setForm({ holding: null })}>Add holding</button>
        </div>
      </div>

      {data.holdings.length === 0 ? (
        <p className="empty">No holdings yet. Add your first cash account, investment, other asset or debt to see your net worth.</p>
      ) : (
        <>
          <div className={`toolbar${filtersOpen ? ' is-open' : ''}`}>
            <TextField label="Search holdings" value={search} onChange={setSearch} className="field-search" />
            <button className="btn btn-secondary filters-button" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
              {activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
            </button>
            <Select
              label="Category"
              className="field-filter"
              value={category}
              onChange={setCategory}
              options={[
                { value: ALL, label: 'All categories' },
                ...data.categories.map((c) => ({ value: c.id, label: c.name })),
                { value: NONE, label: 'Uncategorised' },
              ]}
            />
            <Segmented
              label="Show"
              className="field-filter"
              value={show}
              onChange={setShow}
              options={[
                { value: 'all', label: 'All' },
                { value: 'asset', label: 'Assets' },
                { value: 'debt', label: 'Debts' },
              ]}
            />
          </div>

          <p className="sr-only" role="status">{filtered ? `${assets.length + debts.length} holdings match.` : ''}</p>
          {assets.length + debts.length === 0 ? (
            <p className="empty">
              No holdings match these filters.{' '}
              <button
                className="link"
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategory(ALL);
                  setShow('all');
                }}
              >
                Clear filters
              </button>
            </p>
          ) : (
            <table className="holdings">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">Value</th>
                  <th scope="col" className="num">{anyExcluded ? '% of allocation' : '% of assets'}</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                  {showInclude && <th scope="col" className="c-include">In net worth</th>}
                </tr>
              </thead>
              <tbody>
                {assets.length > 0 && (
                  <tr className="group">
                    <th scope="rowgroup" colSpan={2}>
                      Assets <span className="count">{countText(assets.length, allAssets.length)}</span>
                      {excludedTotal > 0 && <span className="count">{fmt.money(excludedTotal)} excluded</span>}
                    </th>
                    <td className="num">{fmt.money(sum(assets.filter((h) => !leftOut(h)).map((h) => h.value)))}</td>
                    <td className="num">{pct(share(sum(assets.filter(counts).map((h) => h.value)), base) ?? 0)}</td>
                    <td />
                    {showInclude && <td />}
                  </tr>
                )}
                {assets.map((h) => {
                  const s = counts(h) ? share(h.value, base) ?? 0 : null;
                  return (
                    <tr key={h.id} className={leftOut(h) ? 'row is-left-out' : 'row'}>
                      {nameCell(h)}
                      <td className="c-cat">{categoryOf(h)}</td>
                      <td className="num c-value">{fmt.money(h.value)}</td>
                      <td className="num c-share">
                        {s === null ? (
                          <span className="outside">Outside allocation</span>
                        ) : (
                          <>
                            <span className="bar" aria-hidden="true"><span style={{ width: `${s}%` }} /></span>
                            <span className="share-num">{pct(s)}</span>
                          </>
                        )}
                      </td>
                      {actions(h)}
                      {includeCell(h)}
                    </tr>
                  );
                })}
                {debts.length > 0 && (
                  <tr className="group">
                    <th scope="rowgroup" colSpan={2}>Debts <span className="count">{countText(debts.length, allDebts.length)}</span></th>
                    <td className="num">{fmt.money(-sum(debts.map((h) => h.value)))}</td>
                    <td className="num" />
                    <td />
                    {showInclude && <td />}
                  </tr>
                )}
                {debts.map((h) => (
                  <tr key={h.id} className="row">
                    {nameCell(h)}
                    <td className="c-cat">Debt</td>
                    <td className="num c-value">{fmt.money(-h.value)}</td>
                    <td className="num c-share"><span className="sr-only">Not counted in allocation</span></td>
                    {actions(h)}
                    {includeCell(h)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {form && <HoldingForm holding={form.holding} onClose={() => setForm(null)} />}
      {bulk && <BulkUpdate onClose={() => setBulk(false)} />}
    </section>
  );
}
