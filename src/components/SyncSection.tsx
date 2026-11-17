import { useEffect, useState } from 'react';
import { fmtDateTime } from '../lib/format';
import { enabledProviders } from '../lib/supabase';
import { useSync } from '../sync';
import { TextField } from './ui';

export function SyncSection() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [google, setGoogle] = useState(false);

  // The Google button appears only once Google sign-in is switched on for the sync service.
  useEffect(() => {
    let live = true;
    void enabledProviders().then((p) => live && setGoogle(p.google));
    return () => {
      live = false;
    };
  }, []);

  const emailError = /^\S+@\S+\.\S+$/.test(email.trim()) ? null : 'Enter your email address.';
  const passwordError = password.length >= 8 ? null : 'Enter a password of at least 8 characters.';

  const run = async (mode: 'in' | 'up') => {
    setSubmitted(true);
    setError(null);
    setInfo(null);
    if (emailError || passwordError) return;
    setWorking(true);
    try {
      if (mode === 'in') {
        setError(await sync.signIn(email.trim(), password));
      } else {
        const r = await sync.signUp(email.trim(), password);
        setError(r.error);
        if (r.needsConfirmation) setInfo(`Account created. Open the confirmation link sent to ${email.trim()}, then come back here and press Sign in.`);
      }
    } catch {
      setError('Could not reach the sync service. Check your connection and try again.');
    } finally {
      setWorking(false);
    }
  };

  let body;
  if (sync.phase === 'off') {
    body = <p>Sync is not set up for this copy of the app, so data stays on this device only.</p>;
  } else if (sync.user) {
    const state =
      sync.phase === 'checking'
        ? 'Checking your account.'
        : sync.phase === 'conflict'
          ? 'Waiting for you to choose which data to keep.'
          : sync.status === 'saving'
            ? 'Saving changes to your account.'
            : sync.status === 'error'
              ? 'Not synced. Changes are saved on this device and will sync when the connection returns.'
              : sync.meta.syncedAt
                ? `Up to date. Last saved to your account on ${fmtDateTime(sync.meta.syncedAt)}.`
                : 'Signed in. Your portfolio is saved to your account as soon as you add a holding.';
    body = (
      <>
        <p>
          Signed in as <strong>{sync.user.email}</strong>. Changes save to your account automatically and appear on your other devices when
          you open the app there.
        </p>
        <p role="status">{state}</p>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={sync.syncNow}>Sync now</button>
          <button type="button" className="btn btn-secondary" onClick={() => void sync.signOut()}>Sign out</button>
        </div>
        <p className="hint">Signing out keeps the data on this device and stops syncing it.</p>
      </>
    );
  } else {
    body = (
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void run('in');
        }}
      >
        <p>
          Sign in to see the same portfolio on your phone and computer. Your data is then stored in your account as well as on this device.
          Without signing in, it stays on this device only.
        </p>
        {google && (
          <div className="sso">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={working}
              onClick={() => {
                setError(null);
                void sync.signInWithGoogle().then(setError);
              }}
            >
              Continue with Google
            </button>
            <p className="hint">No password or confirmation email needed. Or use an email and password below.</p>
          </div>
        )}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={submitted ? emailError : null} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={submitted ? passwordError : null}
        />
        {error && <p className="error" role="alert">Error: {error}</p>}
        {info && <p role="status"><strong>{info}</strong></p>}
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={working}>Sign in</button>
          <button type="button" className="btn btn-secondary" disabled={working} onClick={() => void run('up')}>Create account</button>
        </div>
      </form>
    );
  }

  return (
    <div className="setting">
      <h2 className="sub-heading">Sync across devices</h2>
      <div className="setting-body">{body}</div>
    </div>
  );
}
