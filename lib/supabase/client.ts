import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from './config';

// Singleton instance para o ambiente do navegador
let browserClientInstance: SupabaseClient | null = null;

/**
 * Retorna a instância única (singleton) do Supabase Client para o navegador
 * usando createBrowserClient do pacote @supabase/ssr.
 * Evita o aviso 'Multiple GoTrueClient instances detected'.
 */
export function getBrowserSupabaseClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  if (!browserClientInstance) {
    browserClientInstance = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return browserClientInstance;
}

// Exporta o singleton diretamente para facilitar o uso
export const supabase = getBrowserSupabaseClient();

