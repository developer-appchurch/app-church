import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import { UserProfile } from '@/types';
import { hasValidAdminSession } from '@/lib/adminSession';

export async function GET(req: NextRequest) {
  try {
    const cookiesToSetList: { name: string; value: string; options?: any }[] = [];

    // Sessão do administrador: só vale com cookie assinado e dentro da validade
    if (hasValidAdminSession(req)) {
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
      return NextResponse.json({ authenticated: true, user: adminUser });
    }

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

    const {
      data: { user: authUser },
    } = await ssrClient.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { authenticated: false, user: null },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' } }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ authenticated: false, error: 'Database client indisponível' });
    }

    // Busca membro vinculado (fallback multi-critério: id do app_metadata, auth_user_id,
    // login, email) + nome da igreja + nome da unidade/setor pai, tudo em uma única
    // chamada RPC (antes eram de 3 a 5 round-trips sequenciais para o Supabase).
    const membroIdFromMeta = authUser.app_metadata?.membro_id || null;
    const userMetaLogin = authUser.user_metadata?.login || null;
    const userEmail = authUser.email ? authUser.email.toLowerCase() : null;

    const { data: profileRows, error: profileError } = await supabaseAdmin.rpc('get_session_profile', {
      p_membro_id: membroIdFromMeta,
      p_auth_user_id: authUser.id,
      p_login: userMetaLogin,
      p_email: userEmail,
    });

    if (profileError) {
      console.error('Erro ao buscar perfil de sessão via RPC:', profileError);
      return NextResponse.json({ authenticated: false, user: null });
    }

    const member = Array.isArray(profileRows) ? profileRows[0] : profileRows;
    if (!member) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const churchName = member.igreja_nome || 'Paz Church Sobral';
    const cellName = member.unidade_nome || '';
    const sector = member.setor_nome || 'Setor Geral';

    const userProfile: UserProfile = {
      id: member.id,
      churchId: member.igreja_id,
      churchName,
      name: member.nome,
      login: member.login || '',
      role: member.funcao || 'Membro',
      roleId: member.papel_id || 'b2000000-0000-0000-0000-000000000003',
      sector,
      currentCellId: member.unidade_id || '',
      cellId: member.unidade_id || '',
      cellName: cellName || '',
      email: member.email || `${member.login || 'membro'}@appchurch.local`,
      phone: member.telefone || '',
      avatarUrl:
        member.url_avatar ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      isPrivileged:
        member.funcao?.toLowerCase().includes('pastor') ||
        member.funcao?.toLowerCase().includes('administrador'),
      isSystemAdmin: member.login === 'admin',
    };

    const response = NextResponse.json({ authenticated: true, user: userProfile });
    cookiesToSetList.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (err: any) {
    console.error('Erro ao consultar sessão:', err);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
