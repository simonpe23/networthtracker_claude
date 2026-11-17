// Static prototype of the dashboard first screen. Figures are computed from the
// sample data below, controls are not wired up yet.
import { useState } from 'react';

type Holding = {
  id: string;
  kind: 'asset' | 'debt';
  name: string;
  institution?: string;
  category?: string;
  value: number;
};

const HOLDINGS: Holding[] = [
  { id: 'a1', kind: 'asset', name: 'Global index fund', institution: 'Interactive Brokers', category: 'Index Funds', value: 412300 },
  { id: 'a2', kind: 'asset', name: 'Bitcoin', institution: 'Cold wallet', category: 'Bitcoin', value: 268400 },
  { id: 'a3', kind: 'asset', name: 'S&P 500 fund', institution: 'Interactive Brokers', category: 'Index Funds', value: 186750 },
  { id: 'a4', kind: 'asset', name: 'Savings account', institution: 'Marcus', category: 'Cash', value: 94200 },
  { id: 'a5', kind: 'asset', name: 'Angel investments', category: 'High Risk', value: 60000 },
  { id: 'a6', kind: 'asset', name: 'Altcoins', institution: 'Kraken', category: 'High Risk', value: 41900 },
  { id: 'a7', kind: 'asset', name: 'Car', category: 'Other', value: 22000 },
  { id: 'a8', kind: 'asset', name: 'Checking account', institution: 'Chase', category: 'Cash', value: 18650 },
  { id: 'd1', kind: 'debt', name: 'Car loan', institution: 'Chase', value: 14300 },
  { id: 'd2', kind: 'debt', name: 'Credit card', institution: 'Amex', value: 3250 },
];

const money = (n: number) =>
  (n < 0 ? '−' : '') +
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n));
const pct = (n: number) => `${n.toFixed(1)}%`;

const NAV = ['Holdings', 'Allocation', 'History', 'Settings'];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const assets = HOLDINGS.filter((h) => h.kind === 'asset').sort((a, b) => b.value - a.value);
  const debts = HOLDINGS.filter((h) => h.kind === 'debt').sort((a, b) => b.value - a.value);
  const totalAssets = assets.reduce((s, h) => s + h.value, 0);
  const totalDebts = debts.reduce((s, h) => s + h.value, 0);
  const netWorth = totalAssets - totalDebts;

  return (
    <>
      <header className="site-header">
        <div className="container header-row">
          <a className="wordmark" href="#">SP Net Worth Tracker</a>
          <nav className={`site-nav${menuOpen ? ' is-open' : ''}`} id="site-nav" aria-label="Main">
            {NAV.map((item, i) => (
              <a key={item} href="#" aria-current={i === 0 ? 'page' : undefined}>{item}</a>
            ))}
          </nav>
          <button className="btn btn-primary header-snapshot" type="button">Take snapshot</button>
          <button
            className="btn btn-secondary menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      <main className="container">
        <p className="example-note">
          <span><strong>Example portfolio.</strong> These figures are sample data, not yours.</span>
          <button className="btn btn-secondary" type="button">Start my portfolio</button>
        </p>

        <section className="summary" aria-labelledby="nw-label">
          <h1 id="nw-label" className="eyebrow">Net worth</h1>
          <p className="net-worth">{money(netWorth)}</p>
          <dl className="totals">
            <div><dt>Total assets</dt><dd>{money(totalAssets)}</dd></div>
            <div><dt>Total debts</dt><dd>{money(totalDebts)}</dd></div>
          </dl>
          <p className="since">+$8,420 (+0.8%) since the snapshot of 1 Nov 2026</p>
          <button className="btn btn-primary summary-snapshot" type="button">Take snapshot</button>
        </section>

        <section className="section" aria-labelledby="holdings-heading">
          <div className="section-head">
            <h2 id="holdings-heading" className="page-heading">Holdings</h2>
            <div className="section-actions">
              <button className="btn btn-secondary" type="button">Update balances</button>
              <button className="btn btn-primary" type="button">Add holding</button>
            </div>
          </div>

          <div className={`toolbar${filtersOpen ? ' is-open' : ''}`}>
            <div className="field field-search">
              <label htmlFor="search">Search holdings</label>
              <input id="search" type="text" autoComplete="off" />
            </div>
            <button
              className="btn btn-secondary filters-button"
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filters
            </button>
            <div className="field field-filter">
              <span className="label" id="cat-label">Category</span>
              <button className="select" type="button" aria-haspopup="listbox" aria-labelledby="cat-label cat-value">
                <span id="cat-value">All categories</span>
                <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden="true"><path d="M1 1.5l6 6 6-6" fill="none" stroke="#131313" strokeWidth="1.75" /></svg>
              </button>
            </div>
            <div className="field field-filter">
              <span className="label" id="show-label">Show</span>
              <div className="segmented" role="group" aria-labelledby="show-label">
                <button type="button" aria-pressed="true">All</button>
                <button type="button" aria-pressed="false">Assets</button>
                <button type="button" aria-pressed="false">Debts</button>
              </div>
            </div>
          </div>

          <table className="holdings">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">Value</th>
                <th scope="col" className="num">% of assets</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr className="group">
                <th scope="rowgroup" colSpan={2}>Assets <span className="count">{assets.length} holdings</span></th>
                <td className="num">{money(totalAssets)}</td>
                <td className="num">{pct(100)}</td>
                <td />
              </tr>
              {assets.map((h) => {
                const share = (h.value / totalAssets) * 100;
                return (
                  <tr key={h.id} className="row">
                    <th scope="row" className="c-name">
                      <span className="name">{h.name}</span>
                      {h.institution && <span className="inst">{h.institution}</span>}
                    </th>
                    <td className="c-cat">{h.category}</td>
                    <td className="num c-value">{money(h.value)}</td>
                    <td className="num c-share">
                      <span className="bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
                      <span className="share-num">{pct(share)}</span>
                    </td>
                    <td className="c-actions">
                      <button className="link" type="button" aria-label={`Edit ${h.name}`}>Edit</button>
                      <button className="link" type="button" aria-label={`History for ${h.name}`}>History</button>
                    </td>
                  </tr>
                );
              })}
              <tr className="group">
                <th scope="rowgroup" colSpan={2}>Debts <span className="count">{debts.length} holdings</span></th>
                <td className="num">{money(-totalDebts)}</td>
                <td className="num" />
                <td />
              </tr>
              {debts.map((h) => (
                <tr key={h.id} className="row">
                  <th scope="row" className="c-name">
                    <span className="name">{h.name}</span>
                    {h.institution && <span className="inst">{h.institution}</span>}
                  </th>
                  <td className="c-cat">Debt</td>
                  <td className="num c-value">{money(-h.value)}</td>
                  <td className="num c-share"><span className="sr-only">Not counted in allocation</span></td>
                  <td className="c-actions">
                    <button className="link" type="button" aria-label={`Edit ${h.name}`}>Edit</button>
                    <button className="link" type="button" aria-label={`History for ${h.name}`}>History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
