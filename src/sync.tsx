import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import { parseBackup } from './lib/backup';
import { totals } from './lib/calc';
import { fmtDateTime } from './lib/format';
import { STORAGE_KEY } from './lib/store';
import { supabase, TABLE } from './lib/supabase';
import { decide, EMPTY_META, type SyncMeta } from './lib/syncLogic';
import { useStore } from './state';
import { Dialog } from './components/ui';

interface Remote {
  data: unknown;
  revision: number;
  updated_at: string;
}
interface User {
  id: string;
  email: string;
}
export type Phase = 'off' | 'signedOut' | 'checking' | 'ready' | 'conflict';
export type Status = 'synced' | 'saving' | 'error';

interface Sync {
  phase: Phase;
  status: Status;
  user: User | null;
  meta: SyncMeta;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => void;
}

const META_KEY = `${STORAGE_KEY}.sync`;
const Ctx = createContext<Sync | null>(null);

function loadMeta(): SyncMeta {
  try {
    return { ...EMPTY_META, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<SyncMeta>) };
  } catch {
    return EMPTY_META;
  }
}

const friendly = (message: string) => {
  if (/invalid login credentials/i.test(message)) return 'Email or password is wrong.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link in the email we sent, then sign in here.';
  if (/failed to fetch|network/i.test(message)) return 'Could not reach the sync service. Check your connection and try again.';
  return message;
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, dispatch, notify, fmt } = useStore();
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhaseState] = useState<Phase>(supabase ? 'signedOut' : 'off');
  const [status, setStatus] = useState<Status>('synced');
  const [meta, setMetaState] = useState<SyncMeta>(loadMeta);
  const [conflict, setConflict] = useState<Remote | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const metaRef = useRef(meta);
  const phaseRef = useRef(phase);
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const seen = useRef<AppData>(data);
  const applying = useRef(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => void>(() => {});

  const setMeta = useCallback((m: SyncMeta) => {
    metaRef.current = m;
    setMetaState(m);
    try {
      localStorage.setItem(META_KEY, JSON.stringify(m));
    } catch {
      /* the next successful sync repairs this */
    }
  }, []);
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const fetchRemote = useCallback(async (uid: string): Promise<Remote | null> => {
    const { data: rows, error } = await supabase!.from(TABLE).select('data,revision,updated_at').eq('user_id', uid).limit(1);
    if (error) throw new Error(error.message);
    return (rows?.[0] as Remote | undefined) ?? null;
  }, []);

  const applyRemote = useCallback(
    (remote: Remote, uid: string) => {
      const parsed = parseBackup(JSON.stringify(remote.data));
      if (!parsed.ok) throw new Error(`The data in your account could not be read. ${parsed.error}`);
      applying.current = true;
      dispatch({ type: 'replace', data: parsed.data });
      setMeta({ userId: uid, revision: remote.revision, syncedAt: remote.updated_at, dirty: false });
    },
    [dispatch, setMeta],
  );

  /**
   * Saves this device's data to the account. Without `force` it only succeeds if the
   * account still holds the revision this device last saw, so another device's newer
   * changes are never overwritten unnoticed.
   */
  const push = useCallback(
    async (uid: string, force?: number): Promise<'ok' | 'conflict'> => {
      const local = dataRef.current;
      if (local.isExample) return 'ok';
      const known = metaRef.current.userId === uid ? metaRef.current.revision : null;
      const updated_at = new Date().toISOString();
      const table = supabase!.from(TABLE);
      let saved: { revision: number; updated_at: string } | undefined;
      if (force !== undefined) {
        const r = await table.upsert({ user_id: uid, data: local, revision: force, updated_at }, { onConflict: 'user_id' }).select('revision,updated_at');
        if (r.error) throw new Error(r.error.message);
        saved = r.data?.[0];
      } else if (known === null) {
        const r = await table.insert({ user_id: uid, data: local, revision: 1, updated_at }).select('revision,updated_at');
        if (r.error?.code === '23505') return 'conflict';
        if (r.error) throw new Error(r.error.message);
        saved = r.data?.[0];
      } else {
        const r = await table.update({ data: local, revision: known + 1, updated_at }).eq('user_id', uid).eq('revision', known).select('revision,updated_at');
        if (r.error) throw new Error(r.error.message);
        saved = r.data?.[0];
        if (!saved) return 'conflict';
      }
      if (!saved) throw new Error('The account did not confirm the save.');
      const changedMeanwhile = dataRef.current !== local;
      setMeta({ userId: uid, revision: saved.revision, syncedAt: saved.updated_at, dirty: changedMeanwhile });
      if (changedMeanwhile) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flushRef.current(), 1000);
      }
      return 'ok';
    },
    [setMeta],
  );

  const fail = useCallback(
    (e: unknown) => {
      setStatus((prev) => {
        if (prev !== 'error') {
          notify({ text: `Sync problem: ${friendly(e instanceof Error ? e.message : String(e))} Your changes are saved on this device and will sync later.` });
        }
        return 'error';
      });
    },
    [notify],
  );

  /** Compares this device with the account and pushes, pulls, or asks. */
  const reconcile = useCallback(
    async (uid: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        let remote = await fetchRemote(uid);
        let action = decide(dataRef.current, metaRef.current, remote, uid);
        if (action === 'push' && (await push(uid)) === 'conflict') {
          remote = await fetchRemote(uid);
          action = remote ? 'conflict' : 'none';
        }
        if (action === 'pull' && remote) applyRemote(remote, uid);
        if (action === 'conflict' && remote) {
          setConflict(remote);
          setPhase('conflict');
          return;
        }
        if (action === 'none' && metaRef.current.userId !== uid) {
          setMeta({ userId: uid, revision: remote?.revision ?? null, syncedAt: remote?.updated_at ?? null, dirty: false });
        }
        setStatus('synced');
        setPhase('ready');
      } catch (e) {
        fail(e);
        setPhase('ready');
      } finally {
        busy.current = false;
      }
    },
    [applyRemote, fail, fetchRemote, push, setMeta, setPhase],
  );

  const flush = useCallback(async () => {
    const u = userRef.current;
    if (!u || phaseRef.current !== 'ready') return;
    if (busy.current) {
      timer.current = setTimeout(() => flushRef.current(), 500);
      return;
    }
    busy.current = true;
    setStatus('saving');
    try {
      if ((await push(u.id)) === 'conflict') {
        const remote = await fetchRemote(u.id);
        if (remote) {
          setConflict(remote);
          setPhase('conflict');
        }
      }
      setStatus('synced');
    } catch (e) {
      fail(e);
    } finally {
      busy.current = false;
    }
  }, [fail, fetchRemote, push, setPhase]);
  flushRef.current = () => void flush();

  // Sign-in state
  useEffect(() => {
    if (!supabase) return;
    const toUser = (u: { id: string; email?: string } | undefined | null) => (u ? { id: u.id, email: u.email ?? '' } : null);
    const apply = (next: User | null) => setUser((prev) => (prev?.id === next?.id ? prev : next));
    void supabase.auth.getSession().then(({ data: s }) => apply(toUser(s.session?.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(toUser(session?.user)));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (!user) {
      setPhase('signedOut');
      setConflict(null);
      return;
    }
    setPhase('checking');
    void reconcile(user.id);
  }, [user, reconcile, setPhase]);

  // Every local change is saved to the account shortly after it happens.
  useEffect(() => {
    if (seen.current === data) return;
    seen.current = data;
    if (applying.current) {
      applying.current = false;
      return;
    }
    if (data.isExample) return;
    const m = metaRef.current;
    if (!userRef.current && !m.userId) return;
    if (!m.dirty) setMeta({ ...m, dirty: true });
    if (userRef.current && phaseRef.current === 'ready') {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), 1000);
    }
  }, [data, setMeta]);

  // Pick up changes from other devices when this one comes back into view or online.
  useEffect(() => {
    const check = () => {
      const u = userRef.current;
      if (u && phaseRef.current === 'ready' && document.visibilityState === 'visible') void reconcile(u.id);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
    };
  }, [reconcile]);

  const value = useMemo<Sync>(
    () => ({
      phase,
      status,
      user,
      meta,
      signIn: async (email, password) => {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        return error ? friendly(error.message) : null;
      },
      signUp: async (email, password) => {
        const { data: d, error } = await supabase!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        return { error: error ? friendly(error.message) : null, needsConfirmation: !error && !d.session };
      },
      signInWithGoogle: async () => {
        const { error } = await supabase!.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + window.location.pathname },
        });
        return error ? friendly(error.message) : null;
      },
      signOut: async () => {
        clearTimeout(timer.current);
        await supabase!.auth.signOut();
      },
      syncNow: () => {
        if (user) void reconcile(user.id);
      },
    }),
    [phase, status, user, meta, reconcile],
  );

  const resolve = async (choice: 'account' | 'device') => {
    if (!user || !conflict) return;
    try {
      if (choice === 'account') applyRemote(conflict, user.id);
      else await push(user.id, conflict.revision + 1);
      setConflict(null);
      setStatus('synced');
      setPhase('ready');
      notify({ text: choice === 'account' ? 'This device now shows the data from your account.' : "Your account now holds this device's data." });
    } catch (e) {
      fail(e);
    }
  };

  const remoteParsed = conflict ? parseBackup(JSON.stringify(conflict.data)) : null;
  const summary = (d: AppData) => `${d.holdings.length} ${d.holdings.length === 1 ? 'holding' : 'holdings'}, net worth ${fmt.money(totals(d.holdings).netWorth)}`;

  return (
    <Ctx.Provider value={value}>
      {children}
      {conflict && user && (
        <Dialog title="This device and your account hold different data" onClose={() => void value.signOut()}>
          <div className="dialog-text">
            <p>Choose which one to keep. The other is replaced and cannot be recovered, so export a backup first if you are unsure.</p>
            <p>
              <strong>This device:</strong> {summary(data)}.
            </p>
            <p>
              <strong>Your account:</strong>{' '}
              {remoteParsed?.ok ? `${summary(remoteParsed.data)}, last saved ${fmtDateTime(conflict.updated_at)}.` : 'data that this version of the app cannot read.'}
            </p>
          </div>
          <div className="form-actions stacked">
            {remoteParsed?.ok && (
              <button type="button" className="btn btn-primary" onClick={() => void resolve('account')}>Keep account data</button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => void resolve('device')}>Keep this device's data</button>
            <button type="button" className="btn btn-secondary" onClick={() => void value.signOut()}>Decide later and sign out</button>
          </div>
        </Dialog>
      )}
    </Ctx.Provider>
  );
}

export function useSync(): Sync {
  const sync = useContext(Ctx);
  if (!sync) throw new Error('useSync must be used inside SyncProvider');
  return sync;
}
