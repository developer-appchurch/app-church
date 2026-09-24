import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testUpdate() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from('postagens_feed')
    .update({ imagem_largura: 800 })
    .eq('id', 'non-existent-id');

  console.log('Update result for imagem_largura:', { data, error });
}

testUpdate().catch(console.error);
