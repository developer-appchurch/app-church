import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testCount() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('comentarios_postagem')
    .select('post_id');

  console.log('comentarios_postagem post_ids:', data, error);
}

testCount().catch(console.error);
