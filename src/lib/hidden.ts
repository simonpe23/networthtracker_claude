import { useSyncExternalStore } from 'react';
import { STORAGE_KEY } from './store';

/**
 * Per-device preference: categories outside the allocation that are left out of
 * net worth. Shared by every page, so the dashboard and history always agree.
 */
const KEY = `${STORAGE_KEY}.hiddenCategories`;
const listeners = new Set<() => void>();

function read(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

let current = read();

function toggle(id: string, hide: boolean) {
  const next = new Set(current);
  if (hide) next.add(id);
  else next.delete(id);
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* the choice simply resets next visit */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useHiddenCategories(): [Set<string>, (id: string, hide: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => current), toggle];
}
