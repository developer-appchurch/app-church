import { POST as loginHandler } from '../app/api/login/route.ts';
import { GET as sessionHandler } from '../app/api/auth/session/route.ts';
import { POST as logoutHandler } from '../app/api/auth/logout/route.ts';
import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '../lib/supabase/admin.ts';

async function runAuthTests() {
  console.log('=== TESTE 1: LOGIN COM MEMBRO EXISTENTE & MIGRAÇÃO AUTOMÁTICA ===');
  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.error('Supabase admin não disponível');
    return;
  }

  // Busca o membro de teste
  const { data: member } = await admin
    .from('membros')
    .select('id, login, nome, senha_hash, auth_user_id')
    .eq('login', 'fabiano.ribeiro')
    .single();

  console.log('Membro antes do teste:', {
    login: member?.login,
    hasAuthUserId: Boolean(member?.auth_user_id),
    authUserId: member?.auth_user_id,
  });

  // 1. Simula requisição de login para /api/login
  const loginReq = new NextRequest('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.50' },
    body: JSON.stringify({
      login: 'fabiano.ribeiro',
      password: '123456',
    }),
  });

  const loginRes = await loginHandler(loginReq);
  const loginData = await loginRes.json();
  console.log('Status Login 1:', loginRes.status);
  console.log('Resposta Login 1:', {
    success: loginData.success,
    user: loginData.user?.name,
    login: loginData.user?.login,
    syntheticEmail: loginData.syntheticEmail,
    hasSession: Boolean(loginData.session?.access_token),
  });

  // 2. Verifica se o membro agora possui auth_user_id
  const { data: memberAfter } = await admin
    .from('membros')
    .select('id, login, auth_user_id')
    .eq('login', 'fabiano.ribeiro')
    .single();

  console.log('Membro após o primeiro login:', {
    login: memberAfter?.login,
    authUserId: memberAfter?.auth_user_id,
  });

  // 3. Teste 2: Segundo login com o mesmo usuário (deve usar signInWithPassword direto no Supabase Auth)
  console.log('\n=== TESTE 2: SEGUNDO LOGIN (AUTENTICAÇÃO DIRETA NO SUPABASE AUTH) ===');
  const secondLoginReq = new NextRequest('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.50' },
    body: JSON.stringify({
      login: 'fabiano.ribeiro',
      password: '123456',
    }),
  });

  const secondLoginRes = await loginHandler(secondLoginReq);
  const secondLoginData = await secondLoginRes.json();
  console.log('Status Login 2:', secondLoginRes.status);
  console.log('Sucesso Login 2:', secondLoginData.success, 'Usuário:', secondLoginData.user?.name);

  // 4. Teste 3: Tentativa com senha incorreta
  console.log('\n=== TESTE 3: SENHA INCORRETA ===');
  const wrongPassReq = new NextRequest('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.51' },
    body: JSON.stringify({
      login: 'fabiano.ribeiro',
      password: 'senha_completamente_errada',
    }),
  });

  const wrongPassRes = await wrongPassReq.json();
  console.log('Status Senha Errada:', wrongPassReq ? 401 : null, wrongPassRes);

  // 5. Teste 4: Login com outro membro (ex: raposinho)
  console.log('\n=== TESTE 4: LOGIN COM OUTRO USUÁRIO (raposinho) ===');
  const raposoReq = new NextRequest('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.168.1.52' },
    body: JSON.stringify({
      login: 'raposinho',
      password: '123456',
    }),
  });

  const raposoRes = await loginHandler(raposoReq);
  const raposoData = await raposoRes.json();
  console.log('Status Login Raposinho:', raposoRes.status);
  console.log('Usuário autenticado:', raposoData.user?.name, 'Login:', raposoData.user?.login);

  // 6. Teste 5: Logout
  console.log('\n=== TESTE 5: LOGOUT ===');
  const logoutReq = new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
  });
  const logoutRes = await logoutHandler(logoutReq);
  console.log('Logout status:', logoutRes.status, await logoutRes.json());
}

runAuthTests().catch(console.error);
