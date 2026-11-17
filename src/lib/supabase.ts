import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** null when sync is not configured. The app then works on this device only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const TABLE = 'net_worth_portfolios';

/** Which extra sign-in methods the sync service has switched on, e.g. Google. */
export async function enabledProviders(): Promise<{ google: boolean }> {
  if (!url || !key) return { google: false };
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return { google: settings.external?.google === true };
  } catch {
    return { google: false };
  }
}
