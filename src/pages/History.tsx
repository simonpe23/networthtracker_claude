import { useState } from 'react';
import type { Snapshot, SnapshotHolding } from '../types';
import { inAllocation, sum } from '../lib/calc';
import { adjustSnapshot, makeExclusion, snapshotHoldingExcluded, type Exclusion } from '../lib/exclude';
import { fmtDate, fmtDateTime, pct } from '../lib/format';
import { useHiddenCategories } from '../lib/hidden';
import { useStore } from '../state';
import { deletedLabel, HoldingCharts, METRIC_LABEL, PortfolioChart, useRange, type Metric } from '../components/charts';
import { Select } from '../components/Select';
import { Confirm, Dialog } from '../components/ui';

const PORTFOLIO = '__portfolio__';

/**
 * A saved snapshot shown like the Holdings table: every holding exactly as it was saved,
 * with the category it had at that moment and its value. Nothing here follows later edits.
 */
function SnapshotDialog({ snapshot, ex, onClose }: { snapshot: Snapshot; ex: Exclusion; onClose: () => void }) {
  const { data, fmt } = useStore();
  const when = fmtDateTime(snapshot.takenAt);
  const shown = adjustSnapshot(snapshot, ex) ?? snapshot;
  const opt = (n: number | null) => (n === null ? 'Not recorded' : fmt.money(n));

  // Same order as the Holdings table: largest first, categories outside the allocation last.
  const outside = new Set(data.categories.filter((c) => !inAllocation(c)).flatMap((c) => [c.id, c.name]));
  const isOutside = (h: SnapshotHolding) => (h.categoryId ? outside.has(h.categoryId) : h.category !== null && outside.has(h.category));
  const rows = snapshot.holdings ?? [];
  const assets = rows.filter((h) => h.kind === 'asset').sort((a, b) => Number(isOutside(a)) - Number(isOutside(b)) || b.value - a.value);
  const debts = rows.filter((h) => h.kind === 'debt').sort((a, b) => b.value - a.value);
  const excluded = sum(assets.filter((h) => snapshotHoldingExcluded(h, ex)).map((h) => h.value));
  const count = (n: number) => `${n} ${n === 1 ? 'holding' : 'holdings'}`;

  const row = (h: SnapshotHolding) => (
    <tr key={h.holdingId} className={snapshotHoldingExcluded(h, ex) ? 'row is-left-out' : 'row'}>
      <th scope="row" className="c-name">
        <span className="name">{h.name}</span>
        {h.institution && <span className="inst">{h.institution}</span>}
      </th>
      <td className="c-cat">{h.kind === 'debt' ? 'Debt' : h.category ?? 'Uncategorised'}</td>
      <td className="num c-value">{fmt.money(h.kind === 'debt' ? -h.value : h.value)}</td>
    </tr>
  );

  return (
    <Dialog title={`Snapshot of ${when}`} onClose={onClose} wide focusTitle>
      <dl className="snap-totals">
        <div><dt>Net worth</dt><dd>{fmt.money(shown.netWorth)}</dd></div>
        <div><dt>Total assets</dt><dd>{opt(shown.totalAssets)}</dd></div>
        <div><dt>Total debts</dt><dd>{opt(snapshot.totalDebts)}</dd></div>
      </dl>
      {!snapshot.holdings ? (
        <p className="dialog-text">This older snapshot recorded totals only. No holdings were saved with it, so none are shown.</p>
      ) : (
        <table className="holdings snap-holdings">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col" className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {assets.length > 0 && (
              <tr className="group">
                <th scope="rowgroup" colSpan={2}>
                  Assets <span className="count">{count(assets.length)}</span>
                  {excluded > 0 && <span className="count">{fmt.money(excluded)} excluded</span>}
                </th>
                <td className="num">{fmt.money(sum(assets.filter((h) => !snapshotHoldingExcluded(h, ex)).map((h) => h.value)))}</td>
              </tr>
            )}
            {assets.map(row)}
            {debts.length > 0 && (
              <tr className="group">
                <th scope="rowgroup" colSpan={2}>
                  Debts <span className="count">{count(debts.length)}</span>
                </th>
                <td className="num">{fmt.money(-sum(debts.map((h) => h.value)))}</td>
              </tr>
            )}
            {debts.map(row)}
          </tbody>
        </table>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Dialog>
  );
}

/** Quiet reminder that the figures follow the In net worth checkboxes on the Holdings page. */
function SnapshotNote() {
  const { data } = useStore();
  const [hidden] = useHiddenCategories();
  const ex = makeExclusion(data, hidden);
  if (!ex.active || data.snapshots.length === 0) return null;
  return <p className="hint">Totals exclude {ex.label}, as on the Holdings page. Each snapshot keeps every holding it saved.</p>;
}

