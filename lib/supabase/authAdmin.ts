import { getSupabaseAdminClient } from './admin';
import { getSupabaseServerClient } from '../supabaseServer';

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
 * Suporta Admin API (service role) com fallback para Auth SignUp (anon/server key).
 */
export async function createAuthUserForMember(params: CreateMemberAuthParams): Promise<string> {
  const cleanLogin = (params.login || '').trim().toLowerCase();
  let rawPass = (params.password || '').trim();

  if (!rawPass) {
    rawPass = '123456';
  } else if (rawPass.length < 6) {
    throw new Error('A senha deve conter no mínimo 6 caracteres para autenticação no Supabase.');
  }

  const syntheticEmail = getSyntheticMemberEmail(cleanLogin);

  // 1. Tenta via Supabase Admin Client (Service Role Key)
  const supabaseAdmin = getSupabaseAdminClient();
  if (supabaseAdmin) {
    try {
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

      // Se o usuário já existia no auth.users, atualiza a senha e metadata
      if (createErr && (createErr.message?.includes('already') || createErr.message?.includes('exists') || createErr.status === 422)) {
        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) {
          console.error('[createAuthUserForMember] Erro ao listar usuários no admin:', listErr);
        }

        const existingUser = listData?.users?.find(
          (u) =>
            u.email?.toLowerCase() === syntheticEmail.toLowerCase() ||
            u.user_metadata?.login?.toLowerCase() === cleanLogin
        );

        if (existingUser) {
          const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
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

          if (updateErr) {
            console.error('[createAuthUserForMember] Erro ao atualizar senha do usuário existente no auth:', updateErr);
            throw new Error(`Falha ao sincronizar autenticador: ${updateErr.message}`);
          }

          if (updatedUser?.user?.id) {
            return updatedUser.user.id;
          }
          return existingUser.id;
        }
      }

      if (createErr) {
        console.error('[createAuthUserForMember] Erro no admin.createUser:', createErr);
        throw new Error(`Falha ao criar credencial no Supabase Auth: ${createErr.message}`);
      }
    } catch (err: any) {
      console.warn('[createAuthUserForMember] Falha no admin.createUser, tentando fallback:', err);
      if (err.message && !err.message.includes('admin.createUser')) {
        throw err;
      }
    }
  }

  // 2. Fallback via Supabase Server Client (SignUp / SignIn)
  const serverClient = getSupabaseServerClient();
  if (serverClient) {
    try {
      const { data: signUpData, error: signUpErr } = await serverClient.auth.signUp({
        email: syntheticEmail,
        password: rawPass,
        options: {
          data: {
            nome: params.name.trim(),
            login: cleanLogin,
            igreja_id: params.churchId || '',
            membro_id: params.memberId,
            role: params.role || 'Membro',
          },
        },
      });

      if (signUpData?.user?.id) {
        return signUpData.user.id;
      }

      // Se o usuário já estava cadastrado, tenta obter o id via signIn
      if (signUpErr) {
        const { data: signInData, error: signInErr } = await serverClient.auth.signInWithPassword({
          email: syntheticEmail,
          password: rawPass,
        });

        if (signInData?.user?.id) {
          return signInData.user.id;
        }
        if (signInErr) {
          throw new Error(`Falha na autenticação do membro: ${signInErr.message}`);
        }
      }
    } catch (fallbackErr: any) {
      console.error('[createAuthUserForMember] Exceção no fallback de auth:', fallbackErr);
      throw fallbackErr;
    }
  }

  throw new Error('Supabase Auth indisponível para vincular autenticador.');
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
