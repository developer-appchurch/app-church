import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function checkColumns() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data: posts, error } = await supabase
    .from('postagens_feed')
    .select('*')
    .limit(1);

  console.log('Sample post from postagens_feed:', posts, error);
}

checkColumns().catch(console.error);