function SnapshotList() {
  const { data, dispatch, fmt, notify } = useStore();
  const [hidden] = useHiddenCategories();
  const ex = makeExclusion(data, hidden);
  const [open, setOpen] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Snapshot | null>(null);
  const snapshots = [...data.snapshots].reverse();
  const opt = (n: number | null) => (n === null ? 'Not recorded' : fmt.money(n));
  const opened = data.snapshots.find((s) => s.id === open) ?? null;

  if (snapshots.length === 0) {
    return <p className="empty">No snapshots saved yet. Use Take snapshot to keep a permanent copy of your portfolio as it is now.</p>;
  }
  return (
    <>
      <table className="data-table stack-table snapshots">
        <thead>
          <tr>
            <th scope="col">Saved</th>
            <th scope="col" className="num">Net worth</th>
            <th scope="col" className="num">Total assets</th>
            <th scope="col" className="num">Total debts</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => {
            const when = fmtDateTime(s.takenAt);
            const shown = adjustSnapshot(s, ex) ?? s;
            return (
              <tr key={s.id}>
                <th scope="row">{when}</th>
                <td className="num strong" data-label="Net worth">{fmt.money(shown.netWorth)}</td>
                <td className="num" data-label="Total assets">{opt(shown.totalAssets)}</td>
                <td className="num" data-label="Total debts">{opt(s.totalDebts)}</td>
                <td className="row-actions">
                  <button type="button" className="link" aria-haspopup="dialog" aria-label={`View holdings in snapshot of ${when}`} onClick={() => setOpen(s.id)}>
                    View holdings
                  </button>
                  <button type="button" className="link" aria-label={`Delete snapshot of ${when}`} onClick={() => setToDelete(s)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {opened && <SnapshotDialog snapshot={opened} ex={ex} onClose={() => setOpen(null)} />}
      {toDelete && (
        <Confirm
          title="Delete this snapshot?"
          body={<p>The snapshot of {fmtDateTime(toDelete.takenAt)} is removed for good. Daily history is not affected.</p>}
          confirmLabel="Delete snapshot"
          onClose={() => setToDelete(null)}
          onConfirm={() => {
            dispatch({ type: 'deleteSnapshot', id: toDelete.id });
            notify({ text: `Deleted the snapshot of ${fmtDateTime(toDelete.takenAt)}.` });
            setToDelete(null);
          }}
        />
      )}
    </>
  );
}

function HoldingSnapshots({ id }: { id: string }) {
  const { data, fmt } = useStore();
  const rows = [...data.snapshots].reverse().flatMap((s) => {
    const h = s.holdings?.find((x) => x.holdingId === id);
    return h ? [{ s, h }] : [];
  });
  if (rows.length === 0) return <p className="empty">No saved snapshot includes this holding.</p>;
  return (
    <table className="data-table stack-table">
      <thead>
        <tr>
          <th scope="col">Saved</th>
          <th scope="col">Name at the time</th>
          <th scope="col">Category at the time</th>
          <th scope="col" className="num">Value</th>
          <th scope="col" className="num">% of assets</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ s, h }) => (
          <tr key={s.id}>
            <th scope="row">{fmtDateTime(s.takenAt)}</th>
            <td data-label="Name at the time">{h.name}</td>
            <td data-label="Category at the time">{h.kind === 'debt' ? 'Debt' : h.category ?? 'Uncategorised'}</td>
            <td className="num strong" data-label="Value">{fmt.money(h.kind === 'debt' ? -h.value : h.value)}</td>
            <td className="num" data-label="% of assets">{h.pct === null ? 'Not counted' : pct(h.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HistoryPage({ holdingId }: { holdingId: string | null }) {
  const { data, fmt } = useStore();
  const [metric, setMetric] = useState<Metric>('netWorth');
  const [range, setRange] = useRange();

  const active = data.holdings.find((h) => h.id === holdingId);
  const removed = data.removedHoldings.find((h) => h.id === holdingId);
  const scope = active || removed ? (holdingId as string) : PORTFOLIO;
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));

  const options = [
    { value: PORTFOLIO, label: 'Entire portfolio' },
    ...[...data.holdings].sort((a, b) => a.name.localeCompare(b.name)).map((h) => ({ value: h.id, label: h.name })),
    ...data.removedHoldings.map((h) => ({ value: h.id, label: `${h.name} (deleted)` })),
  ];

  return (
    <section className="page" aria-labelledby="page-title">
      <h1 id="page-title" className="page-heading">History</h1>
      <p className="lead">
        The line is the automatic daily history: one value per day, updated whenever a balance changes. The dots are snapshots you saved
        yourself, which never change afterwards.
      </p>
      <div className="toolbar history-toolbar">
        <Select
          label="Show history for"
          className="field-wide"
          value={scope}
          options={options}
          onChange={(v) => {
            window.location.hash = v === PORTFOLIO ? '#/history' : `#/history/${v}`;
          }}
        />
        {scope === PORTFOLIO && (
          <Select
            label="Measure"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))}
          />
        )}
      </div>

      {scope === PORTFOLIO ? (
        <>
          {data.daily.length === 0 && data.snapshots.length === 0 ? (
            <p className="empty">History appears here once you add a holding.</p>
          ) : (
            <PortfolioChart metric={metric} range={range} onRange={setRange} />
          )}
          <h2 className="sub-heading list-heading">Saved snapshots</h2>
          <SnapshotNote />
          <SnapshotList />
        </>
      ) : (
        <>
          <p className="holding-meta">
            {active ? (
              <>
                <strong>{active.name}</strong>
                {active.institution && `, ${active.institution}`}. {active.kind === 'debt' ? 'Debt' : (active.categoryId && catName.get(active.categoryId)) || 'Uncategorised'}.{' '}
                {active.kind === 'debt' ? 'Currently owed' : 'Current value'}: {fmt.money(active.value)}.
              </>
            ) : (
              <>
                <strong>{removed!.name}</strong>. {removed!.kind === 'debt' ? 'Debt' : removed!.category ?? 'Uncategorised'}. {deletedLabel(removed!.deletedAt)}. Its recorded
                history up to {fmtDate(removed!.deletedAt)} is kept.
              </>
            )}
          </p>
          <HoldingCharts id={scope} range={range} onRange={setRange} />
          <h2 className="sub-heading list-heading">Saved snapshots with this holding</h2>
          <HoldingSnapshots id={scope} />
        </>
      )}
    </section>
  );
}
