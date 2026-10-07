import { NextRequest, NextResponse } from 'next/server';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission, requireCanAssignRole, loadMemberInChurch } from '@/lib/requireSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { INITIAL_PERMISSIONS, INITIAL_ROLE_PERMISSIONS, ROLE_UUIDS } from '@/data/initialData';
import { MemberEffectivePermission } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    const churchId = searchParams.get('churchId');

    if (!memberId) {
      return NextResponse.json({ error: 'Parâmetro memberId é obrigatório.' }, { status: 400 });
    }
    // O membro consultado precisa ser da igreja do usuário logado (inclui a consulta das próprias permissões)
    const targetCheck = await loadMemberInChurch(auth.actor, memberId);
    if (targetCheck.error) return targetCheck.error;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Busca dados do membro
    let member: any = null;
    const { data: dbMember, error: memErr } = await supabase
      .from('membros')
      .select('id, nome, login, funcao, papel_id, igreja_id, url_avatar, telefone, email, unidade:unidades(id, nome)')
      .eq('id', memberId)
      .maybeSingle();

    member = dbMember;

    if (memErr && (memErr.code === '42P01' || memErr.message?.includes('does not exist'))) {
      const { data: legMember } = await supabase
        .from('members')
        .select('id, nome, login, funcao, papel_id, igreja_id, url_avatar, telefone, email')
        .eq('id', memberId)
        .maybeSingle();
      member = legMember;
    }

    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    }

    // Normaliza papel do membro
    const memberRoleName = member.funcao || 'Membro';
    const memberRoleId = member.papel_id;
    const isPastor = memberRoleName.toLowerCase().includes('pastor');
    const isAdmin = memberRoleName.toLowerCase().includes('admin') || member.login === 'admin';

    // 2. Busca catálogo de permissões
    let allPermissions: any[] = [];
    const { data: dbPerms, error: permErr } = await supabase
      .from('permissoes')
      .select('id, codigo, nome, modulo, descricao')
      .order('modulo', { ascending: true })
      .order('nome', { ascending: true });

    if (!permErr && dbPerms && dbPerms.length > 0) {
      allPermissions = dbPerms;
    } else {
      allPermissions = INITIAL_PERMISSIONS.map((p) => ({
        id: p.id,
        codigo: p.code,
        nome: p.name,
        modulo: p.module,
        descricao: p.description,
      }));
    }

    // 3. Busca permissões herdadas do papel
    const rolePermissionSet = new Set<string>();

    if (isPastor || isAdmin) {
      // Pastores e Administradores herdam todas as permissões do sistema
      allPermissions.forEach((p) => rolePermissionSet.add(p.id));
    } else {
      // Resolve papel_id se não estiver preenchido diretamente na coluna
      let resolvedRoleId = memberRoleId;
      if (!resolvedRoleId) {
        const norm = memberRoleName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (norm.includes('admin')) resolvedRoleId = ROLE_UUIDS.ADMINISTRADOR;
        else if (norm.includes('pastor')) resolvedRoleId = ROLE_UUIDS.PASTOR;
        else if (norm.includes('supervisor')) resolvedRoleId = ROLE_UUIDS.SUPERVISOR;
        else if (norm.includes('distrito')) resolvedRoleId = ROLE_UUIDS.SUPERVISOR;
        else if (norm.includes('area')) resolvedRoleId = ROLE_UUIDS.SUPERVISOR;
        else if (norm.includes('setor')) resolvedRoleId = ROLE_UUIDS.LIDER_SETOR;
        else if (norm.includes('celula')) resolvedRoleId = ROLE_UUIDS.LIDER_CELULA;
        else if (norm.includes('treinamento')) resolvedRoleId = ROLE_UUIDS.LIDER_TREINAMENTO;
        else if (norm.includes('anfitriao')) resolvedRoleId = ROLE_UUIDS.ANFITRIAO;
        else if (norm.includes('secretario')) resolvedRoleId = ROLE_UUIDS.SECRETARIO;
        else if (norm.includes('intercessor')) resolvedRoleId = ROLE_UUIDS.INTERCESSOR;
        else resolvedRoleId = ROLE_UUIDS.MEMBRO;
      }

      if (resolvedRoleId) {
        let { data: rolePerms } = await supabase
          .from('papel_permissoes')
          .select('permissao_id')
          .eq('papel_id', resolvedRoleId);

        if (rolePerms && rolePerms.length > 0) {
          rolePerms.forEach((rp: any) => rolePermissionSet.add(rp.permissao_id));
        } else {
          // Fallback para INITIAL_ROLE_PERMISSIONS
          INITIAL_ROLE_PERMISSIONS.filter((rp) => rp.roleId === resolvedRoleId).forEach((rp) => {
            rolePermissionSet.add(rp.permissionId);
          });
        }
      }
    }

    // 4. Busca overrides específicos do membro em `membro_permissoes`
    const memberOverridesMap = new Map<string, boolean>();
    const { data: overridesData } = await supabase
      .from('membro_permissoes')
      .select('permissao_id, concedida')
      .eq('membro_id', memberId);

    if (overridesData && overridesData.length > 0) {
      overridesData.forEach((ov: any) => {
        memberOverridesMap.set(ov.permissao_id, Boolean(ov.concedida));
      });
    }

    // 5. Avalia cada permissão seguindo a REGRA DE PRIORIDADE estrita:
    // (a) Se existir linha em membro_permissoes -> vence o valor de concedida (true ou false)
    // (b) Senão -> herda o que o papel concede (rolePermissionSet)
    const evaluatedPermissions: MemberEffectivePermission[] = allPermissions.map((p) => {
      const inherited = rolePermissionSet.has(p.id);
      const hasOverride = memberOverridesMap.has(p.id);
      const overrideVal = hasOverride ? (memberOverridesMap.get(p.id) as boolean) : null;
      const effective = overrideVal !== null ? overrideVal : inherited;

      return {
        id: p.id,
        code: p.codigo,
        name: p.nome,
        module: p.modulo,
        description: p.descricao || '',
        inherited,
        override: overrideVal,
        effective,
      };
    });

    const unidadeData = Array.isArray(member.unidade) ? member.unidade[0] : member.unidade;

    return NextResponse.json({
      success: true,
      member: {
        id: member.id,
        name: member.nome,
        login: member.login,
        role: memberRoleName,
        roleId: memberRoleId,
        churchId: member.igreja_id || churchId,
        avatarUrl: member.url_avatar,
        phone: member.telefone,
        email: member.email,
        cellName: unidadeData?.nome || '',
      },
      permissions: evaluatedPermissions,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/permissions/member GET:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao consultar permissões do membro.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const deniedManage = await requireAnyPermission(auth.actor, ['permissions:manage', 'church:admin']);
    if (deniedManage) return deniedManage;
    const body = await req.json();
    const { memberId, permissionId, permissionCode, concedida } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }
    const targetCheck = await loadMemberInChurch(auth.actor, memberId);
    if (targetCheck.error) return targetCheck.error;

    if (!permissionId && !permissionCode) {
      return NextResponse.json(
        { error: 'permissionId ou permissionCode é obrigatório.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Resolve permissionId caso tenha recebido apenas permissionCode
    let resolvedPermId = permissionId;
    if (!resolvedPermId && permissionCode) {
      const { data: pData } = await supabase
        .from('permissoes')
        .select('id')
        .eq('codigo', permissionCode)
        .maybeSingle();

      if (pData?.id) {
        resolvedPermId = pData.id;
      }
    }

    if (!resolvedPermId) {
      return NextResponse.json({ error: 'Permissão não encontrada.' }, { status: 404 });
    }

    // 2. Se concedida for null ou undefined -> Remove o override (volta ao padrão do papel)
    if (concedida === null || concedida === undefined) {
      const { error: delErr } = await supabase
        .from('membro_permissoes')
        .delete()
        .eq('membro_id', memberId)
        .eq('permissao_id', resolvedPermId);

      if (delErr) {
        console.error('Erro ao remover override em membro_permissoes:', delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: 'removed_override',
        memberId,
        permissionId: resolvedPermId,
        concedida: null,
        message: 'Permissão restaurada para o padrão da função.',
      });
    }

    // 3. Se concedida for boolean (true ou false) -> Upsert na tabela membro_permissoes
    const isGranted = Boolean(concedida);
    const { error: upsertErr } = await supabase
      .from('membro_permissoes')
      .upsert(
        {
          membro_id: memberId,
          permissao_id: resolvedPermId,
          concedida: isGranted,
          concedida_em: new Date().toISOString(),
        },
        { onConflict: 'membro_id,permissao_id' }
      );

    if (upsertErr) {
      console.error('Erro ao salvar override em membro_permissoes:', upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: isGranted ? 'granted' : 'revoked',
      memberId,
      permissionId: resolvedPermId,
      concedida: isGranted,
      message: isGranted
        ? 'Permissão especial concedida com sucesso ao membro.'
        : 'Permissão revogada explicitamente para este membro.',
    });
  } catch (err: any) {
    console.error('Erro na rota /api/permissions/member PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar permissão.' },
      { status: 500 }
    );
  }
}
