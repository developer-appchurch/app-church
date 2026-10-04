import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { createServerClient } from '@supabase/ssr';
import { createAuthUserForMember, getSyntheticMemberEmail } from '@/lib/supabase/authAdmin';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import bcrypt from 'bcryptjs';

/**
 * GET /api/members/access?churchId=...&search=...
 * Lista membros da igreja para a aba "Gestão de Logins", com o estado
 * atual de acesso (membros.acesso_ativo).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const search = (searchParams.get('search') || '').trim();

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let query = supabase
      .from('membros')
      .select('id, nome, login, funcao, acesso_ativo, senha_temporaria, url_avatar, unidade:unidades(nome)')
      .eq('igreja_id', churchId)
      .order('nome', { ascending: true })
      .limit(200);

    if (search) {
      query = query.or(`nome.ilike.%${search}%,login.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const members = (data || []).map((m: any) => {
      const unidade = Array.isArray(m.unidade) ? m.unidade[0] : m.unidade;
      return {
        id: m.id,
        name: m.nome,
        login: m.login,
        role: m.funcao || 'Membro',
        cellName: unidade?.nome || '',
        avatarUrl: m.url_avatar,
        accessActive: m.acesso_ativo !== false,
        temporaryPassword: Boolean(m.senha_temporaria),
      };
    });

    return NextResponse.json({ success: true, members });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access GET:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao listar membros.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/members/access
 * Ativa/desativa o acesso de login de um membro.
 * Body: { memberId, churchId, accessActive }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, churchId, accessActive } = body || {};

    if (!memberId || typeof accessActive !== 'boolean') {
      return NextResponse.json(
        { error: 'memberId e accessActive (boolean) são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let query = supabase.from('membros').update({ acesso_ativo: accessActive }).eq('id', memberId);
    if (churchId) query = query.eq('igreja_id', churchId);

    const { data, error } = await query.select('id, nome, acesso_ativo').single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      member: { id: data.id, name: data.nome, accessActive: data.acesso_ativo !== false },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar acesso.' },
      { status: 500 }
    );
  }
}

function generateTemporaryPassword(): string {
  // Evita caracteres ambíguos (0/O, 1/l/I) para facilitar repasse manual (WhatsApp, etc.)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

/**
 * POST /api/members/access
 * Dois usos, diferenciados pela presença de "login" no body:
 *  - Sem "login": reseta a senha do membro (já tem acesso) para uma
 *    temporária aleatória, mostrada uma única vez.
 *  - Com "login": atribui login e senha pela primeira vez a um membro que
 *    hoje não tem acesso ao app (membros.login ainda NULL) — usado na edição
 *    de membro em "Minha Célula".
 * Body: { memberId, churchId, login?, password? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, churchId, login, password } = body || {};

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: member, error: memberErr } = await supabase
      .from('membros')
      .select('id, nome, login, funcao, igreja_id')
      .eq('id', memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    }

    // ===== Modo ATRIBUIR: membro ainda não tem login =====
    if (login) {
      const cleanLogin = sanitizeLogin(login);
      if (!cleanLogin) {
        return NextResponse.json({ error: 'Login inválido.' }, { status: 400 });
      }
      const cleanPass = (password || '123456').trim();
      if (cleanPass.length < 6) {
        return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres.' }, { status: 400 });
      }

      const { data: existingLogin } = await supabase
        .from('membros')
        .select('id')
        .ilike('login', escapeLike(cleanLogin))
        .neq('id', memberId)
        .limit(1);

      if (existingLogin && existingLogin.length > 0) {
        return NextResponse.json({ error: `O login "${cleanLogin}" já está em uso.` }, { status: 409 });
      }

      const hashAssign = bcrypt.hashSync(cleanPass, 10);
      const { error: assignErr } = await supabase
        .from('membros')
        .update({ login: cleanLogin, senha_hash: hashAssign, senha_temporaria: false, acesso_ativo: true })
        .eq('id', memberId);

      if (assignErr) {
        if (assignErr.code === '23505') {
          return NextResponse.json({ error: `O login "${cleanLogin}" já está em uso.` }, { status: 409 });
        }
        return NextResponse.json({ error: assignErr.message }, { status: 500 });
      }

      try {
        await createAuthUserForMember({
          churchId: member.igreja_id || churchId,
          memberId: member.id,
          name: member.nome,
          login: cleanLogin,
          password: cleanPass,
          role: member.funcao,
        });
      } catch (authErr) {
        console.warn('[members/access POST assign] Falha ao sincronizar no Supabase Auth (seguindo com fallback legado):', authErr);
      }

      return NextResponse.json({ success: true, assignedLogin: cleanLogin });
    }

    // ===== Modo RESET: gera senha temporária aleatória =====
    const temporaryPassword = generateTemporaryPassword();
    const hash = bcrypt.hashSync(temporaryPassword, 10);

    const { error: updateErr } = await supabase
      .from('membros')
      .update({ senha_hash: hash, senha_temporaria: true })
      .eq('id', memberId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Sincroniza também no Supabase Auth (melhor esforço — login ainda funciona
    // via fallback legado em membros.senha_hash mesmo se isto falhar).
    if (member.login) {
      try {
        await createAuthUserForMember({
          churchId: member.igreja_id || churchId,
          memberId: member.id,
          name: member.nome,
          login: member.login,
          password: temporaryPassword,
          role: member.funcao,
        });
      } catch (authErr) {
        console.warn('[members/access POST] Falha ao sincronizar senha no Supabase Auth (seguindo com fallback legado):', authErr);
      }
    }

    return NextResponse.json({ success: true, temporaryPassword });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access POST:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao resetar senha.' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/members/access — Editar login e/ou senha de um membro
// Usado na edição de membro em "Minha Célula" (botão "Editar login e senha").
// Body: { memberId, churchId, login?, password? }
//  - login: novo login (opcional). Valida formato, logins reservados e unicidade.
//  - password: nova senha (opcional). Mínimo de 6 caracteres. Em branco = mantém.
// Mantém o Supabase Auth sincronizado (e-mail sintético e senha), pois o login
// do app autentica primeiro no Auth (login@membros.appchurch.local).
// =============================================================================

const RESERVED_LOGINS = ['admin', 'administrator', 'root', 'sistema', 'suporte'];
const MIN_PASSWORD_LENGTH = 6;

/** Escapa curingas do ILIKE (o "_" é permitido em login e não pode virar curinga). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function sanitizeLogin(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

/** Resolve o membro logado que está fazendo a requisição e o seu nível hierárquico. */
async function resolveRequester(req: NextRequest, supabase: any) {
  if (req.cookies.get('appchurch_admin_session')?.value === 'true') {
    return { isSystemAdmin: true, churchId: null as string | null, level: 99, id: '', canEditMembers: true };
  }

  const ssrClient = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Rota de escrita: não precisa renovar cookies de sessão aqui
      },
    },
  });

  const {
    data: { user: authUser },
  } = await ssrClient.auth.getUser();
  if (!authUser) return null;

  const membroId = authUser.app_metadata?.membro_id;
  let query = supabase.from('membros').select('id, igreja_id, funcao, papel_id, papel:papeis(nivel_hierarquia)');
  query = membroId ? query.eq('id', membroId) : query.eq('auth_user_id', authUser.id);
  const { data: requester } = await query.maybeSingle();
  if (!requester) return null;

  const papel = Array.isArray(requester.papel) ? requester.papel[0] : requester.papel;
  const funcao = (requester.funcao || '').toLowerCase();
  const level = funcao.includes('pastor') ? 99 : Number(papel?.nivel_hierarquia || 1);

  // Mesma permissão que libera a edição de membros na tela ("Editar Membros" = member:edit),
  // respeitando concessões/bloqueios individuais em membro_permissoes.
  let canEditMembers = funcao.includes('pastor');
  const { data: perm } = await supabase.from('permissoes').select('id').eq('codigo', 'member:edit').maybeSingle();
  if (perm?.id) {
    const { data: individual } = await supabase
      .from('membro_permissoes')
      .select('concedida')
      .eq('membro_id', requester.id)
      .eq('permissao_id', perm.id)
      .maybeSingle();
    if (individual) {
      canEditMembers = individual.concedida === true;
    } else if (!canEditMembers && requester.papel_id) {
      const { data: rolePerm } = await supabase
        .from('papel_permissoes')
        .select('papel_id')
        .eq('papel_id', requester.papel_id)
        .eq('permissao_id', perm.id)
        .maybeSingle();
      canEditMembers = Boolean(rolePerm);
    }
  }

  return {
    isSystemAdmin: false,
    churchId: requester.igreja_id as string,
    level,
    id: requester.id as string,
    canEditMembers,
  };
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, churchId } = body || {};
    const wantsLogin = body?.login !== undefined && body?.login !== null && String(body.login).trim() !== '';
    const rawPassword = typeof body?.password === 'string' ? body.password.trim() : '';
    const wantsPassword = rawPassword.length > 0;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }
    if (!wantsLogin && !wantsPassword) {
      return NextResponse.json({ error: 'Informe um novo login e/ou uma nova senha.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: member, error: memberErr } = await supabase
      .from('membros')
      .select('id, nome, login, funcao, igreja_id, auth_user_id, papel:papeis(nivel_hierarquia)')
      .eq('id', memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    }
    if (churchId && member.igreja_id !== churchId) {
      return NextResponse.json({ error: 'Membro não pertence a esta igreja.' }, { status: 403 });
    }

    // ---- Autorização: precisa ser líder da mesma igreja e não pode editar alguém acima dele
    const requester = await resolveRequester(req, supabase);
    if (!requester) {
      return NextResponse.json({ error: 'Sessão expirada. Entre novamente no app.' }, { status: 401 });
    }
    if (!requester.isSystemAdmin) {
      const targetPapel = Array.isArray((member as any).papel) ? (member as any).papel[0] : (member as any).papel;
      const targetLevel = (member.funcao || '').toLowerCase().includes('pastor')
        ? 99
        : Number(targetPapel?.nivel_hierarquia || 1);
      const isSelf = requester.id === member.id;
      if (requester.churchId !== member.igreja_id || (!isSelf && !requester.canEditMembers)) {
        return NextResponse.json({ error: 'Você não tem permissão para editar o acesso deste membro.' }, { status: 403 });
      }
      if (!isSelf && targetLevel > requester.level) {
        return NextResponse.json(
          { error: 'Este membro tem um nível acima do seu. Peça à liderança superior para alterar o acesso.' },
          { status: 403 }
        );
      }
    }

    // ---- Validação do login
    let newLogin: string | null = null;
    if (wantsLogin) {
      const cleanLogin = sanitizeLogin(body.login);
      if (cleanLogin.length < 3) {
        return NextResponse.json(
          { error: 'O login deve ter pelo menos 3 caracteres (letras, números, ponto, hífen ou _).' },
          { status: 400 }
        );
      }
      if (cleanLogin !== (member.login || '').trim().toLowerCase()) {
        if (RESERVED_LOGINS.includes(cleanLogin)) {
          return NextResponse.json({ error: 'Este login já está em uso. Por favor, escolha outro login.' }, { status: 409 });
        }
        const { data: existing } = await supabase
          .from('membros')
          .select('id')
          .ilike('login', escapeLike(cleanLogin))
          .neq('id', memberId)
          .limit(1);
        if (existing && existing.length > 0) {
          return NextResponse.json({ error: 'Este login já está em uso. Por favor, escolha outro login.' }, { status: 409 });
        }
        newLogin = cleanLogin;
      }
    }

    // ---- Validação da senha (regra do banco/Auth: mínimo 6 caracteres)
    if (wantsPassword && rawPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` },
        { status: 400 }
      );
    }

    if (!newLogin && !wantsPassword) {
      return NextResponse.json({ success: true, login: member.login, unchanged: true });
    }

    // ---- 1) Sincroniza o Supabase Auth primeiro (se o membro já tem conta lá)
    const previousLogin = member.login;
    let authUpdated = false;
    if (member.auth_user_id) {
      const supabaseAdmin = getSupabaseAdminClient();
      if (!supabaseAdmin) {
        return NextResponse.json(
          { error: 'Servidor sem acesso administrativo ao Supabase Auth. Nada foi alterado.' },
          { status: 500 }
        );
      }
      const authPatch: Record<string, any> = {};
      if (newLogin) {
        authPatch.email = getSyntheticMemberEmail(newLogin);
        authPatch.email_confirm = true;
        authPatch.user_metadata = { nome: member.nome, login: newLogin };
      }
      if (wantsPassword) authPatch.password = rawPassword;

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, authPatch);
      if (authErr) {
        const msg = (authErr.message || '').toLowerCase();
        if (newLogin && (msg.includes('already') || msg.includes('exists') || (authErr as any).status === 422)) {
          return NextResponse.json({ error: 'Este login já está em uso. Por favor, escolha outro login.' }, { status: 409 });
        }
        return NextResponse.json({ error: `Falha ao atualizar o acesso: ${authErr.message}` }, { status: 500 });
      }
      authUpdated = true;
    }

    // ---- 2) Atualiza a tabela membros
    const memberPatch: Record<string, any> = {};
    if (newLogin) memberPatch.login = newLogin;
    if (wantsPassword) {
      memberPatch.senha_hash = bcrypt.hashSync(rawPassword, 10);
      memberPatch.senha_temporaria = false;
    }

    const { error: updateErr } = await supabase.from('membros').update(memberPatch).eq('id', memberId);
    if (updateErr) {
      // Desfaz a troca de e-mail no Auth para não deixar login e Auth divergentes
      if (authUpdated && newLogin && previousLogin) {
        const supabaseAdmin = getSupabaseAdminClient();
        await supabaseAdmin?.auth.admin
          .updateUserById(member.auth_user_id, {
            email: getSyntheticMemberEmail(previousLogin),
            user_metadata: { nome: member.nome, login: previousLogin },
          })
          .catch(() => {});
      }
      if (updateErr.code === '23505') {
        return NextResponse.json({ error: 'Este login já está em uso. Por favor, escolha outro login.' }, { status: 409 });
      }
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      login: newLogin || member.login,
      loginChanged: Boolean(newLogin),
      passwordChanged: wantsPassword,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access PUT:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar login e senha.' },
      { status: 500 }
    );
  }
}
