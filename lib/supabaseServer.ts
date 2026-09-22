import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseServerClient(): SupabaseClient | null {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    '';

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const url =
    envUrl.startsWith('http://') || envUrl.startsWith('https://')
      ? envUrl
      : 'https://srjkwwddbxniqhzqvrhc.supabase.co';

  if (!serviceKey || !url) return null;

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
