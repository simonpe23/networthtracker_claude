import { useState } from 'react';
import type { Snapshot } from '../types';
import { adjustSnapshot, makeExclusion, snapshotHoldingExcluded, type Exclusion } from '../lib/exclude';
import { fmtDate, fmtDateTime, pct } from '../lib/format';
import { useHiddenCategories } from '../lib/hidden';
import { useStore } from '../state';
import { deletedLabel, HoldingCharts, METRIC_LABEL, PortfolioChart, useRange, type Metric } from '../components/charts';
import { Select } from '../components/Select';
import { Confirm } from '../components/ui';

const PORTFOLIO = '__portfolio__';

function SnapshotDetail({ snapshot, ex }: { snapshot: Snapshot; ex: Exclusion }) {
  const { fmt } = useStore();
  if (!snapshot.holdings) {
    return <p className="panel">This older snapshot recorded totals only. No holdings were saved with it, so none are shown.</p>;
  }
  const rows = [...snapshot.holdings].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'asset' ? -1 : 1));
  return (
    <div className="panel">
      <p className="hint">Holdings exactly as they were on {fmtDateTime(snapshot.takenAt)}.</p>
      <table className="data-table mini-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Category</th>
            <th scope="col" className="num">Value</th>
            <th scope="col" className="num">% of assets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.holdingId} className={snapshotHoldingExcluded(h, ex) ? 'is-left-out' : undefined}>
              <th scope="row" className="m-name">
                {h.name}
                {h.institution && <span className="muted"> ({h.institution})</span>}
              </th>
              <td className="m-cat">{h.kind === 'debt' ? 'Debt' : h.category ?? 'Uncategorised'}</td>
              <td className="num m-value">{fmt.money(h.kind === 'debt' ? -h.value : h.value)}</td>
              <td className="num m-pct">{h.pct === null ? <span className="sr-only">Not counted in allocation</span> : pct(h.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
          {snapshots.flatMap((s) => {
            const isOpen = open === s.id;
            const when = fmtDateTime(s.takenAt);
            const shown = adjustSnapshot(s, ex) ?? s;
            return [
              <tr key={s.id} className={isOpen ? 'is-open' : undefined}>
                <th scope="row">{when}</th>
                <td className="num strong" data-label="Net worth">{fmt.money(shown.netWorth)}</td>
                <td className="num" data-label="Total assets">{opt(shown.totalAssets)}</td>
                <td className="num" data-label="Total debts">{opt(s.totalDebts)}</td>
                <td className="row-actions">
                  <button type="button" className="link" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'View'} holdings in snapshot of ${when}`} onClick={() => setOpen(isOpen ? null : s.id)}>
                    {isOpen ? 'Hide holdings' : 'View holdings'}
                  </button>
                  <button type="button" className="link" aria-label={`Delete snapshot of ${when}`} onClick={() => setToDelete(s)}>Delete</button>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${s.id}-detail`} className="detail-row">
                  <td colSpan={5}><SnapshotDetail snapshot={s} ex={ex} /></td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
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
