import { useState } from 'react';
import { allocation, allocationBase, inAllocation, round2, sum, totals } from '../lib/calc';
import { fmtDate, pct } from '../lib/format';
import { useStore } from '../state';
import { AllocationTable } from '../components/AllocationTable';
import { PortfolioChart, useRange } from '../components/charts';
import { HoldingsSection } from '../components/HoldingsSection';
import { STORAGE_KEY } from '../lib/store';
import { Confirm } from '../components/ui';

const HIDDEN_KEY = `${STORAGE_KEY}.hiddenCategories`;

/** Per-device preference: categories outside the allocation left out of the net worth figure. */
function useHiddenCategories(): [Set<string>, (id: string, hide: boolean) => void] {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as unknown;
      return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string, hide: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (hide) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* the choice simply resets next visit */
      }
      return next;
    });
  };
  return [hidden, toggle];
}

const listNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '');

export function ExampleNote() {
  const { data, dispatch, notify } = useStore();
  const [confirm, setConfirm] = useState(false);
  if (!data.isExample) return null;
  return (
    <div className="example-note">
      <span><strong>Example portfolio.</strong> These figures are sample data, not yours.</span>
      <button className="btn btn-secondary" type="button" onClick={() => setConfirm(true)}>Start my portfolio</button>
      {confirm && (
        <Confirm
          title="Start my portfolio?"
          body={
            <>
              <p>The example holdings, history and snapshots are removed and you begin with an empty portfolio.</p>
              <p>The category names stay. You can change them on the Allocation page.</p>
            </>
          }
          confirmLabel="Start my portfolio"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            dispatch({ type: 'startFresh' });
            notify({ text: 'Example data removed. Add your first holding to begin.' });
            setConfirm(false);
          }}
        />
      )}
    </div>
  );
}

export function Dashboard({ onSnapshot }: { onSnapshot: () => void }) {
  const { data, fmt } = useStore();
  const [range, setRange] = useRange();
  const full = totals(data.holdings);
  const { base, counts, anyExcluded } = allocationBase(data);
  // Each category outside the allocation can be left out of the net worth figure on its own.
  const outsideCats = data.categories.filter((c) => !inAllocation(c));
  const [hidden, toggleHidden] = useHiddenCategories();
  const hiddenCats = outsideCats.filter((c) => hidden.has(c.id));
  const hiddenIds = new Set(hiddenCats.map((c) => c.id));
  const leftOut = sum(data.holdings.filter((h) => h.kind === 'asset' && h.categoryId !== null && hiddenIds.has(h.categoryId)).map((h) => h.value));
  const excluding = hiddenCats.length > 0;
  const namesText = listNames(hiddenCats.map((c) => c.name));
  // Debts always count in full: they are not tied to any category.
  const t = excluding
    ? { totalAssets: round2(full.totalAssets - leftOut), totalDebts: full.totalDebts, netWorth: round2(full.netWorth - leftOut) }
    : full;

  const last = data.snapshots[data.snapshots.length - 1];
  const change = last ? t.netWorth - last.netWorth : 0;
  const changePct = last && last.netWorth !== 0 ? (change / Math.abs(last.netWorth)) * 100 : null;

  const assets = data.holdings.filter(counts).sort((a, b) => b.value - a.value);
  const topHolding = assets[0];
  const topCategory = allocation(data).sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <ExampleNote />
      <section className="summary" aria-labelledby="nw-label">
        <h1 id="nw-label" className="eyebrow">{excluding ? `Net worth without ${namesText}` : 'Net worth'}</h1>
        <p className="net-worth">{fmt.money(t.netWorth)}</p>
        <dl className="totals">
          <div><dt>Total assets</dt><dd>{fmt.money(t.totalAssets)}</dd></div>
          <div><dt>Total debts</dt><dd>{fmt.money(t.totalDebts)}</dd></div>
        </dl>
        <p className="since">
          {excluding
            ? `Leaves out ${fmt.money(leftOut)} in ${namesText}. Debts are counted in full.`
            : last
            ? `${fmt.signedMoney(change)}${changePct === null ? '' : ` (${change < 0 ? '−' : '+'}${Math.abs(changePct).toFixed(1)}%)`} since the snapshot of ${fmtDate(last.takenAt)}`
            : 'No snapshots saved yet. Take one to mark this moment.'}
        </p>
        <button className="btn btn-primary summary-snapshot" type="button" onClick={onSnapshot}>Take snapshot</button>
      </section>

      <HoldingsSection hiddenCategoryIds={hiddenIds} onToggleCategory={toggleHidden} />

      <section className="section" aria-labelledby="growth-heading">
        <div className="section-head">
          <h2 id="growth-heading" className="page-heading">Portfolio growth</h2>
          <a className="link" href="#/history">Open history</a>
        </div>
        {data.daily.length === 0 ? (
          <p className="empty">Your net worth over time appears here once you add a holding.</p>
        ) : (
          <PortfolioChart metric="netWorth" range={range} onRange={setRange} />
        )}
      </section>

      <section className="section" aria-labelledby="alloc-heading">
        <div className="section-head">
          <h2 id="alloc-heading" className="page-heading">Allocation</h2>
          <a className="link" href="#/allocation">Manage categories and targets</a>
        </div>
        {topHolding && topCategory && base > 0 && (
          <p className="lead">
            Largest holding: {topHolding.name}, {pct((topHolding.value / base) * 100)} of {anyExcluded ? 'allocated assets' : 'total assets'}. Largest category:{' '}
            {topCategory.name}, {pct(topCategory.actual)}.
          </p>
        )}
        <AllocationTable />
      </section>
    </>
  );
}
