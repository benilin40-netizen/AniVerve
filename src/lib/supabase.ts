import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanClientEnv(raw?: string): string {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

const supabaseUrl = cleanClientEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseKey =
  cleanClientEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  cleanClientEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let client: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('Supabase client initialization skipped:', err);
  }
}

export const supabase: SupabaseClient | null = client;
