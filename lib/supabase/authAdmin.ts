import { getSupabaseAdminClient } from './admin';

export interface CreateMemberAuthParams {
  churchId?: string | null;
  memberId: string;
  name: string;
  login: string;
  password?: string | null;
  email?: string | null;
  role?: string | null;
}

export function getSyntheticMemberEmail(login: string): string {
  const clean = (login || '').trim().toLowerCase();
  const safeUser = clean.replace(/[^a-z0-9._-]/g, '_') || 'usuario';
  return `${safeUser}@membros.appchurch.local`;
}

/**
 * Cria ou vincula o usuário correspondente no Supabase Auth (tabela auth.users)
 * com confirmação de email automática (email_confirm: true) para permitir login imediato.
 */
export async function createAuthUserForMember(params: CreateMemberAuthParams): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.warn('[createAuthUserForMember] Supabase Admin Client não disponível no servidor.');
    return null;
  }

  const cleanLogin = (params.login || '').trim().toLowerCase();
  const rawPass = (params.password || '').trim() || '123456';
  const syntheticEmail = getSyntheticMemberEmail(cleanLogin);

  try {
    // 1. Tenta criar usuário novo no auth.users
    const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: rawPass,
      email_confirm: true,
      app_metadata: {
        igreja_id: params.churchId || null,
        membro_id: params.memberId,
        role: params.role || 'Membro',
      },
      user_metadata: {
        nome: params.name.trim(),
        login: cleanLogin,
      },
    });

    if (createData?.user?.id) {
      return createData.user.id;
    }

    // 2. Se o usuário já existia (ex: recadastro ou email sintético existente), busca e atualiza
    if (createErr && (createErr.message?.includes('already been registered') || createErr.message?.includes('exists'))) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(
        (u) => u.email?.toLowerCase() === syntheticEmail.toLowerCase()
      );

      if (existingUser) {
        // Atualiza a senha e metadata para garantir acesso imediato
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          password: rawPass,
          email_confirm: true,
          app_metadata: {
            ...existingUser.app_metadata,
            igreja_id: params.churchId || existingUser.app_metadata?.igreja_id,
            membro_id: params.memberId,
            role: params.role || existingUser.app_metadata?.role || 'Membro',
          },
          user_metadata: {
            ...existingUser.user_metadata,
            nome: params.name.trim(),
            login: cleanLogin,
          },
        });
        return existingUser.id;
      }
    }

    if (createErr) {
      console.error('[createAuthUserForMember] Erro ao criar usuário no auth.users:', createErr);
    }
  } catch (err: any) {
    console.error('[createAuthUserForMember] Exceção ao sincronizar auth.users:', err);
  }

  return null;
}

/**
 * Remove o autenticador correspondente do auth.users quando um membro é excluído
 */
export async function deleteAuthUserForMember(authUserId?: string | null): Promise<boolean> {
  if (!authUserId) return false;

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    console.warn('[deleteAuthUserForMember] Supabase Admin Client indisponível para exclusão de auth.');
    return false;
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (error) {
      console.warn(`[deleteAuthUserForMember] Aviso ao deletar auth_user_id ${authUserId}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[deleteAuthUserForMember] Exceção ao deletar auth_user_id ${authUserId}:`, err);
    return false;
  }
}
