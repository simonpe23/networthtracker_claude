export type Kind = 'asset' | 'debt';

export interface Category {
  id: string;
  name: string;
  /** Target share of allocated assets, in percent. null means no target. */
  target: number | null;
  /**
   * false for things that belong in net worth but not in the investment mix,
   * such as a retirement account, a car or a rental deposit.
   */
  inAllocation: boolean;
}

export interface Holding {
  id: string;
  kind: Kind;
  name: string;
  institution: string;
  notes: string;
  /** Assets only. null means uncategorised. */
  categoryId: string | null;
  /** Always 0 or more. For debts this is the amount owed. */
  value: number;
  createdAt: string;
  updatedAt: string;
}

/** Kept so that recorded history of a deleted holding stays readable. */
export interface RemovedHolding {
  id: string;
  kind: Kind;
  name: string;
  category: string | null;
  deletedAt: string;
}

/** One automatic record per calendar day, overwritten until the day ends. */
export interface DailyEntry {
  date: string; // YYYY-MM-DD, local time
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  values: Record<string, number>;
}

export interface SnapshotHolding {
  holdingId: string;
  name: string;
  institution: string;
  kind: Kind;
  category: string | null;
  value: number;
  /** Share of total assets at capture time. null for debts. */
  pct: number | null;
}

/** An explicitly saved, immutable copy of the portfolio. */
export interface Snapshot {
  id: string;
  takenAt: string; // ISO date and time
  netWorth: number;
  /** null only in older total-only snapshots that never recorded it. */
  totalAssets: number | null;
  totalDebts: number | null;
  /** null in older total-only snapshots. Never reconstructed. */
  holdings: SnapshotHolding[] | null;
}

export interface AppData {
  app: 'sp-net-worth-tracker';
  version: 2;
  currency: string;
  showCents: boolean;
  isExample: boolean;
  categories: Category[];
  holdings: Holding[];
  removedHoldings: RemovedHolding[];
  daily: DailyEntry[];
  snapshots: Snapshot[];
}
