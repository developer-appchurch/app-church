import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

export function createBrowserSupabaseClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}

// Singleton para o navegador
let browserClientInstance: ReturnType<typeof createBrowserSupabaseClient> | null = null;

export function getBrowserSupabaseClient() {
  if (typeof window === 'undefined') {
    return createBrowserSupabaseClient();
  }
  if (!browserClientInstance) {
    browserClientInstance = createBrowserSupabaseClient();
  }
  return browserClientInstance;
}
