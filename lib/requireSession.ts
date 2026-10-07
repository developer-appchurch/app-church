import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import { hasValidAdminSession } from '@/lib/adminSession';

/**
 * Autenticação das rotas de API.
 *
 * Quem chama é identificado SEMPRE pela sessão (cookie do Supabase Auth ou cookie assinado do
 * Administrador do Sistema) — nunca por userId/churchId vindos da URL ou do corpo. Isso isola as
 * igrejas entre si: um usuário só enxerga a própria igreja.
 *
 * Uso:
 *   const auth = await requireSession(req);
 *   if (auth.error) return auth.error;
 *   const churchId = resolveChurchId(auth.actor, searchParams.get('churchId'));
 *   if (!churchId) return forbiddenChurch();
 */

export interface SessionActor {
  kind: 'member' | 'system-admin';
  isSystemAdmin: boolean;
  memberId: string | null;
  churchId: string | null;
  role: string;
  /** papeis.nivel_hierarquia (1 membro/apoio, 2 célula, 3 setor, 4 área, 5 distrito, 6 pastor); 99 = admin do sistema */
  level: number;
  papelId: string | null;
}

const PROFILE_TTL_MS = 60 * 1000;
const profileCache = new Map<string, { actor: SessionActor; expiry: number }>();

export async function getSessionActor(req: NextRequest): Promise<SessionActor | null> {
  // Administrador do Sistema (cookie assinado e com validade)
  if (hasValidAdminSession(req)) {
    return { kind: 'system-admin', isSystemAdmin: true, memberId: null, churchId: null, role: 'Administrador', level: 99, papelId: null };
  }

  const ssr = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Somente leitura: a renovação do cookie é feita pelo middleware.
      },
    },
  });

  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return null;

  const cached = profileCache.get(user.id);
  if (cached && cached.expiry > Date.now()) return cached.actor;

  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: rows, error } = await admin.rpc('get_session_profile', {
    p_membro_id: user.app_metadata?.membro_id || null,
    p_auth_user_id: user.id,
    p_login: user.user_metadata?.login || null,
    p_email: user.email ? user.email.toLowerCase() : null,
  });
  if (error) return null;
  const member = Array.isArray(rows) ? rows[0] : rows;
  if (!member) return null;

  const role: string = member.funcao || 'Membro';
  let level = 1;
  if (member.papel_id) {
    const { data: papel } = await admin
      .from('papeis')
      .select('nivel_hierarquia')
      .eq('id', member.papel_id)
      .maybeSingle();
    level = Number(papel?.nivel_hierarquia || 1);
  }
  if (role.toLowerCase().includes('pastor')) level = Math.max(level, 6);

  const actor: SessionActor = {
    kind: 'member',
    isSystemAdmin: member.login === 'admin',
    memberId: member.id,
    churchId: member.igreja_id,
    role,
    level: member.login === 'admin' ? 99 : level,
    papelId: member.papel_id || null,
  };
  profileCache.set(user.id, { actor, expiry: Date.now() + PROFILE_TTL_MS });
  return actor;
}

