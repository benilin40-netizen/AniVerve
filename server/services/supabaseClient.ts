import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanEnv } from '../utils/env.ts';

const supabaseUrl = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
const supabaseKey =
  cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY) ||
  cleanEnv(process.env.SUPABASE_ANON_KEY) ||
  cleanEnv(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  cleanEnv(process.env.VITE_SUPABASE_ANON_KEY);

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedClient;
}

export function getSupabaseConfigStatus() {
  return {
    configured: Boolean(supabaseUrl && supabaseKey),
    url: supabaseUrl || null,
  };
}
