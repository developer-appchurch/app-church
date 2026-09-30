import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

let cachedServerClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (cachedServerClient) return cachedServerClient;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    DEFAULT_SUPABASE_ANON_KEY;

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const url =
    envUrl.startsWith('http://') || envUrl.startsWith('https://')
      ? envUrl
      : DEFAULT_SUPABASE_URL;

  const missing: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL');
  }

  if (missing.length > 0) {
    console.warn(`[Supabase Server] Variáveis de ambiente não detectadas no servidor (usando chave padrão se disponível): ${missing.join(', ')}`);
  }

  if (!serviceKey || !url) return null;

  cachedServerClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedServerClient;
}
