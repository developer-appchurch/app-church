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
}

const PROFILE_TTL_MS = 60 * 1000;
const profileCache = new Map<string, { actor: SessionActor; expiry: number }>();

export async function getSessionActor(req: NextRequest): Promise<SessionActor | null> {
  // Administrador do Sistema (cookie assinado e com validade)
  if (hasValidAdminSession(req)) {
    return { kind: 'system-admin', isSystemAdmin: true, memberId: null, churchId: null, role: 'Administrador' };
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

  const actor: SessionActor = {
    kind: 'member',
    isSystemAdmin: member.login === 'admin',
    memberId: member.id,
    churchId: member.igreja_id,
    role: member.funcao || 'Membro',
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
