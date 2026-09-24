export const DEFAULT_SUPABASE_URL = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

export function getSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl;
  }
  return DEFAULT_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string {
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  if (envKey && envKey.includes('.')) {
    return envKey;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}
