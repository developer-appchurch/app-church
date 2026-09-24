import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testSelectColumns() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const colsWithNew = 'id, igreja_id, unidade_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, quantidade_comentarios, criado_em, imagem_largura, imagem_altura';
  const { data: d1, error: e1 } = await supabase.from('postagens_feed').select(colsWithNew).limit(1);
  console.log('Select with new columns:', { success: Boolean(d1), error: e1?.message });

  const standardCols = 'id, igreja_id, unidade_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, criado_em';
  const { data: d2, error: e2 } = await supabase.from('postagens_feed').select(standardCols).limit(1);
  console.log('Select with standard cols:', { success: Boolean(d2), count: d2?.length, error: e2?.message });
}

testSelectColumns().catch(console.error);
