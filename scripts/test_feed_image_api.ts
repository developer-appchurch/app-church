import { POST } from '../app/api/feed/image/route.ts';
import { NextRequest } from 'next/server';
import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

async function runTests() {
  console.log('--- 1. BUSCANDO MEMBRO PARA TESTE ---');
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.error('Supabase client não disponível');
    return;
  }

  const { data: members, error: mErr } = await supabase
    .from('membros')
    .select('id, nome, login, igreja_id, funcao')
    .limit(1);

  if (!members || members.length === 0) {
    console.error('Nenhum membro encontrado:', mErr);
    return;
  }

  const testMember = members[0];
  console.log('Membro de teste encontrado:', testMember);

  console.log('\n--- 2. TESTANDO AÇÃO "upload" (createSignedUploadUrl) ---');
  const uploadReq = new NextRequest('http://localhost:3000/api/feed/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      memberId: testMember.id,
      extension: 'webp',
    }),
  });

  const uploadRes = await POST(uploadReq);
  const uploadData = await uploadRes.json();
  console.log('Status HTTP:', uploadRes.status);
  console.log('Resposta Upload:', uploadData);

  if (!uploadData.signedUrl || !uploadData.token || !uploadData.path) {
    console.error('FALHA no upload assinado!');
    return;
  }

  console.log('\n--- 3. TESTANDO uploadToSignedUrl COM DADOS RETORNADOS ---');
  const dummyBuffer = Buffer.from('WEBP DUMMY DATA FOR TEST');
  const { data: directUploadData, error: directUploadErr } = await supabase.storage
    .from('feed')
    .uploadToSignedUrl(uploadData.path, uploadData.token, dummyBuffer, {
      contentType: 'image/webp',
      cacheControl: '31536000',
    });

  console.log('uploadToSignedUrl Result:', { directUploadData, directUploadErr });

  console.log('\n--- 4. TESTANDO AÇÃO "excluir" DO ARQUIVO CRIADO ---');
  const deleteReq = new NextRequest('http://localhost:3000/api/feed/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'excluir',
      memberId: testMember.id,
      imagePath: uploadData.path,
    }),
  });

  const deleteRes = await POST(deleteReq);
  const deleteData = await deleteRes.json();
  console.log('Status HTTP Delete:', deleteRes.status);
  console.log('Resposta Delete:', deleteData);

  console.log('\n--- 5. TESTANDO BLOQUEIO DE MEMBRO NÃO AUTENTICADO ---');
  const unauthorizedReq = new NextRequest('http://localhost:3000/api/feed/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      memberId: '00000000-0000-0000-0000-000000000000',
    }),
  });

  const unauthorizedRes = await POST(unauthorizedReq);
  console.log('Status Bloqueio:', unauthorizedRes.status, await unauthorizedRes.json());
}

runTests().catch(console.error);
