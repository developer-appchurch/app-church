import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './config';

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (cachedAdminClient) return cachedAdminClient;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = getSupabaseUrl();

  const missing: string[] = [];
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push('NEXT_PUBLIC_SUPABASE_URL (usando fallback padrão se não definida)');

  if (!serviceKey || !url) {
    console.error(
      `[Supabase Admin] Não foi possível inicializar o cliente admin no servidor. Variáveis ausentes: ${missing.join(', ')}`
    );
    return null;
  }

  cachedAdminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdminClient;
}
