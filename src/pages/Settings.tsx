import { useRef, useState } from 'react';
import type { AppData } from '../types';
import { exportJson, parseBackup } from '../lib/backup';
import { localDate } from '../lib/format';
import { useStore } from '../state';
import { Select } from '../components/Select';
import { Checkbox, Confirm } from '../components/ui';

const CURRENCIES: [string, string][] = [
  ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['SEK', 'Swedish krona'], ['NOK', 'Norwegian krone'],
  ['DKK', 'Danish krone'], ['CHF', 'Swiss franc'], ['CAD', 'Canadian dollar'], ['AUD', 'Australian dollar'], ['NZD', 'New Zealand dollar'],
  ['JPY', 'Japanese yen'], ['SGD', 'Singapore dollar'], ['HKD', 'Hong Kong dollar'], ['THB', 'Thai baht'], ['AED', 'UAE dirham'],
  ['MXN', 'Mexican peso'], ['BRL', 'Brazilian real'], ['INR', 'Indian rupee'], ['ZAR', 'South African rand'], ['PLN', 'Polish zloty'],
];

const describe = (d: AppData) =>
  `${d.holdings.length} holdings, ${d.categories.length} categories, ${d.snapshots.length} saved snapshots and ${d.daily.length} days of daily history`;

export function SettingsPage() {
  const { data, dispatch, notify } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; data: AppData; notes: string[] } | null>(null);
  const [confirm, setConfirm] = useState<'example' | 'fresh' | null>(null);

  const currencies = CURRENCIES.some(([c]) => c === data.currency) ? CURRENCIES : [[data.currency, 'Imported currency'] as [string, string], ...CURRENCIES];

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportJson(data)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sp-net-worth-backup-${localDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify({ text: `Backup downloaded: ${describe(data)}.` });
  };

  const downloadExcel = async () => {
    const [{ default: writeExcelFile }, { buildWorkbook, workbookFileName }] = await Promise.all([
      import('write-excel-file/browser'),
      import('../lib/excel'),
    ]);
    await writeExcelFile(buildWorkbook(data)).toFile(workbookFileName());
    notify({ text: 'Excel file downloaded with 6 sheets: Summary, Holdings, Allocation, Snapshots, Snapshot holdings and Daily history.' });
  };

  const read = async (f: File) => {
    setImportError(null);
    const result = parseBackup(await f.text());
    if (!result.ok) setImportError(`${f.name} was not imported. ${result.error} Your current data is unchanged.`);
    else setPending({ name: f.name, data: result.data, notes: result.notes });
  };

  return (
    <section className="page" aria-labelledby="page-title">
      <h1 id="page-title" className="page-heading">Settings</h1>

      <div className="setting">
        <h2 className="sub-heading">Currency</h2>
        <div className="setting-body">
          <Select
            label="Currency label"
            value={data.currency}
            onChange={(currency) => {
              dispatch({ type: 'setCurrency', currency });
              notify({ text: `Amounts are now labelled in ${currency}. No amounts were converted.` });
            }}
            options={currencies.map(([code, name]) => ({ value: code, label: `${code}, ${name}` }))}
          />
          <p>
            Changing the currency only changes the label shown next to your amounts. It does not convert them. For example, a balance of 1,000
            stays 1,000 whether the label is USD or EUR.
          </p>
          <Checkbox label="Show cents in amounts" checked={data.showCents} onChange={(value) => dispatch({ type: 'setShowCents', value })} />
        </div>
      </div>

      <div className="setting">
        <h2 className="sub-heading">Backup</h2>
        <div className="setting-body">
          <p>
            Your data is saved in this browser only, in local storage. Nothing is sent anywhere. Export a backup regularly, because clearing
            the browser's site data erases it.
          </p>
          <p>Right now: {describe(data)}.</p>
          <p>
            The JSON backup is the complete copy and the only file that can be imported again. The Excel file is for reading and analysis: one
            sheet each for the summary, holdings, allocation, snapshots, snapshot holdings and daily history.
          </p>
          <div className="button-row">
            <button type="button" className="btn btn-primary" onClick={download}>Export backup (JSON)</button>
            <button type="button" className="btn btn-secondary" onClick={() => void downloadExcel()}>Export to Excel (.xlsx)</button>
            <button type="button" className="btn btn-secondary" onClick={() => file.current?.click()}>Import backup</button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Backup file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void read(f);
              }}
            />
          </div>
          {importError && <p className="error" role="alert">Error: {importError}</p>}
        </div>
      </div>

      <div className="setting">
        <h2 className="sub-heading">Portfolio data</h2>
        <div className="setting-body">
          <p>{data.isExample ? 'You are viewing the example portfolio.' : 'You are viewing your own portfolio.'}</p>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm('fresh')}>
              {data.isExample ? 'Start my portfolio' : 'Erase everything and start again'}
            </button>
            {!data.isExample && (
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm('example')}>Load example portfolio</button>
            )}
          </div>
        </div>
      </div>

      {pending && (
        <Confirm
          title="Replace current data with this backup?"
          body={
            <>
              <p>{pending.name} is valid and contains {describe(pending.data)}.</p>
              {pending.notes.map((n) => <p key={n}>{n}</p>)}
              <p>It replaces what is in this browser now: {describe(data)}.</p>
            </>
          }
          confirmLabel="Replace with backup"
          onClose={() => setPending(null)}
          onConfirm={() => {
            dispatch({ type: 'replace', data: pending.data });
            notify({ text: `Backup restored: ${describe(pending.data)}.` });
            setPending(null);
          }}
        />
      )}
      {confirm === 'fresh' && (
        <Confirm
          title={data.isExample ? 'Start my portfolio?' : 'Erase everything?'}
          body={
            <>
              <p>All holdings, daily history and saved snapshots in this browser are removed. Category names stay.</p>
              {!data.isExample && <p>This cannot be undone. Export a backup first if you might want this data again.</p>}
            </>
          }
          confirmLabel={data.isExample ? 'Start my portfolio' : 'Erase everything'}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            dispatch({ type: 'startFresh' });
            notify({ text: 'Portfolio is now empty. Add your first holding on the Holdings page.' });
            setConfirm(null);
          }}
        />
      )}
      {confirm === 'example' && (
        <Confirm
          title="Load the example portfolio?"
          body={<p>It replaces everything in this browser: {describe(data)}. Export a backup first if you want to keep your data.</p>}
          confirmLabel="Load example"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            dispatch({ type: 'loadExample' });
            notify({ text: 'Example portfolio loaded.' });
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}
