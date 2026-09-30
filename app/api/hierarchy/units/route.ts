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

// Cache em memória de unidades da hierarquia (60s) para evitar consultas repetidas ao banco
const serverHierarchyUnitsCache = new Map<string, { data: any; expiry: number }>();

function invalidateServerHierarchyUnitsCache(churchId?: string) {
  if (!churchId) {
    serverHierarchyUnitsCache.clear();
    return;
  }
  for (const k of Array.from(serverHierarchyUnitsCache.keys())) {
    if (k.startsWith(`units:${churchId}:`)) {
      serverHierarchyUnitsCache.delete(k);
    }
  }
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

    const cacheKey = `units:${churchId}:${mode}:${levelTypeId || 'all'}`;
    const now = Date.now();
    const cached = serverHierarchyUnitsCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      return NextResponse.json(cached.data);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Modo Plano Otimizado (Passo 1): Retorna lista plana de unidades com quantidade_membros do banco
    if (mode === 'flat') {
      let flatQuery = supabase
        .from('unidades')
        .select(`
          id,
          pai_id,
          nivel_tipo_id,
          nome,
          ativo,
          igreja_id,
          unidade_criadora_id,
          quantidade_membros,
          dia_semana,
          dia_reuniao,
          horario,
          horario_reuniao,
          bairro,
          endereco,
          foto_url
        `)
        .eq('igreja_id', churchId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

      if (levelTypeId) {
        flatQuery = flatQuery.eq('nivel_tipo_id', levelTypeId);
      }

      let unitsRes = await flatQuery;

      if (unitsRes.error) {
        if (unitsRes.error.code === '42P01' || unitsRes.error.message?.includes('does not exist')) {
          console.warn(
            `[Fallback DB] Tabela "unidades" (flat) não encontrada (código: ${unitsRes.error.code || '42P01'}). Acionando fallback para tabela "units". Mensagem: ${unitsRes.error.message}`
          );
          let fallbackQuery = supabase
            .from('units')
            .select(`
              id,
              pai_id,
              nivel_tipo_id,
              nome,
              ativo,
              igreja_id,
              unidade_criadora_id,
              quantidade_membros,
              dia_semana,
              dia_reuniao,
              horario,
              horario_reuniao,
              bairro,
              endereco,
              foto_url
            `)
            .eq('igreja_id', churchId)
            .eq('ativo', true)
            .order('nome', { ascending: true });

          if (levelTypeId) {
            fallbackQuery = fallbackQuery.eq('nivel_tipo_id', levelTypeId);
          }
          const legRes = await fallbackQuery;
          if (!legRes.error && legRes.data) {
            unitsRes = legRes;
          }
        }
        if (unitsRes.error) {
          console.error('Erro ao consultar unidades (flat):', unitsRes.error);
          return NextResponse.json({ error: unitsRes.error.message }, { status: 500 });
        }
      }

      const rows = unitsRes.data || [];
      const unitIds = rows.map((u: any) => u.id);

      // Consulta de líderes em lote único com join em membros (sem N+1 e sem varrer tabela toda)
      const unitLeadersMap = new Map<string, any[]>();
      if (unitIds.length > 0) {
        const { data: leadersData, error: lErr } = await supabase
          .from('unidade_lideres')
          .select(`
            unidade_id,
            pessoa_id,
            papel,
            membro:membros!unidade_lideres_pessoa_id_fkey (
              id,
              nome,
              funcao,
              url_avatar,
              telefone
            )
          `)
          .in('unidade_id', unitIds)
          .eq('ativo', true);

        if (!lErr && leadersData) {
          leadersData.forEach((l: any) => {
            const mem = Array.isArray(l.membro) ? l.membro[0] : l.membro;
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
        } else {
          if (lErr) {
            console.warn(
              `[Fallback DB] Join com "membros" via FK em "unidade_lideres" falhou (código: ${lErr.code || 'N/A'}). Acionando fallback manual para tabela "membros". Mensagem: ${lErr.message}`
            );
          }

          // Fallback caso o foreign key nomeado difira no schema do usuário
          const { data: fallbackLeaders, error: rawLeadersErr } = await supabase
            .from('unidade_lideres')
            .select('unidade_id, pessoa_id, papel')
            .in('unidade_id', unitIds)
            .eq('ativo', true);

          if (rawLeadersErr && (rawLeadersErr.code === '42P01' || rawLeadersErr.message?.includes('does not exist'))) {
            console.warn(
              `[Fallback DB] Tabela "unidade_lideres" (flat) não encontrada (código: ${rawLeadersErr.code || '42P01'}). Mensagem: ${rawLeadersErr.message}`
            );
          }

          const rawLeaderRows = fallbackLeaders || [];
          const leaderPessoaIds = Array.from(new Set<string>(rawLeaderRows.map((l: any) => l.pessoa_id).filter(Boolean)));

          const leaderMemberMap = new Map<string, any>();
          if (leaderPessoaIds.length > 0) {
            let { data: ptMembers, error: memErr } = await supabase
              .from('membros')
              .select('id, nome, funcao, url_avatar, telefone')
              .in('id', leaderPessoaIds);

            if (memErr && (memErr.code === '42P01' || memErr.message?.includes('does not exist'))) {
              console.warn(
                `[Fallback DB] Tabela "membros" (flat) não encontrada (código: ${memErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${memErr.message}`
              );
              const { data: legMembers } = await supabase
                .from('members')
                .select('id, nome, funcao, url_avatar, telefone')
                .in('id', leaderPessoaIds);
              ptMembers = legMembers;
            }

            (ptMembers || []).forEach((m: any) => leaderMemberMap.set(m.id, m));
          }

          rawLeaderRows.forEach((l: any) => {
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
        }
      }

      // Mapeamento de nomes de unidades para resolução rápida de pai e origem/criação
      const unitNameMap = new Map<string, string>();
      rows.forEach((r: any) => unitNameMap.set(r.id, r.nome));

      const flatUnits = rows.map((u: any) => {
        const unitLeaders = unitLeadersMap.get(u.id) || [];
        const motherId = u.unidade_criadora_id || null;
        const motherCellName = motherId ? unitNameMap.get(motherId) : undefined;
        const memberCount = typeof u.quantidade_membros === 'number' ? u.quantidade_membros : 0;

        return {
          id: u.id,
          parentId: u.pai_id || null,
          parentName: u.pai_id ? unitNameMap.get(u.pai_id) : undefined,
          levelTypeId: u.nivel_tipo_id,
          name: u.nome,
          isActive: u.ativo !== false,
          churchId: u.igreja_id,
          memberCount: memberCount,
          quantidade_membros: memberCount,
          leaders: unitLeaders,
          leaderCount: unitLeaders.length,
          meetingDay: u.dia_semana || u.dia_reuniao || 'Quarta-feira',
          meetingTime: u.horario || u.horario_reuniao || '19:30',
          neighborhood: u.bairro || 'Centro',
          address: u.endereco || '',
          fotoUrl: u.foto_url || undefined,
          unidade_criadora_id: motherId,
          motherCellId: motherId,
          motherCellName: motherCellName,
        };
      });

      const responsePayload = { success: true, units: flatUnits };
      serverHierarchyUnitsCache.set(cacheKey, {
        data: responsePayload,
        expiry: now + 60_000,
      });
      return NextResponse.json(responsePayload);
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
      .select(`
        id,
        igreja_id,
        nivel_tipo_id,
        pai_id,
        unidade_criadora_id,
        nome,
        ativo,
        quantidade_membros,
        dia_semana,
        dia_reuniao,
        horario,
        horario_reuniao,
        bairro,
        endereco,
        foto_url,
        criado_em
      `)
      .eq('igreja_id', churchId)
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (levelTypeId) {
      unitsQuery = unitsQuery.eq('nivel_tipo_id', levelTypeId);
    }

    let { data: unitsData, error: unitsError } = await unitsQuery;

    if (unitsError) {
      if (unitsError.code === '42P01' || unitsError.message?.includes('does not exist')) {
        console.warn(
          `[Fallback DB] Tabela "unidades" (full) não encontrada (código: ${unitsError.code || '42P01'}). Acionando fallback para tabela "units". Mensagem: ${unitsError.message}`
        );
        let fallbackUnitsQuery = supabase
          .from('units')
          .select(`
            id,
            igreja_id,
            nivel_tipo_id,
            pai_id,
            unidade_criadora_id,
            nome,
            ativo,
            quantidade_membros,
            dia_semana,
            dia_reuniao,
            horario,
            horario_reuniao,
            bairro,
            endereco,
            foto_url,
            criado_em
          `)
          .eq('igreja_id', churchId)
          .eq('ativo', true)
          .order('nome', { ascending: true });

        if (levelTypeId) {
          fallbackUnitsQuery = fallbackUnitsQuery.eq('nivel_tipo_id', levelTypeId);
        }

        const legRes = await fallbackUnitsQuery;
        if (!legRes.error && legRes.data) {
          unitsData = legRes.data;
          unitsError = null;
        }
      }
      if (unitsError) {
        console.error('Erro ao buscar unidades:', unitsError);
        return NextResponse.json({ error: unitsError.message }, { status: 500 });
      }
    }

    if (!unitsData || unitsData.length === 0) {
      const responsePayload = { success: true, units: [] };
      serverHierarchyUnitsCache.set(cacheKey, {
        data: responsePayload,
        expiry: now + 60_000,
      });
      return NextResponse.json(responsePayload);
    }

    // Mapeamento de nomes de todas as unidades
    const unitNameMap = new Map<string, string>();
    unitsData.forEach((u: any) => unitNameMap.set(u.id, u.nome));

    // Buscar líderes em lote único com join seguro
    const unitIds = unitsData.map((u: any) => u.id);
    const leadersMap = new Map<string, any[]>();

    if (unitIds.length > 0) {
      const { data: lideresData, error: lErr } = await supabase
        .from('unidade_lideres')
        .select(`
          unidade_id,
          pessoa_id,
          papel,
          membro:membros!unidade_lideres_pessoa_id_fkey (
            id,
            nome,
            funcao,
            url_avatar,
            telefone
          )
        `)
        .in('unidade_id', unitIds)
        .eq('ativo', true);

      if (!lErr && lideresData) {
        lideresData.forEach((l: any) => {
          const mem = Array.isArray(l.membro) ? l.membro[0] : l.membro;
          const existing = leadersMap.get(l.unidade_id) || [];
          existing.push({
            id: l.pessoa_id,
            name: mem?.nome || 'Líder',
            role: l.papel || mem?.funcao || 'Líder',
            avatarUrl: mem?.url_avatar,
            phone: mem?.telefone,
          });
          leadersMap.set(l.unidade_id, existing);
        });
      } else {
        if (lErr) {
          console.warn(
            `[Fallback DB] Join com "membros" via FK em "unidade_lideres" (full) falhou (código: ${lErr.code || 'N/A'}). Acionando fallback manual para tabela "membros". Mensagem: ${lErr.message}`
          );
        }

        // Fallback por lote de IDs
        const { data: rawLideres, error: rawLideresErr } = await supabase
          .from('unidade_lideres')
          .select('unidade_id, pessoa_id, papel')
          .in('unidade_id', unitIds)
          .eq('ativo', true);

        if (rawLideresErr && (rawLideresErr.code === '42P01' || rawLideresErr.message?.includes('does not exist'))) {
          console.warn(
            `[Fallback DB] Tabela "unidade_lideres" (full) não encontrada (código: ${rawLideresErr.code || '42P01'}). Mensagem: ${rawLideresErr.message}`
          );
        }

        const leaderPessoaIds = (rawLideres || []).map((l: any) => l.pessoa_id).filter(Boolean);
        const leaderMemberMap = new Map<string, any>();

        if (leaderPessoaIds.length > 0) {
          let { data: ptMembers, error: memErr } = await supabase
            .from('membros')
            .select('id, nome, funcao, url_avatar, telefone')
            .in('id', leaderPessoaIds);

          if (memErr && (memErr.code === '42P01' || memErr.message?.includes('does not exist'))) {
            console.warn(
              `[Fallback DB] Tabela "membros" (full) não encontrada (código: ${memErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${memErr.message}`
            );
            const { data: legMembers } = await supabase
              .from('members')
              .select('id, nome, funcao, url_avatar, telefone')
              .in('id', leaderPessoaIds);
            ptMembers = legMembers;
          }

          (ptMembers || []).forEach((m: any) => leaderMemberMap.set(m.id, m));
        }

        (rawLideres || []).forEach((l: any) => {
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
      }
    }

    const formattedUnits: OrganizationalUnit[] = unitsData.map((u: any) => {
      const lvl = levelsMap.get(u.nivel_tipo_id) || { nome: 'Unidade', ordem: 99 };
      const unitLeaders = leadersMap.get(u.id) || [];
      const motherId = u.unidade_criadora_id || null;
      const motherCellName = motherId ? unitNameMap.get(motherId) : undefined;
      const memberCount = typeof u.quantidade_membros === 'number' ? u.quantidade_membros : 0;

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
        leaderCount: unitLeaders.length,
        memberCount: memberCount,
        quantidade_membros: memberCount,
        meetingDay: u.dia_semana || u.dia_reuniao || 'Quarta-feira',
        meetingTime: u.horario || u.horario_reuniao || '19:30',
        neighborhood: u.bairro || 'Centro',
        address: u.endereco || '',
        fotoUrl: u.foto_url || undefined,
        createdAt: u.criado_em,
        unidade_criadora_id: motherId,
        motherCellId: motherId,
        motherCellName: motherCellName,
      };
    });

    const responsePayload = { success: true, units: formattedUnits };
    serverHierarchyUnitsCache.set(cacheKey, {
      data: responsePayload,
      expiry: now + 60_000,
    });
    return NextResponse.json(responsePayload);
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
    let { data: levels } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', input.churchId)
      .order('ordem', { ascending: true });

    if (!levels || levels.length === 0) {
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
    const motherCellId = input.unidade_criadora_id || input.motherCellId || null;

    // 3. Inserir na tabela unidades com atributos consolidados
    const unitPayload: any = {
      id: unitId,
      igreja_id: input.churchId,
      nivel_tipo_id: input.levelTypeId,
      pai_id: isRootLevel ? null : (input.parentId && input.parentId.trim() !== '' ? input.parentId.trim() : null),
      unidade_criadora_id: isLeafLevel ? (motherCellId && motherCellId.trim() !== '' ? motherCellId.trim() : null) : null,
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
      quantidade_membros: isLeafLevel ? (input.leaderMemberIds?.length || 0) : 0,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { error: insertUnitErr } = await supabase.from('unidades').insert([unitPayload]);
    if (insertUnitErr) {
      console.error('Erro ao inserir unidade:', insertUnitErr);
      return NextResponse.json({ error: `Falha ao criar unidade: ${insertUnitErr.message}` }, { status: 500 });
    }

    // 4. Inserir múltiplos líderes na tabela unidade_lideres e atualizar papel_id/funcao se necessário
    const leadersAssigned: any[] = [];
    if (input.leaderMemberIds && input.leaderMemberIds.length > 0) {
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
      let { data: currentMembers, error: curMemErr } = await supabase
        .from('membros')
        .select('id, nome, papel_id, funcao, unidade_id')
        .in('id', input.leaderMemberIds);

      if (curMemErr && (curMemErr.code === '42P01' || curMemErr.message?.includes('does not exist'))) {
        console.warn(
          `[Fallback DB] Tabela "membros" (POST currentMembers) não encontrada (código: ${curMemErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${curMemErr.message}`
        );
        const { data: legMembers } = await supabase
          .from('members')
          .select('id, nome, papel_id, funcao, unidade_id')
          .in('id', input.leaderMemberIds);
        currentMembers = legMembers;
      }

      if (currentMembers && currentMembers.length > 0) {
        for (const m of currentMembers) {
          const currentRoleInfo = resolveMemberCurrentRole(m, roles || []);
          const shouldUpgradeRole = currentRoleInfo.hierarchyLevel < assumedHierarchyLevel && Boolean(assumedRoleId);
          const shouldUpdateCellId = Boolean(isLeafLevel);

          const finalRoleId = shouldUpgradeRole ? assumedRoleId : currentRoleInfo.roleId;
          const finalRoleName = shouldUpgradeRole ? assumedRoleName : currentRoleInfo.roleName;

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

            const { error: updMemErr } = await supabase.from('membros').update(updatePayload).eq('id', m.id);
            if (updMemErr && (updMemErr.code === '42P01' || updMemErr.message?.includes('does not exist'))) {
              console.warn(
                `[Fallback DB] Tabela "membros" (POST update) não encontrada (código: ${updMemErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${updMemErr.message}`
              );
              await supabase.from('members').update(updatePayload).eq('id', m.id);
            }
          }
        }
      }

      // Buscar dados para retorno dos líderes atribuídos
      let { data: membersInfo, error: memInfoErr } = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', input.leaderMemberIds);

      if (memInfoErr && (memInfoErr.code === '42P01' || memInfoErr.message?.includes('does not exist'))) {
        console.warn(
          `[Fallback DB] Tabela "membros" (POST membersInfo) não encontrada (código: ${memInfoErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${memInfoErr.message}`
        );
        const { data: legMembers } = await supabase
          .from('members')
          .select('id, nome, funcao, url_avatar, telefone')
          .in('id', input.leaderMemberIds);
        membersInfo = legMembers;
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

      if (isLeafLevel) {
        const { count: realCount } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unitId);
        if (typeof realCount === 'number') {
          await supabase
            .from('unidades')
            .update({ quantidade_membros: realCount, atualizado_em: new Date().toISOString() })
            .eq('id', unitId);
        }
      }
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
      leaderCount: leadersAssigned.length,
      meetingDay: input.meetingDay,
      meetingTime: input.meetingTime,
      neighborhood: input.neighborhood,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      memberCount: isLeafLevel ? leadersAssigned.length : 0,
      quantidade_membros: isLeafLevel ? leadersAssigned.length : 0,
      createdAt: new Date().toISOString(),
      createdByMemberId: input.createdByMemberId,
      unidade_criadora_id: motherCellId,
      motherCellId: input.motherCellId || motherCellId || undefined,
      motherCellName: input.motherCellName,
    };

    invalidateServerHierarchyUnitsCache(input.churchId);

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
      let { data: currentMembers, error: curMemErr } = await supabase
        .from('membros')
        .select('id, nome, papel_id, funcao, unidade_id')
        .in('id', safeLeaderIds);

      if (curMemErr && (curMemErr.code === '42P01' || curMemErr.message?.includes('does not exist'))) {
        console.warn(
          `[Fallback DB] Tabela "membros" (PATCH currentMembers) não encontrada (código: ${curMemErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${curMemErr.message}`
        );
        const { data: legMembers } = await supabase
          .from('members')
          .select('id, nome, papel_id, funcao, unidade_id')
          .in('id', safeLeaderIds);
        currentMembers = legMembers;
      }

      if (currentMembers && currentMembers.length > 0) {
        for (const m of currentMembers) {
          const currentRoleInfo = resolveMemberCurrentRole(m, roles || []);
          const shouldUpgradeRole = currentRoleInfo.hierarchyLevel < assumedHierarchyLevel && Boolean(assumedRoleId);
          const shouldUpdateCellId = Boolean(isLeafLevel);

          const finalRoleId = shouldUpgradeRole ? assumedRoleId : currentRoleInfo.roleId;
          const finalRoleName = shouldUpgradeRole ? assumedRoleName : currentRoleInfo.roleName;

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

            if (updErr && (updErr.code === '42P01' || updErr.message?.includes('does not exist'))) {
              console.warn(
                `[Fallback DB] Tabela "membros" (PATCH update) não encontrada (código: ${updErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${updErr.message}`
              );
              await supabase.from('members').update(updatePayload).eq('id', m.id);
            } else if (updErr) {
              console.error(`Erro ao atualizar membro ${m.id} na promoção de liderança:`, updErr);
            }

            updatedMembersList.push({
              id: m.id,
              nome: m.nome,
              papel_id: finalRoleId,
              funcao: finalRoleName,
            });
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
    if (safeLeaderIds.length > 0) {
      let { data: membersInfo, error: memInfoErr } = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', safeLeaderIds);

      if (memInfoErr && (memInfoErr.code === '42P01' || memInfoErr.message?.includes('does not exist'))) {
        console.warn(
          `[Fallback DB] Tabela "membros" (PATCH membersInfo) não encontrada (código: ${memInfoErr.code || '42P01'}). Acionando fallback para tabela "members". Mensagem: ${memInfoErr.message}`
        );
        const { data: legMembers } = await supabase
          .from('members')
          .select('id, nome, funcao, url_avatar, telefone')
          .in('id', safeLeaderIds);
        membersInfo = legMembers;
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
      }
    }

    if (isLeafLevel) {
      const { count: realCount } = await supabase
        .from('membros')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', unitId);
      if (typeof realCount === 'number') {
        await supabase
          .from('unidades')
          .update({ quantidade_membros: realCount, atualizado_em: new Date().toISOString() })
          .eq('id', unitId);
      }
    }

    invalidateServerHierarchyUnitsCache(churchId);

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

/**
 * DELETE /api/hierarchy/units
 * Exclui ou desativa uma unidade/célula de 'public.unidades'.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get('unitId');
    const churchId = searchParams.get('churchId');
    const hardDelete = searchParams.get('hardDelete') === 'true';

    if (!unitId || !churchId) {
      return NextResponse.json(
        { error: 'Parâmetros unitId e churchId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Verifica se a unidade existe e pertence à igreja
    const { data: unit, error: checkErr } = await supabase
      .from('unidades')
      .select('id, nome, igreja_id, ativo')
      .eq('id', unitId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (checkErr || !unit) {
      return NextResponse.json({ error: 'Unidade não encontrada nesta igreja.' }, { status: 404 });
    }

    // 2. Impede exclusão se houver unidades filhas ativas vinculadas
    const { data: children } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('pai_id', unitId)
      .eq('ativo', true)
      .limit(5);

    if (children && children.length > 0) {
      return NextResponse.json(
        {
          error: `Não é possível excluir esta unidade pois existem ${children.length} subunidade(s) vinculadas a ela (ex: "${children[0].nome}"). Transfira-as antes de excluir.`,
        },
        { status: 400 }
      );
    }

    if (hardDelete) {
      // Desvincula membros
      await supabase
        .from('membros')
        .update({ unidade_id: null, observacoes: 'Membro desvinculado por exclusão de unidade' })
        .eq('unidade_id', unitId)
        .eq('igreja_id', churchId);

      // Remove líderes
      await supabase
        .from('unidade_lideres')
        .delete()
        .eq('unidade_id', unitId);

      // Exclui a unidade
      const { error: delErr } = await supabase
        .from('unidades')
        .delete()
        .eq('id', unitId)
        .eq('igreja_id', churchId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      invalidateServerHierarchyUnitsCache(churchId);
      return NextResponse.json({
        success: true,
        message: `Unidade "${unit.nome}" excluída com sucesso.`,
      });
    } else {
      // Soft-delete / Desativação
      const { error: deactErr } = await supabase
        .from('unidades')
        .update({
          ativo: false,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', unitId)
        .eq('igreja_id', churchId);

      if (deactErr) {
        return NextResponse.json({ error: deactErr.message }, { status: 500 });
      }

      invalidateServerHierarchyUnitsCache(churchId);
      return NextResponse.json({
        success: true,
        message: `Unidade "${unit.nome}" desativada com sucesso.`,
      });
    }
  } catch (err: any) {
    console.error('Erro na rota DELETE /api/hierarchy/units:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao excluir unidade.' },
      { status: 500 }
    );
  }
}
