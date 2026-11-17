import type { AppData } from '../types';

/** What this device remembers about its last contact with the account. */
export interface SyncMeta {
  userId: string | null;
  /** Revision of the account copy this device last saw. */
  revision: number | null;
  syncedAt: string | null;
  /** True when this device has changes the account has not received. */
  dirty: boolean;
}

export const EMPTY_META: SyncMeta = { userId: null, revision: null, syncedAt: null, dirty: false };

export type Decision = 'push' | 'pull' | 'conflict' | 'none';

/** Real data entered by the user, as opposed to the example or an empty start. */
export const hasOwnData = (d: AppData) => !d.isExample && (d.holdings.length > 0 || d.snapshots.length > 0 || d.daily.length > 0);

/**
 * Decides what to do when this device meets the account copy.
 * Nothing is ever overwritten silently when both sides hold different real data.
 */
export function decide(local: AppData, meta: SyncMeta, remote: { revision: number } | null, userId: string): Decision {
  const own = hasOwnData(local);
  if (!remote) return own ? 'push' : 'none';
  if (meta.userId !== userId) return own ? 'conflict' : 'pull';
  if (remote.revision === meta.revision) return meta.dirty && !local.isExample ? 'push' : 'none';
  return meta.dirty && own ? 'conflict' : 'pull';
}
