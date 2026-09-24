import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testSql() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  // Let's test if rpc('exec_sql' or similar) exists or how migrations were previously done
  const { data, error } = await supabase.rpc('exec_sql', { query: 'SELECT 1;' });
  console.log('rpc exec_sql:', data, error?.message);
}

testSql().catch(console.error);
