import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// =============================================================================
// LOGIN DEDICADO PARA O APP DE TESOURARIA (projeto/front-end separado do AppChurch,
// mesmo banco de dados). Reaproveita a mesma identidade (login/senha) e o mesmo
// esquema de e-mail sintético + Supabase Auth do /api/login, mas:
//   1. Exige que o membro tenha uma linha em `tesouraria_permissao` para a igreja
//      dele — senão, mesmo com a senha certa, o acesso a ESTE app é negado.
//   2. Devolve access_token/refresh_token no corpo da resposta (em vez de só
//      cookie), porque o front-end da tesouraria roda em outro domínio e precisa
//      chamar supabase.auth.setSession() ele mesmo para herdar uma sessão real.
//
// Depois do login, o app de tesouraria deve usar o cliente Supabase (URL + anon key)
// com essa sessão para ler/validar relatorios_semanais — a RLS já existente cuida do
// resto (ver policies "Leitura/Insercao relatorios da igreja" e a nova "Validacao de
// relatorios por tesouraria").
// =============================================================================

interface RateLimitEntry {
  timestamps: number[];
}

const loginAttempts = new Map<string, RateLimitEntry>();
const ipAttempts = new Map<string, RateLimitEntry>();

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_LOGIN = 5;
const MAX_ATTEMPTS_PER_IP = 25;

function checkRateLimit(key: string, map: Map<string, RateLimitEntry>, maxLimit: number): boolean {
  const now = Date.now();
  const entry = map.get(key) || { timestamps: [] };
  const validTimestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);
  map.set(key, { timestamps: validTimestamps });
  return validTimestamps.length < maxLimit;
}

function recordAttempt(key: string, map: Map<string, RateLimitEntry>) {
  const now = Date.now();
  const entry = map.get(key) || { timestamps: [] };
  entry.timestamps.push(now);
  map.set(key, entry);
}

function clearAttempts(key: string, map: Map<string, RateLimitEntry>) {
  map.delete(key);
}

