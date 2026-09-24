import { POST } from '../app/api/feed/image/route.ts';
import { NextRequest } from 'next/server';
import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function testPostDeletionAuth() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  console.log('\n--- 6. TESTANDO AUTORIZAÇÃO DE EXCLUSÃO DE POST ---');
  // Cria um post temporário
  const { data: insertPost, error: pErr } = await supabase
    .from('postagens_feed')
    .insert({
      igreja_id: '6ddefcae-2fec-41ba-b187-bb290b05beee',
      nome_autor: 'Membro Autor Teste',
      funcao_autor: 'Membro',
      nome_celula: 'Célula Boas Novas',
      legenda: 'Post teste de segurança',
      url_imagem: 'https://srjkwwddbxniqhzqvrhc.supabase.co/storage/v1/object/public/feed/6ddefcae-2fec-41ba-b187-bb290b05beee/post-teste.webp',
    })
    .select('id')
    .single();

  if (!insertPost) {
    console.error('Erro ao criar post teste:', pErr);
    return;
  }

  const postId = insertPost.id;
  console.log('Post de teste criado:', postId);

  // Busca um membro que NÃO é autor e NÃO é pastor
  const { data: regularMembers } = await supabase
    .from('membros')
    .select('id, nome, funcao, igreja_id')
    .neq('funcao', 'Pastor')
    .neq('funcao', 'Administrador')
    .neq('nome', 'Membro Autor Teste')
    .eq('igreja_id', '6ddefcae-2fec-41ba-b187-bb290b05beee')
    .limit(1);

  if (regularMembers && regularMembers.length > 0) {
    const regularMember = regularMembers[0];
    console.log('Testando tentativa de exclusão por membro não-autor:', regularMember.nome);

    const failReq = new NextRequest('http://localhost:3000/api/feed/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        memberId: regularMember.id,
        postId: postId,
      }),
    });

    const failRes = await POST(failReq);
    console.log('Status de bloqueio não-autor:', failRes.status, await failRes.json());
  }

  // Agora testa com Pastor Fabiano Ribeiro (deve ser autorizado)
  const { data: pastorMembers } = await supabase
    .from('membros')
    .select('id, nome, funcao, igreja_id')
    .eq('funcao', 'Pastor')
    .limit(1);

  if (pastorMembers && pastorMembers.length > 0) {
    const pastor = pastorMembers[0];
    console.log('Testando exclusão por Pastor/Admin:', pastor.nome);

    const passReq = new NextRequest('http://localhost:3000/api/feed/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        memberId: pastor.id,
        postId: postId,
      }),
    });

    const passRes = await POST(passReq);
    console.log('Status exclusão Pastor:', passRes.status, await passRes.json());
  }

  // Limpa o post de teste
  await supabase.from('postagens_feed').delete().eq('id', postId);
  console.log('Post de teste limpo com sucesso.');
}

testPostDeletionAuth().catch(console.error);
