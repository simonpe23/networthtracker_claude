import { allocation, hasTargets, outsideAllocation } from '../lib/calc';
import { pct, signedPts } from '../lib/format';
import { useStore } from '../state';

export function DiffPts({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">No target</span>;
  if (Math.abs(value) < 0.05) return <span>On target</span>;
  return <span className={value > 0 ? 'over' : 'under'}>{signedPts(value)} {value > 0 ? 'over' : 'under'}</span>;
}

export function DiffMoney({ value }: { value: number | null }) {
  const { fmt, data } = useStore();
  if (value === null) return <span className="muted">No target</span>;
  if (Math.abs(value) < (data.showCents ? 0.005 : 0.5)) return <span>On target</span>;
  return <span className={value > 0 ? 'over' : 'under'}>{fmt.signedMoney(value)} {value > 0 ? 'over' : 'under'}</span>;
}

/** Actual share per category as a bar, with the target marked, next to the numbers. */
export function AllocationTable() {
  const { data, fmt } = useStore();
  const rows = allocation(data);
  const outside = outsideAllocation(data);
  const targets = hasTargets(data.categories);
  const top = Math.max(10, ...rows.map((r) => Math.max(r.actual, r.target ?? 0)));
  const scale = Math.min(100, Math.ceil(top / 10) * 10);

  if (rows.every((r) => r.value === 0) && outside.every((r) => r.value === 0)) {
    return <p className="empty">Add an asset to see how your money is spread across categories.</p>;
  }

  return (
    <>
      <ul className="legend" aria-label="Legend">
        <li>
          <span className="swatch" aria-hidden="true" />
          Actual share of total assets
        </li>
        {targets && (
          <li>
            <span className="swatch-target" aria-hidden="true" />
            Target
          </li>
        )}
      </ul>
      <table className="data-table stack-table allocation">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="col-bar"><span className="sr-only">Actual against target</span></th>
            <th scope="col" className="num">Value</th>
            <th scope="col" className="num">Actual</th>
            {targets && <th scope="col" className="num">Target</th>}
            {targets && <th scope="col" className="num">Difference</th>}
            {targets && <th scope="col" className="num">Amount vs target</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? 'none'}>
              <th scope="row">{r.name}</th>
              <td className="col-bar">
                <span className="alloc-bar" aria-hidden="true">
                  <span className="fill" style={{ width: `${(r.actual / scale) * 100}%` }} />
                  {r.target !== null && <span className="target" style={{ left: `${(r.target / scale) * 100}%` }} />}
                </span>
              </td>
              <td className="num" data-label="Value">{fmt.money(r.value)}</td>
              <td className="num strong" data-label="Actual">{pct(r.actual)}</td>
              {targets && <td className="num" data-label="Target">{r.target === null ? 'None' : pct(r.target)}</td>}
              {targets && <td className="num" data-label="Difference"><DiffPts value={r.diffPct} /></td>}
              {targets && <td className="num" data-label="Amount vs target"><DiffMoney value={r.diffAmount} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {outside.length > 0 && (
        <>
          <h3 className="sub-heading list-heading">Outside allocation</h3>
          <p className="hint">Counted in net worth and total assets. Left out of the percentages and targets above.</p>
          <table className="data-table stack-table outside-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">Holdings</th>
                <th scope="col" className="num">Value</th>
                <th scope="col" className="num">% of total assets</th>
              </tr>
            </thead>
            <tbody>
              {outside.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td className="num" data-label="Holdings">{r.count}</td>
                  <td className="num" data-label="Value">{fmt.money(r.value)}</td>
                  <td className="num" data-label="% of total assets">{r.ofTotal === null ? pct(0) : pct(r.ofTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
