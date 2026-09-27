import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { OrganizationalUnit, CreateUnitInput } from '@/types';
import crypto from 'crypto';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Determina o papel atual de um membro e resolve papel_id caso esteja nulo no banco
 */
function resolveMemberCurrentRole(m: any, roles: any[]) {
  if (m.papel_id && roles && roles.length > 0) {
    const matchedById = roles.find((r: any) => r.id === m.papel_id);
    if (matchedById) {
      return {
        roleId: matchedById.id,
        roleName: matchedById.nome,
        hierarchyLevel: matchedById.nivel_hierarquia || 1,
      };
    }
  }

  if (m.funcao && roles && roles.length > 0) {
    const fNorm = m.funcao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchedByName = roles.find((r: any) => {
      const rNorm = (r.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const rSlug = (r.slug || '').toLowerCase();
      return rNorm === fNorm || rSlug === fNorm || rNorm.includes(fNorm) || fNorm.includes(rNorm);
    });
    if (matchedByName) {
      return {
        roleId: matchedByName.id,
        roleName: matchedByName.nome,
        hierarchyLevel: matchedByName.nivel_hierarquia || 1,
      };
    }
  }

  // Fallback padrão: Membro (Nível 1)
  const defaultMembro = (roles || []).find(
    (r: any) => r.slug === 'membro' || (r.nome && r.nome.toLowerCase().includes('membro')) || r.nivel_hierarquia === 1
  );

  return {
    roleId: defaultMembro?.id || 'b2000000-0000-0000-0000-000000000003',
    roleName: defaultMembro?.nome || (m.funcao || 'Membro'),
    hierarchyLevel: defaultMembro?.nivel_hierarquia || 1,
  };
}

/**
 * Determina o papel e nível hierárquico assumido com base no tipo de nível da unidade organizacional
 */
function resolveLeadershipRole(currentLevel: any, isLeafLevel: boolean, roles: any[]) {
  if (!roles || roles.length === 0) {
    return {
      assumedRole: null,
      assumedHierarchyLevel: isLeafLevel ? 2 : 3,
      assumedRoleName: isLeafLevel ? 'Líder de Célula' : `Líder de ${currentLevel?.nome || 'Unidade'}`,
      assumedRoleId: null,
    };
  }

  const lvlName = currentLevel?.nome || '';
  const lvlNorm = lvlName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lvlOrdem = typeof currentLevel?.ordem === 'number' ? currentLevel.ordem : null;

  // 1. Tenta correspondência direta por slug ou nome (ex: lider-celula, lider-setor, lider-area, lider-distrito)
  let matched = roles.find((r: any) => {
    const rNorm = (r.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rSlug = (r.slug || '').toLowerCase();
    return (
      rSlug === `lider-${lvlNorm}` ||
      rNorm === `lider de ${lvlNorm}` ||
      rNorm.includes(`lider de ${lvlNorm}`) ||
      (rSlug.includes(lvlNorm) && r.nivel_hierarquia > 1)
    );
  });

  // 2. Se não encontrar diretamente pelo nome textual, usa a ordem padrão da hierarquia
  if (!matched) {
    if (lvlOrdem === 40 || isLeafLevel || lvlNorm.includes('celula')) {
      matched = roles.find(
        (r: any) => r.slug === 'lider-celula' || (r.nome && r.nome.includes('Célula') && r.nivel_hierarquia === 2)
      );
    } else if (lvlOrdem === 30 || lvlNorm.includes('setor')) {
      matched = roles.find(
        (r: any) => r.slug === 'lider-setor' || (r.nome && r.nome.includes('Setor') && r.nivel_hierarquia === 3)
      );
    } else if (lvlOrdem === 20 || lvlNorm.includes('area')) {
      matched = roles.find(
        (r: any) => r.slug === 'lider-area' || (r.nome && r.nome.includes('Área') && r.nivel_hierarquia === 4)
      );
    } else if (lvlOrdem === 10 || lvlNorm.includes('distrito')) {
      matched = roles.find(
        (r: any) => r.slug === 'lider-distrito' || (r.nome && r.nome.includes('Distrito') && r.nivel_hierarquia === 5)
      );
    }
  }

  const assumedHierarchyLevel = matched?.nivel_hierarquia || (isLeafLevel || lvlOrdem === 40 ? 2 : 3);
  const assumedRoleName =
    matched?.nome || (isLeafLevel || lvlOrdem === 40 ? 'Líder de Célula' : `Líder de ${lvlName || 'Unidade'}`);
  const assumedRoleId = matched?.id || null;

  return {
    assumedRole: matched,
    assumedHierarchyLevel,
    assumedRoleName,
    assumedRoleId,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const levelTypeId = searchParams.get('levelTypeId');
    const mode = searchParams.get('mode') || 'full'; // 'flat' | 'full'

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Modo Plano Ultrarrápido (Passo 1): Retorna lista plana de unidades (id, pai_id, nivel_tipo_id, nome, ativo)
    if (mode === 'flat') {
      let flatQuery = supabase
        .from('unidades')
        .select('id, pai_id, nivel_tipo_id, nome, ativo, igreja_id')
        .eq('igreja_id', churchId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (levelTypeId) {
        flatQuery = flatQuery.eq('nivel_tipo_id', levelTypeId);
      }

      // Buscar também contagens, líderes e detalhes de células em lote
      const [unitsRes, memberCountsRes, leadersBatchRes, celulasBatchRes] = await Promise.all([
        flatQuery,
        supabase
          .from('membros')
          .select('unidade_id')
          .eq('igreja_id', churchId)
          .not('unidade_id', 'is', null),
        supabase
          .from('unidade_lideres')
          .select('unidade_id, pessoa_id, papel')
          .eq('ativo', true),
        supabase
          .from('celulas')
          .select('unidade_id, bairro, endereco, dia_semana, horario'),
      ]);

      if (unitsRes.error) {
        return NextResponse.json({ error: unitsRes.error.message }, { status: 500 });
      }

      const rows = unitsRes.data || [];

      // Mapeamento de dados específicos da célula
      const celulasMap = new Map<string, any>();
      (celulasBatchRes.data || []).forEach((c: any) => celulasMap.set(c.unidade_id, c));

      // Contagem em lote de membros
      const countMap = new Map<string, number>();
      (memberCountsRes.data || []).forEach((m: any) => {
        if (m.unidade_id) {
          countMap.set(m.unidade_id, (countMap.get(m.unidade_id) || 0) + 1);
        }
      });

      // Líderes em lote: buscar detalhes dos líderes vinculados a qualquer unidade
      const activeLeaderRows = leadersBatchRes.data || [];
      const leaderPessoaIds = Array.from(
        new Set(activeLeaderRows.map((l: any) => l.pessoa_id).filter(Boolean))
      );

      const leaderMemberMap = new Map<string, any>();
      if (leaderPessoaIds.length > 0) {
        const ptMembersRes = await supabase
          .from('membros')
          .select('id, nome, funcao, url_avatar, telefone')
          .in('id', leaderPessoaIds);

        if (ptMembersRes.data && ptMembersRes.data.length > 0) {
          ptMembersRes.data.forEach((m: any) => leaderMemberMap.set(m.id, m));
        }

        const missingIds = leaderPessoaIds.filter((id) => !leaderMemberMap.has(id));
        if (missingIds.length > 0) {
          const legMembersRes = await supabase
            .from('members')
            .select('id, nome, funcao, url_avatar, telefone')
            .in('id', missingIds);
          (legMembersRes.data || []).forEach((m: any) => leaderMemberMap.set(m.id, m));
        }
      }

      const unitLeadersMap = new Map<string, any[]>();
      activeLeaderRows.forEach((l: any) => {
        const mem = leaderMemberMap.get(l.pessoa_id);
        const leaderObj = {
          id: l.pessoa_id,
          name: mem?.nome || 'Líder',
          role: l.papel || mem?.funcao || 'Líder',
          avatarUrl: mem?.url_avatar,
          phone: mem?.telefone,
        };
        const list = unitLeadersMap.get(l.unidade_id) || [];
        list.push(leaderObj);
        unitLeadersMap.set(l.unidade_id, list);
      });

      const flatUnits = rows.map((u: any) => {
        const unitLeaders = unitLeadersMap.get(u.id) || [];
        const celulaInfo = celulasMap.get(u.id);
        const calcMemberCount = countMap.get(u.id);
        const dbMemberCount = typeof u.quantidade_membros === 'number' ? u.quantidade_membros : 0;
        return {
          id: u.id,
          parentId: u.pai_id || null,
          levelTypeId: u.nivel_tipo_id,
          name: u.nome,
          isActive: u.ativo !== false,
          churchId: u.igreja_id,
          memberCount: calcMemberCount !== undefined ? calcMemberCount : dbMemberCount,
          leaders: unitLeaders,
          leaderCount: unitLeaders.length,
          meetingDay: u.dia_semana || u.dia_reuniao || celulaInfo?.dia_semana,
          meetingTime: u.horario || u.horario_reuniao || celulaInfo?.horario,
          neighborhood: u.bairro || celulaInfo?.bairro,
          address: u.endereco || celulaInfo?.endereco,
          fotoUrl: u.foto_url || celulaInfo?.foto_url,
        };
      });

      return NextResponse.json({
        success: true,
        units: flatUnits,
      });
    }

    // 2. Modo Completo com resolução em lote (Compatibilidade)
    // Buscar níveis da igreja
    const { data: levels } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: true });

    const levelsMap = new Map<string, { nome: string; ordem: number }>();
    (levels || []).forEach((lvl: any) => {
      levelsMap.set(lvl.id, { nome: lvl.nome, ordem: lvl.ordem });
    });

    let unitsQuery = supabase
      .from('unidades')
      .select('id, igreja_id, nivel_tipo_id, pai_id, nome, ativo, criado_em')
      .eq('igreja_id', churchId)
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (levelTypeId) {
      unitsQuery = unitsQuery.eq('nivel_tipo_id', levelTypeId);
    }

    const { data: unitsData, error: unitsError } = await unitsQuery;
    if (unitsError) {
      console.error('Erro ao buscar unidades:', unitsError);
      return NextResponse.json({ error: unitsError.message }, { status: 500 });
    }

    if (!unitsData || unitsData.length === 0) {
      return NextResponse.json({ success: true, units: [] });
    }

    // Mapeamento de nomes de todas as unidades para obter nome do pai
    const unitNameMap = new Map<string, string>();
    unitsData.forEach((u: any) => unitNameMap.set(u.id, u.nome));

    // Buscar líderes vinculados em unidade_lideres
    const unitIds = unitsData.map((u: any) => u.id);
    const { data: lideresData } = await supabase
      .from('unidade_lideres')
      .select('unidade_id, pessoa_id, papel')
      .in('unidade_id', unitIds)
      .eq('ativo', true);

    const leaderPessoaIds = (lideresData || []).map((l: any) => l.pessoa_id);
    let leaderMemberMap = new Map<string, any>();
    if (leaderPessoaIds.length > 0) {
      let ptMembersRes = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', leaderPessoaIds);

      if (ptMembersRes.data) {
        ptMembersRes.data.forEach((m: any) => leaderMemberMap.set(m.id, m));
      }
    }

    const leadersMap = new Map<string, any[]>();
    (lideresData || []).forEach((l: any) => {
      const existing = leadersMap.get(l.unidade_id) || [];
      const member = leaderMemberMap.get(l.pessoa_id);
      existing.push({
        id: l.pessoa_id,
        name: member?.nome || 'Líder',
        role: l.papel || member?.funcao || 'Líder',
        avatarUrl: member?.url_avatar,
        phone: member?.telefone,
      });
      leadersMap.set(l.unidade_id, existing);
    });

    // Contagem de membros por unidade/célula
    let countMap = new Map<string, number>();
    let { data: memberCounts } = await supabase
      .from('membros')
      .select('unidade_id')
      .eq('igreja_id', churchId)
      .not('unidade_id', 'is', null);

    (memberCounts || []).forEach((m: any) => {
      if (m.unidade_id) {
        countMap.set(m.unidade_id, (countMap.get(m.unidade_id) || 0) + 1);
      }
    });

    // Buscar dados específicos de células
    const { data: celulasData } = await supabase
      .from('celulas')
      .select('unidade_id, bairro, endereco, dia_semana, horario')
      .in('unidade_id', unitIds);

    const celulasMap = new Map<string, any>();
    (celulasData || []).forEach((c: any) => celulasMap.set(c.unidade_id, c));

    const formattedUnits: OrganizationalUnit[] = unitsData.map((u: any) => {
      const lvl = levelsMap.get(u.nivel_tipo_id) || { nome: 'Unidade', ordem: 99 };
      const unitLeaders = leadersMap.get(u.id) || [];
      const memberCount = countMap.get(u.id) || 0;
      const celulaInfo = celulasMap.get(u.id);

      return {
        id: u.id,
        churchId: u.igreja_id,
        levelTypeId: u.nivel_tipo_id,
        levelTypeName: lvl.nome,
        levelOrder: lvl.ordem,
        name: u.nome,
        parentId: u.pai_id || null,
        parentName: u.pai_id ? unitNameMap.get(u.pai_id) || 'Unidade Superior' : undefined,
        isActive: u.ativo !== false,
        leaders: unitLeaders,
        memberCount: memberCount !== undefined ? memberCount : (typeof u.quantidade_membros === 'number' ? u.quantidade_membros : 0),
        meetingDay: u.dia_semana || u.dia_reuniao || celulaInfo?.dia_semana,
        meetingTime: u.horario || u.horario_reuniao || celulaInfo?.horario,
        neighborhood: u.bairro || celulaInfo?.bairro,
        address: u.endereco || celulaInfo?.endereco,
        fotoUrl: u.foto_url || celulaInfo?.foto_url,
        createdAt: u.criado_em,
      };
    });

    return NextResponse.json({
      success: true,
      units: formattedUnits,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/hierarchy/units GET:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const input: CreateUnitInput = await req.json();

    if (!input.churchId) {
      return NextResponse.json({ error: 'Identificador da igreja (churchId) é obrigatório.' }, { status: 400 });
    }
    if (!input.levelTypeId) {
      return NextResponse.json({ error: 'O tipo de nível (levelTypeId) é obrigatório.' }, { status: 400 });
    }
    if (!input.name?.trim()) {
      return NextResponse.json({ error: 'O nome da unidade é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Obter níveis da igreja ordenados para validar hierarquia
    let { data: levels, error: levelsErr } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', input.churchId)
      .order('ordem', { ascending: true });

    if (!levels || levels.length === 0) {
      // Auto-provisionar níveis para esta igreja se não existirem
      const defaultLevels = [
        { id: generateUUID(), igreja_id: input.churchId, nome: 'Distrito', ordem: 10 },
        { id: generateUUID(), igreja_id: input.churchId, nome: 'Área', ordem: 20 },
        { id: generateUUID(), igreja_id: input.churchId, nome: 'Setor', ordem: 30 },
        { id: generateUUID(), igreja_id: input.churchId, nome: 'Célula', ordem: 40 },
      ];

      const { data: inserted, error: insertErr } = await supabase
        .from('nivel_tipo')
        .insert(defaultLevels)
        .select('id, nome, ordem')
        .order('ordem', { ascending: true });

      if (!insertErr && inserted && inserted.length > 0) {
        levels = inserted;
      } else {
        levels = defaultLevels;
      }
    }

    // Resolver levelTypeId por ID exato, por nome ou por fallback de ordem
    let currentLevelIndex = levels.findIndex((l: any) => l.id === input.levelTypeId);
    if (currentLevelIndex === -1) {
      const normalizedInput = (input.levelTypeId || '').toLowerCase().trim();
      currentLevelIndex = levels.findIndex((l: any) => {
        const lvlNameNorm = l.nome.toLowerCase().trim();
        return (
          lvlNameNorm === normalizedInput ||
          (normalizedInput.startsWith('default-lvl-') && l.ordem === (parseInt(normalizedInput.split('-')[2], 10) + 1) * 10)
        );
      });
      if (currentLevelIndex !== -1) {
        input.levelTypeId = levels[currentLevelIndex].id;
      }
    }

    if (currentLevelIndex === -1) {
      return NextResponse.json({ error: 'Nível organizacional inválido para esta igreja.' }, { status: 400 });
    }

    const currentLevel = levels[currentLevelIndex];
    const isRootLevel = currentLevelIndex === 0;
    const isLeafLevel = currentLevelIndex === levels.length - 1;

    // 2. Se NÃO for o nível raiz (mais alto), é obrigatório ter pai_id válido
    if (!isRootLevel) {
      if (!input.parentId) {
        const parentLevel = levels[currentLevelIndex - 1];
        return NextResponse.json(
          {
            error: `A unidade pai é obrigatória. Selecione um(a) ${parentLevel.nome} para vincular este(a) ${currentLevel.nome}.`,
          },
          { status: 400 }
        );
      }

      // Valida se o pai_id existe e pertence à mesma igreja
      const { data: parentCheck, error: parentErr } = await supabase
        .from('unidades')
        .select('id, nome, nivel_tipo_id')
        .eq('id', input.parentId)
        .eq('igreja_id', input.churchId)
        .maybeSingle();

      if (parentErr || !parentCheck) {
        return NextResponse.json(
          { error: 'Unidade pai selecionada não foi encontrada no banco de dados.' },
          { status: 400 }
        );
      }
    }

    const unitId = generateUUID();

    // 3. Inserir na tabela unidades com atributos consolidados
    const unitPayload: any = {
      id: unitId,
      igreja_id: input.churchId,
      nivel_tipo_id: input.levelTypeId,
      pai_id: isRootLevel ? null : (input.parentId && input.parentId.trim() !== '' ? input.parentId.trim() : null),
      nome: input.name.trim(),
      ativo: true,
      bairro: input.neighborhood?.trim() || (isLeafLevel ? 'Centro' : null),
      endereco: input.address?.trim() || null,
      dia_semana: input.meetingDay?.trim() || (isLeafLevel ? 'Quarta-feira' : null),
      dia_reuniao: input.meetingDay?.trim() || (isLeafLevel ? 'Quarta-feira' : null),
      horario: input.meetingTime?.trim() || (isLeafLevel ? '19:30' : null),
      horario_reuniao: input.meetingTime?.trim() || (isLeafLevel ? '19:30' : null),
      latitude: input.latitude !== undefined ? Number(input.latitude) : null,
      longitude: input.longitude !== undefined ? Number(input.longitude) : null,
      quantidade_membros: 0,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { error: insertUnitErr } = await supabase.from('unidades').insert([unitPayload]);
    if (insertUnitErr) {
      console.error('Erro ao inserir unidade:', insertUnitErr);
      return NextResponse.json({ error: `Falha ao criar unidade: ${insertUnitErr.message}` }, { status: 500 });
    }

    // 4. Se for célula (nível folha), salvar detalhes na tabela 'celulas'
    if (isLeafLevel) {
      try {
        const celulaPayload = {
          unidade_id: unitId,
          bairro: input.neighborhood?.trim() || 'Centro',
          endereco: input.address?.trim() || '',
          dia_semana: input.meetingDay?.trim() || 'Quarta-feira',
          horario: input.meetingTime?.trim() || '19:30',
          quantidade_membros: 0,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        };

        await supabase
          .from('celulas')
          .upsert([celulaPayload], { onConflict: 'unidade_id' });
      } catch (cErr) {
        console.warn('Aviso ao registrar detalhes em celulas:', cErr);
      }

      // Buscar nome do setor/pai para popular tabela legada cells
      let parentName = 'Geral';
      if (input.parentId) {
        const { data: pUnit } = await supabase
          .from('unidades')
          .select('nome')
          .eq('id', input.parentId)
          .maybeSingle();
        if (pUnit?.nome) parentName = pUnit.nome;
      }

      // Buscar nome do primeiro líder se houver
      let firstLeaderName = 'Líder Responsável';
      if (input.leaderNames && input.leaderNames.length > 0) {
        firstLeaderName = input.leaderNames.join(' & ');
      } else if (input.leaderMemberIds && input.leaderMemberIds.length > 0) {
        const { data: lMember } = await supabase
          .from('members')
          .select('nome')
          .eq('id', input.leaderMemberIds[0])
          .maybeSingle();
        if (lMember?.nome) firstLeaderName = lMember.nome;
      }

      // Inserir opcionalmente na tabela legada cells caso exista
      try {
        const legacyCellPayload = {
          id: unitId,
          igreja_id: input.churchId,
          nome: input.name.trim(),
          nome_lider: firstLeaderName,
          nome_setor: parentName,
          endereco: input.address?.trim() || `${input.neighborhood?.trim() || 'Centro'}`,
          dia_reuniao: input.meetingDay?.trim() || 'Quarta-feira',
          horario_reuniao: input.meetingTime?.trim() || '19:30',
        };
        await supabase.from('cells').insert([legacyCellPayload]);
      } catch {
        // Ignora caso a view 'cells' tenha sido dropada
      }
    }

    // 5. Inserir múltiplos líderes na tabela unidade_lideres e atualizar papel_id/funcao se necessário
    const leadersAssigned: any[] = [];
    if (input.leaderMemberIds && input.leaderMemberIds.length > 0) {
      // Buscar catálogo de papéis da igreja
      const { data: roles } = await supabase
        .from('papeis')
        .select('id, nome, slug, nivel_hierarquia')
        .order('nivel_hierarquia', { ascending: true });

      const { assumedHierarchyLevel, assumedRoleName, assumedRoleId } = resolveLeadershipRole(
        currentLevel,
        Boolean(isLeafLevel),
        roles || []
      );

      const leaderRows = input.leaderMemberIds.map((mId) => ({
        unidade_id: unitId,
        pessoa_id: mId,
        papel: assumedRoleName,
        ativo: true,
      }));

      const { error: leaderErr } = await supabase.from('unidade_lideres').insert(leaderRows);
      if (leaderErr) {
        console.warn('Aviso ao inserir unidade_lideres:', leaderErr.message);
      }

      // Buscar membros para verificar o nível hierárquico atual e promover se for menor
      const { data: currentMembers } = await supabase
        .from('membros')
        .select('id, nome, papel_id, funcao, unidade_id')
        .in('id', input.leaderMemberIds);

      if (currentMembers && currentMembers.length > 0) {
        for (const m of currentMembers) {
          const currentRoleInfo = resolveMemberCurrentRole(m, roles || []);
          const shouldUpgradeRole = currentRoleInfo.hierarchyLevel < assumedHierarchyLevel && Boolean(assumedRoleId);
          const shouldUpdateCellId = Boolean(isLeafLevel);

          const finalRoleId = shouldUpgradeRole ? assumedRoleId : currentRoleInfo.roleId;
          const finalRoleName = shouldUpgradeRole ? assumedRoleName : currentRoleInfo.roleName;

          // Atualiza se for promover, se for vincular célula folha, ou se o papel_id/funcao estava ausente/desatualizado
          const needsRoleSync = !m.papel_id || !m.funcao || m.papel_id !== finalRoleId || m.funcao !== finalRoleName;

          if (shouldUpgradeRole || shouldUpdateCellId || needsRoleSync) {
            const updatePayload: any = {
              papel_id: finalRoleId,
              funcao: finalRoleName,
              atualizado_em: new Date().toISOString(),
            };
            if (shouldUpdateCellId) {
              updatePayload.unidade_id = unitId;
            }

            await supabase.from('membros').update(updatePayload).eq('id', m.id);

            try {
              const legPayload: any = {
                papel_id: finalRoleId,
                funcao: finalRoleName,
              };
              if (shouldUpdateCellId) {
                legPayload.celula_id = unitId;
              }
              await supabase.from('members').update(legPayload).eq('id', m.id);
            } catch {
              // Ignora view/tabela legada se não suportar
            }
          }
        }
      }

      // Buscar dados para retorno
      let membersInfo: any[] | null = null;
      const ptMemInfo = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', input.leaderMemberIds);
      if (!ptMemInfo.error && ptMemInfo.data && ptMemInfo.data.length > 0) {
        membersInfo = ptMemInfo.data;
      } else {
        const legMemInfo = await supabase
          .from('members')
          .select('id, nome, funcao, url_avatar, telefone')
          .in('id', input.leaderMemberIds);
        membersInfo = legMemInfo.data;
      }

      (membersInfo || []).forEach((m: any) => {
        leadersAssigned.push({
          id: m.id,
          name: m.nome,
          role: m.funcao || assumedRoleName,
          avatarUrl: m.url_avatar,
          phone: m.telefone,
        });
      });
    }

    // 6. Retorno da unidade criada
    const createdUnit: OrganizationalUnit = {
      id: unitId,
      churchId: input.churchId,
      levelTypeId: input.levelTypeId,
      levelTypeName: currentLevel.nome,
      levelOrder: currentLevel.ordem,
      name: input.name.trim(),
      parentId: isRootLevel ? null : input.parentId,
      isActive: true,
      leaders: leadersAssigned,
      meetingDay: input.meetingDay,
      meetingTime: input.meetingTime,
      neighborhood: input.neighborhood,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      memberCount: isLeafLevel ? leadersAssigned.length : 0,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      unit: createdUnit,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/hierarchy/units POST:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao criar unidade.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { unitId, churchId, leaderMemberIds } = body;

    if (!unitId || !churchId) {
      return NextResponse.json(
        { error: 'Identificadores unitId e churchId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Verificar se a unidade existe
    const { data: unit, error: unitErr } = await supabase
      .from('unidades')
      .select('id, nome, igreja_id, nivel_tipo_id')
      .eq('id', unitId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (unitErr || !unit) {
      return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
    }

    // 2. Obter níveis para checar se é folha (célula) e dados do nível atual
    const { data: levels } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: true });

    const currentLevel = (levels || []).find((l: any) => l.id === unit.nivel_tipo_id);
    const isLeafLevel =
      levels && levels.length > 0 && levels[levels.length - 1].id === unit.nivel_tipo_id;

    // Buscar catálogo de papéis da igreja
    const { data: roles } = await supabase
      .from('papeis')
      .select('id, nome, slug, nivel_hierarquia')
      .order('nivel_hierarquia', { ascending: true });

    const { assumedHierarchyLevel, assumedRoleName, assumedRoleId } = resolveLeadershipRole(
      currentLevel,
      Boolean(isLeafLevel),
      roles || []
    );

    // 3. Remover vínculos antigos na tabela unidade_lideres para esta unidade
    const { error: deleteErr } = await supabase
      .from('unidade_lideres')
      .delete()
      .eq('unidade_id', unitId);

    if (deleteErr) {
      console.warn('Aviso ao limpar líderes antigos de unidade_lideres:', deleteErr.message);
    }

    // 4. Inserir novos líderes com o papel correspondente ao nível de liderança
    const safeLeaderIds: string[] = Array.isArray(leaderMemberIds)
      ? leaderMemberIds.filter((id) => typeof id === 'string' && id.trim() !== '')
      : [];

    const updatedMembersList: any[] = [];

    if (safeLeaderIds.length > 0) {
      const leaderRows = safeLeaderIds.map((mId) => ({
        unidade_id: unitId,
        pessoa_id: mId,
        papel: assumedRoleName,
        ativo: true,
      }));

      const { error: insertErr } = await supabase.from('unidade_lideres').insert(leaderRows);
      if (insertErr) {
        console.error('Erro ao inserir novos líderes em unidade_lideres:', insertErr);
      }

      // Buscar membros para verificar o nível hierárquico atual e promover se for menor
      const { data: currentMembers } = await supabase
        .from('membros')
        .select('id, nome, papel_id, funcao, unidade_id')
        .in('id', safeLeaderIds);

      const rolesMap = new Map<string, number>();
      (roles || []).forEach((r: any) => {
        if (r.id) rolesMap.set(r.id, r.nivel_hierarquia);
        if (r.nome) rolesMap.set(r.nome.toLowerCase(), r.nivel_hierarquia);
        if (r.slug) rolesMap.set(r.slug.toLowerCase(), r.nivel_hierarquia);
      });

      if (currentMembers && currentMembers.length > 0) {
        for (const m of currentMembers) {
          const currentRoleInfo = resolveMemberCurrentRole(m, roles || []);
          const shouldUpgradeRole = currentRoleInfo.hierarchyLevel < assumedHierarchyLevel && Boolean(assumedRoleId);
          const shouldUpdateCellId = Boolean(isLeafLevel);

          const finalRoleId = shouldUpgradeRole ? assumedRoleId : currentRoleInfo.roleId;
          const finalRoleName = shouldUpgradeRole ? assumedRoleName : currentRoleInfo.roleName;

          // Se for promover, se for vincular célula folha, ou se o papel_id/funcao estava ausente/desatualizado no banco
          const needsRoleSync = !m.papel_id || !m.funcao || m.papel_id !== finalRoleId || m.funcao !== finalRoleName;

          if (shouldUpgradeRole || shouldUpdateCellId || needsRoleSync) {
            const updatePayload: any = {
              papel_id: finalRoleId,
              funcao: finalRoleName,
              atualizado_em: new Date().toISOString(),
            };

            if (shouldUpdateCellId) {
              updatePayload.unidade_id = unitId;
            }

            const { error: updErr } = await supabase
              .from('membros')
              .update(updatePayload)
              .eq('id', m.id);

            if (updErr) {
              console.error(`Erro ao atualizar membro ${m.id} na promoção de liderança:`, updErr);
            }

            updatedMembersList.push({
              id: m.id,
              nome: m.nome,
              papel_id: finalRoleId,
              funcao: finalRoleName,
            });

            // Sincroniza também na view/tabela legada members se existir
            try {
              const legPayload: any = {
                papel_id: finalRoleId,
                funcao: finalRoleName,
              };
              if (shouldUpdateCellId) {
                legPayload.celula_id = unitId;
              }
              await supabase.from('members').update(legPayload).eq('id', m.id);
            } catch {
              // Ignora caso não suporte
            }
          } else {
            updatedMembersList.push({
              id: m.id,
              nome: m.nome,
              papel_id: finalRoleId,
              funcao: finalRoleName,
            });
          }
        }
      }
    }

    // 5. Buscar informações dos novos líderes selecionados
    let leadersAssigned: any[] = [];
    let leaderNamesText = 'Sem Líder';

    if (safeLeaderIds.length > 0) {
      let membersInfo: any[] | null = null;
      const ptMemInfo = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', safeLeaderIds);

      if (!ptMemInfo.error && ptMemInfo.data && ptMemInfo.data.length > 0) {
        membersInfo = ptMemInfo.data;
      } else {
        const legMemInfo = await supabase
          .from('members')
          .select('id, nome, funcao, url_avatar, telefone')
          .in('id', safeLeaderIds);
        membersInfo = legMemInfo.data;
      }

      if (membersInfo && membersInfo.length > 0) {
        leadersAssigned = membersInfo.map((m: any) => {
          const upd = updatedMembersList.find((u) => u.id === m.id);
          return {
            id: m.id,
            name: m.nome,
            role: upd ? upd.funcao : (m.funcao || assumedRoleName),
            avatarUrl: m.url_avatar,
            phone: m.telefone,
          };
        });
        leaderNamesText = leadersAssigned.map((l) => l.name).join(' & ');
      }
    }

    // 6. Atualizar opcionalmente nome_lider na tabela legada cells se existir
    if (isLeafLevel) {
      try {
        await supabase
          .from('cells')
          .update({ nome_lider: leaderNamesText })
          .eq('id', unitId);
      } catch {
        // Ignora caso 'cells' tenha sido dropada
      }
    }

    return NextResponse.json({
      success: true,
      unitId,
      leaders: leadersAssigned,
      updatedMembers: updatedMembersList,
      message: 'Líderes atualizados com sucesso.',
    });
  } catch (err: any) {
    console.error('Erro na rota /api/hierarchy/units PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar líderes da unidade.' },
      { status: 500 }
    );
  }
}