export async function requireSession(
  req: NextRequest
): Promise<{ actor: SessionActor; error?: undefined } | { actor?: undefined; error: NextResponse }> {
  const actor = await getSessionActor(req);
  if (!actor) {
    return {
      error: NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
  return { actor };
}

/**
 * Igreja efetiva da requisição. Membro: sempre a da sessão (se a URL pedir outra, devolve null).
 * Administrador do Sistema: a igreja pedida.
 */
export function resolveChurchId(actor: SessionActor, requested: string | null | undefined): string | null {
  if (actor.isSystemAdmin) return requested || actor.churchId;
  if (!actor.churchId) return null;
  if (requested && requested !== actor.churchId) return null;
  return actor.churchId;
}

export function forbiddenChurch(): NextResponse {
  return NextResponse.json(
    { error: 'Acesso negado a esta igreja.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Gate simples por nível hierárquico mínimo (ex.: 2 = Líder de Célula ou acima). */
export function requireLevel(actor: SessionActor, minLevel: number): NextResponse | null {
  if (actor.isSystemAdmin || actor.level >= minLevel) return null;
  return NextResponse.json(
    { error: 'Você não tem permissão para esta ação.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

const permCache = new Map<string, { value: boolean; expiry: number }>();

/**
 * Permissão efetiva do usuário logado: concessão/bloqueio individual (membro_permissoes) prevalece;
 * senão vale a permissão do papel (papel_permissoes). Pastor e Admin do Sistema sempre têm.
 */
export async function actorCan(actor: SessionActor, code: string): Promise<boolean> {
  if (actor.isSystemAdmin || actor.level >= 6) return true;
  if (!actor.memberId) return false;
  const key = `${actor.memberId}|${code}`;
  const hit = permCache.get(key);
  if (hit && hit.expiry > Date.now()) return hit.value;

  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data: perm } = await admin.from('permissoes').select('id').eq('codigo', code).maybeSingle();
  let allowed = false;
  if (perm?.id) {
    const { data: individual } = await admin
      .from('membro_permissoes')
      .select('concedida')
      .eq('membro_id', actor.memberId)
      .eq('permissao_id', perm.id)
      .maybeSingle();
    if (individual) {
      allowed = individual.concedida === true;
    } else if (actor.papelId) {
      const { data: rolePerm } = await admin
        .from('papel_permissoes')
        .select('papel_id')
        .eq('papel_id', actor.papelId)
        .eq('permissao_id', perm.id)
        .maybeSingle();
      allowed = Boolean(rolePerm);
    }
  }
  permCache.set(key, { value: allowed, expiry: Date.now() + PROFILE_TTL_MS });
  return allowed;
}

/** 403 se o usuário não tiver NENHUMA das permissões informadas. */
export async function requireAnyPermission(actor: SessionActor, codes: string[]): Promise<NextResponse | null> {
  for (const code of codes) {
    if (await actorCan(actor, code)) return null;
  }
  return NextResponse.json(
    { error: 'Você não tem permissão para esta ação.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Nível hierárquico de um papel informado por nome e/ou id (para impedir criar alguém acima de si). */
export async function levelForRole(roleName?: string | null, roleId?: string | null): Promise<number> {
  const norm = (roleName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (norm.includes('administrador')) return 99;
  const admin = getSupabaseAdminClient();
  if (!admin) return 99; // sem como verificar: trata como máximo (nega por padrão)
  let level = 1;
  if (roleId && /^[0-9a-f-]{36}$/i.test(roleId)) {
    const { data } = await admin.from('papeis').select('nivel_hierarquia').eq('id', roleId).maybeSingle();
    if (data) level = Math.max(level, Number(data.nivel_hierarquia || 1));
  }
  if (roleName) {
    const { data } = await admin.from('papeis').select('nome, nivel_hierarquia');
    (data || []).forEach((p: any) => {
      const pn = String(p.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (pn === norm) level = Math.max(level, Number(p.nivel_hierarquia || 1));
    });
    if (norm.includes('pastor')) level = Math.max(level, 6);
  }
  return level;
}

/** 403 se o usuário tentar atribuir um papel acima do seu próprio nível. */
export async function requireCanAssignRole(
  actor: SessionActor,
  roleName?: string | null,
  roleId?: string | null
): Promise<NextResponse | null> {
  if (actor.isSystemAdmin) return null;
  const target = await levelForRole(roleName, roleId);
  if (target <= actor.level) return null;
  return NextResponse.json(
    { error: 'Você não pode atribuir uma função acima do seu nível.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Confere se o membro alvo pertence à igreja do usuário logado.
 * Devolve o erro (404/403) ou os dados básicos do membro.
 */
export async function loadMemberInChurch(
  actor: SessionActor,
  memberId: string
): Promise<{ error: NextResponse; member?: undefined } | { error?: undefined; member: { id: string; igreja_id: string; funcao: string | null; level: number } }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { error: NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 }) };
  }
  const { data } = await admin
    .from('membros')
    .select('id, igreja_id, funcao, papel:papeis(nivel_hierarquia)')
    .eq('id', memberId)
    .maybeSingle();
  if (!data) {
    return { error: NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 }) };
  }
  if (!actor.isSystemAdmin && data.igreja_id !== actor.churchId) {
    return { error: forbiddenChurch() };
  }
  const papel: any = Array.isArray((data as any).papel) ? (data as any).papel[0] : (data as any).papel;
  let level = Number(papel?.nivel_hierarquia || 1);
  if (String((data as any).funcao || '').toLowerCase().includes('pastor')) level = Math.max(level, 6);
  return { member: { id: data.id, igreja_id: data.igreja_id, funcao: (data as any).funcao ?? null, level } };
}

/** Confere se a unidade (célula) pertence à igreja do usuário logado. */
export async function unitInChurch(actor: SessionActor, unitId: string): Promise<NextResponse | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 });
  const { data } = await admin.from('unidades').select('id, igreja_id').eq('id', unitId).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
  if (!actor.isSystemAdmin && data.igreja_id !== actor.churchId) return forbiddenChurch();
  return null;
}
