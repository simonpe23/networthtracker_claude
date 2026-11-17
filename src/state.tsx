import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import { parseBackup } from './lib/backup';
import { makeFmt, type Fmt } from './lib/format';
import { buildExample } from './lib/sample';
import { reduce, STORAGE_KEY, type Action } from './lib/store';

export interface Notice {
  text: string;
  link?: { href: string; label: string };
}

interface Store {
  data: AppData;
  dispatch: (action: Action) => void;
  fmt: Fmt;
  notice: Notice | null;
  notify: (notice: Notice | null) => void;
}

const Ctx = createContext<Store | null>(null);

function load(): { data: AppData; problem: string | null } {
  const now = new Date();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { data: buildExample(now), problem: 'This browser is blocking local storage, so changes will not be saved between visits.' };
  }
  if (stored === null) return { data: buildExample(now), problem: null };
  const parsed = parseBackup(stored);
  if (parsed.ok) return { data: reduce(parsed.data, { type: 'tick' }, now), problem: null };
  // Never overwrite data we could not read. Keep a copy before starting over.
  try {
    localStorage.setItem(`${STORAGE_KEY}.unreadable`, stored);
  } catch {
    /* nothing more we can do */
  }
  return {
    data: buildExample(now),
    problem: `Saved data could not be read (${parsed.error}) A copy was kept in this browser under "${STORAGE_KEY}.unreadable".`,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load);
  const [data, dispatch] = useReducer((d: AppData, a: Action) => reduce(d, a, new Date()), initial.data);
  const [notice, setNotice] = useState<Notice | null>(initial.problem ? { text: initial.problem } : null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      setNotice({ text: 'Could not save to this browser. Export a backup from Settings to keep your changes.' });
    }
  }, [data]);

  // Record a new day if the app stays open past midnight.
  useEffect(() => {
    const timer = setInterval(() => dispatch({ type: 'tick' }), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = useMemo(() => makeFmt(data.currency, data.showCents), [data.currency, data.showCents]);
  const notify = useCallback((n: Notice | null) => setNotice(n), []);
  const store = useMemo(() => ({ data, dispatch, fmt, notice, notify }), [data, fmt, notice, notify]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
