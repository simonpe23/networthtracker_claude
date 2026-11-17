import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtTime } from './lib/format';
import { useStore } from './state';
import { AllocationPage } from './pages/Allocation';
import { Dashboard, ExampleNote } from './pages/Dashboard';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';

const NAV = [
  { href: '#/', label: 'Holdings', key: '' },
  { href: '#/allocation', label: 'Allocation', key: 'allocation' },
  { href: '#/history', label: 'History', key: 'history' },
  { href: '#/settings', label: 'Settings', key: 'settings' },
];

function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const { data, dispatch, notice, notify } = useStore();
  const route = useRoute();
  const page = NAV.some((n) => n.key === route[0]) ? route[0] : '';
  const [menuOpen, setMenuOpen] = useState(false);

  const firstRender = useRef(true);
  useEffect(() => {
    // A message belongs to the page it appeared on.
    if (!firstRender.current) notify(null);
    firstRender.current = false;
    setMenuOpen(false);
    window.scrollTo(0, 0);
    const label = NAV.find((n) => n.key === page)!.label;
    document.title = `${label} | SP Net Worth Tracker`;
  }, [page, notify]);

  const takeSnapshot = () => {
    if (data.holdings.length === 0) {
      notify({ text: 'Add a holding before taking a snapshot.' });
      return;
    }
    const now = new Date();
    dispatch({ type: 'takeSnapshot' });
    notify({ text: `Snapshot saved on ${fmtDate(now)} at ${fmtTime(now)}.`, link: { href: '#/history', label: 'View in History' } });
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="container header-row">
          <a className="wordmark" href="#/">SP Net Worth Tracker</a>
          <nav className={`site-nav${menuOpen ? ' is-open' : ''}`} id="site-nav" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.key} href={item.href} aria-current={item.key === page ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <button className="btn btn-primary header-snapshot" type="button" onClick={takeSnapshot}>Take snapshot</button>
          <button className="btn btn-secondary menu-button" type="button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      <div className="container" role="status" aria-live="polite">
        {notice && (
          <p className="notice">
            <span>
              {notice.text}{' '}
              {notice.link && <a className="link" href={notice.link.href} onClick={() => notify(null)}>{notice.link.label}</a>}
            </span>
            <button type="button" className="link" onClick={() => notify(null)}>Dismiss</button>
          </p>
        )}
      </div>

      <main className="container" id="main" tabIndex={-1}>
        {page === '' && <Dashboard onSnapshot={takeSnapshot} />}
        {page !== '' && <ExampleNote />}
        {page === 'allocation' && <AllocationPage />}
        {page === 'history' && <HistoryPage holdingId={route[1] ?? null} />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </>
  );
}
