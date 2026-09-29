import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import { UserProfile } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const cookiesToSetList: { name: string; value: string; options?: any }[] = [];

    // Checa cookie administrativo de emergência
    if (req.cookies.get('appchurch_admin_session')?.value === 'true') {
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

    // Busca membro vinculado com fallback multi-critério (id do app_metadata, auth_user_id, login, email)
    const MEMBER_SESSION_COLUMNS = 'id, igreja_id, nome, login, funcao, papel_id, unidade_id, email, telefone, url_avatar, auth_user_id';
    const membroIdFromMeta = authUser.app_metadata?.membro_id;
    let memberRows: any[] | null = null;

    if (membroIdFromMeta) {
      const { data } = await supabaseAdmin.from('membros').select(MEMBER_SESSION_COLUMNS).eq('id', membroIdFromMeta).limit(1);
      memberRows = data;
    }

    if (!memberRows || memberRows.length === 0) {
      const { data } = await supabaseAdmin.from('membros').select(MEMBER_SESSION_COLUMNS).eq('auth_user_id', authUser.id).limit(1);
      memberRows = data;
    }

    if (!memberRows || memberRows.length === 0) {
      const userMetaLogin = authUser.user_metadata?.login;
      if (userMetaLogin) {
        const { data } = await supabaseAdmin.from('membros').select(MEMBER_SESSION_COLUMNS).ilike('login', userMetaLogin).limit(1);
        memberRows = data;
      }
    }

    if (!memberRows || memberRows.length === 0) {
      if (authUser.email) {
        const cleanEmail = authUser.email.toLowerCase();
        // Tenta pelo email exato
        let { data } = await supabaseAdmin.from('membros').select(MEMBER_SESSION_COLUMNS).ilike('email', cleanEmail).limit(1);
        if (!data || data.length === 0) {
          // Se for email sintético, extrai o login do prefixo do email
          const syntheticUser = cleanEmail.split('@')[0];
          const legRes = await supabaseAdmin.from('membros').select(MEMBER_SESSION_COLUMNS).or(`login.ilike.${syntheticUser},email.ilike.${syntheticUser}`).limit(1);
          data = legRes.data;
        }
        memberRows = data;
      }
    }

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const member = memberRows[0];

    // Auto-cura: se membros.auth_user_id estiver vazio, vincula agora
    if (member.auth_user_id !== authUser.id) {
      try {
        await supabaseAdmin
          .from('membros')
          .update({ auth_user_id: authUser.id })
          .eq('id', member.id);
      } catch (selfHealErr) {
        console.warn('Aviso ao sincronizar auth_user_id em /api/auth/session:', selfHealErr);
      }
    }
    let churchName = 'Paz Church Sobral';
    if (member.igreja_id) {
      const { data: cData } = await supabaseAdmin
        .from('igrejas')
        .select('nome')
        .eq('id', member.igreja_id)
        .maybeSingle();
      if (cData?.nome) churchName = cData.nome;
    }

    let sector = 'Setor Geral';
    const resolvedUnitId = member.unidade_id;
    if (resolvedUnitId) {
      const { data: unitData } = await supabaseAdmin
        .from('unidades')
        .select('id, nome, pai_id')
        .eq('id', resolvedUnitId)
        .maybeSingle();

      if (unitData?.pai_id) {
        const { data: parentUnit } = await supabaseAdmin
          .from('unidades')
          .select('nome')
          .eq('id', unitData.pai_id)
          .maybeSingle();
        if (parentUnit?.nome) sector = parentUnit.nome;
      } else if (unitData?.nome) {
        sector = unitData.nome;
      }
    }

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
