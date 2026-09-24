import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testCursorQuery() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data: posts, error } = await supabase
    .from('postagens_feed')
    .select('id, igreja_id, unidade_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, criado_em')
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(11);

  console.log('Cursor query test result:', { count: posts?.length, error });
}

testCursorQuery().catch(console.error);
