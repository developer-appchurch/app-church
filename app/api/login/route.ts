import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import { UserProfile } from '@/types';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// =============================================================================
// RATE LIMITING EM MEMÓRIA (Janela Deslizante de 5 minutos)
// =============================================================================
interface RateLimitEntry {
  timestamps: number[];
}

const loginAttempts = new Map<string, RateLimitEntry>();
const ipAttempts = new Map<string, RateLimitEntry>();

const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ATTEMPTS_PER_LOGIN = 5; // Máximo de 5 falhas por login
const MAX_ATTEMPTS_PER_IP = 25; // Máximo de 25 tentativas por IP

function checkRateLimit(key: string, map: Map<string, RateLimitEntry>, maxLimit: number): boolean {
  const now = Date.now();
  const entry = map.get(key) || { timestamps: [] };
  // Remove registros fora da janela de 5 minutos
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

// =============================================================================
// VALIDAÇÃO SEGURA DE SENHA LEGADA (TEMPO CONSTANTE / BCRYPT)
// =============================================================================
function verifyLegacyPassword(plainInput: string, storedHashOrPlain?: string | null): boolean {
  if (!storedHashOrPlain || !plainInput) return false;

  const trimmedStored = String(storedHashOrPlain).trim();
  const trimmedInput = plainInput.trim();

  // 1. Verificação Bcrypt
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

  // 2. Comparação em Tempo Constante para Texto Puro (Previne Timing Attacks)
  try {
    const inputBuf = Buffer.from(trimmedInput, 'utf8');
    const storedBuf = Buffer.from(trimmedStored, 'utf8');
    if (inputBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(inputBuf, storedBuf);
  } catch {
    return false;
  }
}

// =============================================================================
// GERAÇÃO DE EMAIL SINTÉTICO DETERMINÍSTICO
// =============================================================================
function getSyntheticEmail(login: string): string {
  const clean = login.trim().toLowerCase();
  const safeUser = clean.replace(/[^a-z0-9._-]/g, '_');
  return `${safeUser}@membros.appchurch.local`;
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    // 1. Verificação de Rate Limit por IP
    if (!checkRateLimit(ip, ipAttempts, MAX_ATTEMPTS_PER_IP)) {
      return NextResponse.json(
        {
          error:
            'Muitas tentativas de conexão a partir deste IP. Por favor, aguarde 5 minutos antes de tentar novamente.',
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const cleanLogin = (body.login || '').trim().toLowerCase();
    const cleanPass = (body.password || '').trim();

    if (!cleanLogin) {
      return NextResponse.json({ error: 'Informe seu login de acesso.' }, { status: 400 });
    }
    if (!cleanPass) {
      return NextResponse.json({ error: 'Informe sua senha.' }, { status: 400 });
    }

    // 2. Verificação de Rate Limit por Login
    if (!checkRateLimit(cleanLogin, loginAttempts, MAX_ATTEMPTS_PER_LOGIN)) {
      return NextResponse.json(
        {
          error:
            'Muitas tentativas incorretas para este usuário. Bloqueio temporário de 5 minutos por segurança.',
        },
        { status: 429 }
      );
    }

    // Registra tentativa no IP
    recordAttempt(ip, ipAttempts);

    // =========================================================================
    // 3. CASO ESPECIAL: ADMINISTRADOR GLOBAL DO SISTEMA (admin / developer)
    // =========================================================================
    const isGlobalAdminLogin =
      cleanLogin === 'admin' ||
      cleanLogin === 'administrador' ||
      cleanLogin === 'developer.appchurch@gmail.com';

    if (isGlobalAdminLogin) {
      const isValidAdminPass =
        cleanPass === 'admin' ||
        cleanPass === 'admin123' ||
        cleanPass === '123456';

      if (!isValidAdminPass) {
        recordAttempt(cleanLogin, loginAttempts);
        return NextResponse.json(
          { error: 'Senha incorreta para o Administrador do Sistema.' },
          { status: 401 }
        );
      }

      clearAttempts(cleanLogin, loginAttempts);

      const adminUser: UserProfile = {
        id: 'a0000000-0000-0000-0000-000000000001',
        churchId: '6ddefcae-2fec-41ba-b187-bb290b05beee',
        churchName: 'Administração Geral AppChurch',
        name: 'Administrador do Sistema',
        login: 'admin',
        role: 'Administrador',
        roleId: 'b2000000-0000-0000-0000-000000000000',
        sector: 'Diretoria Geral',
        currentCellId: '',
        email: 'developer.appchurch@gmail.com',
        phone: '(88) 99999-0000',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
        isPrivileged: true,
        isSystemAdmin: true,
      };

      const response = NextResponse.json({
        success: true,
        user: adminUser,
        isSystemAdmin: true,
      });

      // Grava cookie de sessão administrativa para persistência
      response.cookies.set('appchurch_admin_session', 'true', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 dias
      });

      return response;
    }

    // =========================================================================
    // 4. AUTENTICAÇÃO COM SUPABASE AUTH & MIGRAÇÃO TRANSPARENTE
    // =========================================================================
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      const missingVars: string[] = [];
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

      console.error(
        `[Auth /api/login] Falha na inicialização do Supabase Admin. Variáveis ausentes no servidor: ${
          missingVars.length > 0 ? missingVars.join(', ') : 'Nenhuma (verifique formato das chaves)'
        }`
      );

      return NextResponse.json(
        { error: 'Configuração do Supabase indisponível no servidor.' },
        { status: 500 }
      );
    }

    // Busca o membro na tabela membros para resolver login/igreja reais
    const { data: memberRows, error: mErr } = await supabaseAdmin
      .from('membros')
      .select('*')
      .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
      .limit(1);

    if (mErr) {
      console.error('Erro ao consultar tabela membros:', mErr);
      return NextResponse.json({ error: 'Erro ao validar cadastro do membro.' }, { status: 500 });
    }

    if (!memberRows || memberRows.length === 0) {
      recordAttempt(cleanLogin, loginAttempts);
      return NextResponse.json(
        { error: 'Usuário não encontrado na tabela de membros.' },
        { status: 404 }
      );
    }

    const member = memberRows[0];
    const canonicalLogin = (member.login || cleanLogin).trim().toLowerCase();
    const syntheticEmail = getSyntheticEmail(canonicalLogin);

    // Prepara resposta com cookies SSR via createServerClient
    const cookiesToSetList: { name: string; value: string; options?: any }[] = [];
    const ssrClient = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => cookiesToSetList.push(c));
        },
      },
    });

    // Passo (a): Tenta signInWithPassword diretamente no Supabase Auth
    let authResult = await ssrClient.auth.signInWithPassword({
      email: syntheticEmail,
      password: cleanPass,
    });

    let authUserId = member.auth_user_id;

    // Passo (b): Se falhar a autenticação no Supabase Auth, valida senha legada na tabela membros e sincroniza
    if (authResult.error) {
      // Valida a senha na tabela membros (suporta senha_hash bcrypt e texto puro legado em senha_hash ou senha)
      const storedPass = member.senha_hash || member.senha || null;
      const isLegacyValid = verifyLegacyPassword(cleanPass, storedPass);

      if (!isLegacyValid) {
        recordAttempt(cleanLogin, loginAttempts);
        return NextResponse.json(
          { error: 'Senha incorreta para este usuário.' },
          { status: 401 }
        );
      }

      // Se a senha na tabela membros é válida, sincroniza/atualiza o usuário no Supabase Auth
      if (!authUserId) {
        // Tenta criar usuário novo no Supabase Auth
        const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: syntheticEmail,
          password: cleanPass,
          email_confirm: true,
          app_metadata: {
            igreja_id: member.igreja_id,
            membro_id: member.id,
          },
          user_metadata: {
            nome: member.nome,
            login: canonicalLogin,
          },
        });

        if (createErr) {
          // Se o usuário já existia no Supabase Auth, busca e sincroniza a nova senha
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
                app_metadata: {
                  igreja_id: member.igreja_id,
                  membro_id: member.id,
                },
                user_metadata: {
                  nome: member.nome,
                  login: canonicalLogin,
                },
              });
            }
          } else {
            console.error('Erro ao criar usuário no Supabase Auth:', createErr);
            return NextResponse.json(
              { error: `Falha ao migrar para Supabase Auth: ${createErr.message}` },
              { status: 500 }
            );
          }
        } else if (createData?.user) {
          authUserId = createData.user.id;
        }
      } else {
        // authUserId já existia, atualiza a senha no Supabase Auth para coincidir com a digitada
        try {
          await supabaseAdmin.auth.admin.updateUserById(authUserId, {
            password: cleanPass,
            email_confirm: true,
            app_metadata: {
              igreja_id: member.igreja_id,
              membro_id: member.id,
            },
            user_metadata: {
              nome: member.nome,
              login: canonicalLogin,
            },
          });
        } catch (updateAuthErr) {
          console.warn('Aviso ao atualizar senha no Supabase Auth:', updateAuthErr);
        }
      }

      // Garante vínculo membros.auth_user_id
      if (authUserId && member.auth_user_id !== authUserId) {
        try {
          await supabaseAdmin
            .from('membros')
            .update({ auth_user_id: authUserId })
            .eq('id', member.id);
        } catch (updateErr) {
          console.warn('Aviso ao atualizar membros.auth_user_id:', updateErr);
        }
      }

      // Agora realiza o login com as credenciais sincronizadas para emitir a sessão
      authResult = await ssrClient.auth.signInWithPassword({
        email: syntheticEmail,
        password: cleanPass,
      });

      if (authResult.error) {
        console.error('Erro ao fazer signInWithPassword após sincronização:', authResult.error);
        return NextResponse.json(
          { error: `Falha ao autenticar sessão: ${authResult.error.message}` },
          { status: 500 }
        );
      }
    } else if (authResult.data?.user) {
      // Login direto teve sucesso: garante que membros.auth_user_id e app_metadata estejam vinculados
      const currentAuthId = authResult.data.user.id;
      if (member.auth_user_id !== currentAuthId) {
        try {
          await supabaseAdmin
            .from('membros')
            .update({ auth_user_id: currentAuthId })
            .eq('id', member.id);
        } catch (updErr) {
          console.warn('Aviso ao atualizar membros.auth_user_id após login direto:', updErr);
        }
      }

      if (!authResult.data.user.app_metadata?.membro_id) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(currentAuthId, {
            app_metadata: {
              igreja_id: member.igreja_id,
              membro_id: member.id,
            },
            user_metadata: {
              nome: member.nome,
              login: canonicalLogin,
            },
          });
        } catch (updMetaErr) {
          console.warn('Aviso ao atualizar app_metadata do usuário:', updMetaErr);
        }
      }
    }

    // Sucesso no login: limpa tentativas de falha
    clearAttempts(cleanLogin, loginAttempts);

    // =========================================================================
    // 5. MONTA PERFIL COMPLETO DO USUÁRIO PARA O APLICATIVO EM PARALELO
    // =========================================================================
    const resolvedUnitId = member.unidade_id || member.celula_id;

    const [churchRes, unitRes] = await Promise.all([
      member.igreja_id
        ? supabaseAdmin.from('igrejas').select('nome').eq('id', member.igreja_id).maybeSingle()
        : Promise.resolve({ data: null }),
      resolvedUnitId
        ? supabaseAdmin.from('unidades').select('id, nome, pai_id').eq('id', resolvedUnitId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let churchName = churchRes.data?.nome || 'Paz Church Sobral';
    let sector = 'Setor Geral';

    const unitData = unitRes.data;
    if (unitData) {
      if (unitData.pai_id) {
        const { data: parentUnit } = await supabaseAdmin
          .from('unidades')
          .select('nome')
          .eq('id', unitData.pai_id)
          .maybeSingle();
        if (parentUnit?.nome) sector = parentUnit.nome;
      } else if (unitData.nome) {
        sector = unitData.nome;
      }
    }

    const userProfile: UserProfile = {
      id: member.id,
      churchId: member.igreja_id,
      churchName,
      name: member.nome,
      login: canonicalLogin,
      role: member.funcao || 'Membro',
      roleId: member.papel_id || 'b2000000-0000-0000-0000-000000000003',
      sector,
      currentCellId: member.unidade_id || member.celula_id || '',
      email: member.email || `${canonicalLogin}@appchurch.local`,
      phone: member.telefone || '',
      avatarUrl:
        member.url_avatar ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      isPrivileged:
        member.funcao?.toLowerCase().includes('pastor') ||
        member.funcao?.toLowerCase().includes('administrador'),
      isSystemAdmin: canonicalLogin === 'admin',
    };

    const response = NextResponse.json({
      success: true,
      user: userProfile,
      session: authResult.data?.session,
      syntheticEmail,
    });

    // Aplica os cookies gerados pelo Supabase SSR na resposta HTTP
    cookiesToSetList.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (error: any) {
    console.error('Erro na rota /api/login:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao realizar login' },
      { status: 500 }
    );
  }
}