function verifyLegacyPassword(plainInput: string, storedHashOrPlain?: string | null): boolean {
  if (!storedHashOrPlain || !plainInput) return false;
  const trimmedStored = String(storedHashOrPlain).trim();
  const trimmedInput = plainInput.trim();

  if (
    trimmedStored.startsWith('$2a$') ||
    trimmedStored.startsWith('$2b$') ||
    trimmedStored.startsWith('$2y$')
  ) {
    try {
      return bcrypt.compareSync(trimmedInput, trimmedStored);
    } catch {
      return false;
    }
  }

  try {
    const inputBuf = Buffer.from(trimmedInput, 'utf8');
    const storedBuf = Buffer.from(trimmedStored, 'utf8');
    if (inputBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(inputBuf, storedBuf);
  } catch {
    return false;
  }
}

function getSyntheticEmail(login: string): string {
  const clean = login.trim().toLowerCase();
  const safeUser = clean.replace(/[^a-z0-9._-]/g, '_');
  return `${safeUser}@membros.appchurch.local`;
}

// Restrinja isso ao domínio real do app de tesouraria assim que ele estiver no ar
// (ex.: 'https://tesouraria.appchurch.com.br'). Múltiplas origens podem ser separadas
// por vírgula na env var TESOURARIA_ALLOWED_ORIGIN.
function getAllowedOrigin(req: NextRequest): string {
  const configured = process.env.TESOURARIA_ALLOWED_ORIGIN?.trim();
  if (!configured) return '*';
  const origin = req.headers.get('origin') || '';
  const allowed = configured.split(',').map((o) => o.trim());
  return allowed.includes(origin) ? origin : allowed[0];
}

function withCors(req: NextRequest, response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', getAllowedOrigin(req));
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

export async function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    if (!checkRateLimit(ip, ipAttempts, MAX_ATTEMPTS_PER_IP)) {
      return withCors(
        req,
        NextResponse.json(
          { error: 'Muitas tentativas de conexão a partir deste IP. Aguarde 5 minutos.' },
          { status: 429 }
        )
      );
    }

    const body = await req.json().catch(() => ({}));
    const cleanLogin = (body.login || '').trim().toLowerCase();
    const cleanPass = (body.password || '').trim();

    if (!cleanLogin || !cleanPass) {
      return withCors(
        req,
        NextResponse.json({ error: 'Informe login e senha.' }, { status: 400 })
      );
    }

    if (!checkRateLimit(cleanLogin, loginAttempts, MAX_ATTEMPTS_PER_LOGIN)) {
      return withCors(
        req,
        NextResponse.json(
          { error: 'Muitas tentativas incorretas para este usuário. Bloqueio temporário de 5 minutos.' },
          { status: 429 }
        )
      );
    }

    recordAttempt(ip, ipAttempts);

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return withCors(
        req,
        NextResponse.json({ error: 'Configuração do Supabase indisponível no servidor.' }, { status: 500 })
      );
    }

    // 1. Resolve o membro pelo login/e-mail
    const { data: memberRows, error: mErr } = await supabaseAdmin
      .from('membros')
      .select('*')
      .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
      .limit(1);

    if (mErr) {
      console.error('[tesouraria/login] Erro ao consultar membros:', mErr);
      return withCors(req, NextResponse.json({ error: 'Erro ao validar cadastro do membro.' }, { status: 500 }));
    }

    if (!memberRows || memberRows.length === 0) {
      recordAttempt(cleanLogin, loginAttempts);
      return withCors(req, NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 }));
    }

    const member = memberRows[0];

    if (member.acesso_ativo === false) {
      recordAttempt(cleanLogin, loginAttempts);
      return withCors(req, NextResponse.json({ error: 'Seu acesso foi desativado. Procure a liderança da sua igreja.' }, { status: 403 }));
    }

    // 2. Checa a permissão específica do módulo de Tesouraria ANTES de emitir sessão.
    // Ter login/senha válidos no AppChurch não dá acesso a este app por si só.
    const { data: permRows, error: permErr } = await supabaseAdmin
      .from('tesouraria_permissao')
      .select('id')
      .eq('igreja_id', member.igreja_id)
      .eq('membro_id', member.id)
      .limit(1);

    if (permErr) {
      console.error('[tesouraria/login] Erro ao consultar tesouraria_permissao:', permErr);
      return withCors(req, NextResponse.json({ error: 'Erro ao validar permissão de acesso.' }, { status: 500 }));
    }

    if (!permRows || permRows.length === 0) {
      recordAttempt(cleanLogin, loginAttempts);
      return withCors(
        req,
        NextResponse.json(
          { error: 'Seu usuário não tem permissão de acesso ao módulo de Tesouraria. Procure a liderança da sua igreja.' },
          { status: 403 }
        )
      );
    }

    const canonicalLogin = (member.login || cleanLogin).trim().toLowerCase();
    const syntheticEmail = getSyntheticEmail(canonicalLogin);

    const ssrClient = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Sem cookies: a sessão é devolvida no corpo da resposta para o front-end
          // (outro domínio) assumir via supabase.auth.setSession().
        },
      },
    });

    // 3. Tenta login direto no Supabase Auth; se falhar, valida senha legada e migra
    let authResult = await ssrClient.auth.signInWithPassword({
      email: syntheticEmail,
      password: cleanPass,
    });

    let authUserId: string | undefined = member.auth_user_id;

    if (authResult.error) {
      const storedPass = member.senha_hash || member.senha || null;
      const isLegacyValid = verifyLegacyPassword(cleanPass, storedPass);

      if (!isLegacyValid) {
        recordAttempt(cleanLogin, loginAttempts);
        return withCors(req, NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 }));
      }

      if (!authUserId) {
        const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: syntheticEmail,
          password: cleanPass,
          email_confirm: true,
          app_metadata: { igreja_id: member.igreja_id, membro_id: member.id },
          user_metadata: { nome: member.nome, login: canonicalLogin },
        });

        if (createErr) {
          if (createErr.message?.includes('already registered') || createErr.status === 422) {
            const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
            const matched = existingUsers?.users?.find(
              (u) =>
                u.email?.toLowerCase() === syntheticEmail.toLowerCase() ||
                u.user_metadata?.login?.toLowerCase() === canonicalLogin
            );
            if (matched) {
              authUserId = matched.id;
              await supabaseAdmin.auth.admin.updateUserById(matched.id, {
                password: cleanPass,
                email_confirm: true,
                app_metadata: { igreja_id: member.igreja_id, membro_id: member.id },
                user_metadata: { nome: member.nome, login: canonicalLogin },
              });
            }
          } else {
            console.error('[tesouraria/login] Erro ao criar usuário no Supabase Auth:', createErr);
            return withCors(req, NextResponse.json({ error: `Falha ao migrar para Supabase Auth: ${createErr.message}` }, { status: 500 }));
          }
        } else if (createData?.user) {
          authUserId = createData.user.id;
        }
      } else {
        try {
          await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password: cleanPass,
            email_confirm: true,
            app_metadata: { igreja_id: member.igreja_id, membro_id: member.id },
            user_metadata: { nome: member.nome, login: canonicalLogin },
          });
        } catch (updateAuthErr) {
          console.warn('[tesouraria/login] Aviso ao atualizar senha no Supabase Auth:', updateAuthErr);
        }
      }

      if (authUserId && member.auth_user_id !== authUserId) {
        try {
          await supabaseAdmin.from('membros').update({ auth_user_id: authUserId }).eq('id', member.id);
        } catch (updateErr) {
          console.warn('[tesouraria/login] Aviso ao atualizar membros.auth_user_id:', updateErr);
        }
      }

      authResult = await ssrClient.auth.signInWithPassword({
        email: syntheticEmail,
        password: cleanPass,
      });

      if (authResult.error) {
        console.error('[tesouraria/login] Erro ao autenticar sessão após sincronização:', authResult.error);
        return withCors(req, NextResponse.json({ error: `Falha ao autenticar sessão: ${authResult.error.message}` }, { status: 500 }));
      }
    } else if (authResult.data?.user) {
      const currentAuthId = authResult.data.user.id;
      if (member.auth_user_id !== currentAuthId) {
        try {
          await supabaseAdmin.from('membros').update({ auth_user_id: currentAuthId }).eq('id', member.id);
        } catch (updErr) {
          console.warn('[tesouraria/login] Aviso ao atualizar membros.auth_user_id após login direto:', updErr);
        }
      }
    }

    clearAttempts(cleanLogin, loginAttempts);

    const session = authResult.data?.session;
    if (!session) {
      return withCors(req, NextResponse.json({ error: 'Não foi possível emitir a sessão de autenticação.' }, { status: 500 }));
    }

    return withCors(
      req,
      NextResponse.json({
        success: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: {
          id: member.id,
          churchId: member.igreja_id,
          name: member.nome,
          login: canonicalLogin,
          role: member.funcao || 'Membro',
        },
      })
    );
  } catch (error: any) {
    console.error('[tesouraria/login] Erro inesperado:', error);
    return withCors(req, NextResponse.json({ error: error?.message || 'Erro interno ao realizar login.' }, { status: 500 }));
  }
}
