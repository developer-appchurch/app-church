import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './config';

export function getSupabaseAdminClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = getSupabaseUrl();

  if (!serviceKey || !url) {
    console.error('SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
