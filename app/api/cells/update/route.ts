import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CellGroup } from '@/types';

/**
 * Rota para atualizar informações de uma Célula (Unidade Folha).
 * POST /api/cells/update
 * 
 * Validação de permissão em linha direta:
 * - Pastores, Supervisores e Administradores (acesso total).
 * - Líderes diretos da célula.
 * - Líderes superiores diretos na árvore hierárquica (Líder de Setor pai, Líder de Área pai, etc.).
 * - Líderes laterais / de outras áreas não possuem permissão de alteração.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      cellId,
      churchId,
      name,
      meetingDay,
      meetingTime,
      neighborhood,
      address,
      fotoUrl,
      parentUnitId,
      userMemberId,
    } = body;

    if (!cellId || !churchId) {
      return NextResponse.json(
        { error: 'Parâmetros cellId e churchId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Busca a unidade atual
    const { data: currentUnit, error: unitErr } = await supabase
      .from('unidades')
      .select('*')
      .eq('id', cellId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (unitErr || !currentUnit) {
      return NextResponse.json({ error: 'Célula não encontrada.' }, { status: 404 });
    }

    // 2. Validação de permissão de liderança em linha direta se userMemberId for fornecido
    if (userMemberId) {
      const { data: member } = await supabase
        .from('membros')
        .select('id, nome, funcao, papel_id, unidade_id')
        .eq('id', userMemberId)
        .maybeSingle();

      if (member) {
        const funcaoNorm = (member.funcao || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        const isGlobalAdmin =
          funcaoNorm.includes('pastor') ||
          funcaoNorm.includes('supervisor') ||
          funcaoNorm.includes('administrador') ||
          funcaoNorm.includes('admin');

        if (!isGlobalAdmin) {
          // Busca todos os líderes de unidades da igreja
          const { data: allUnitLeaders } = await supabase
            .from('unidade_lideres')
            .select('unidade_id, pessoa_id')
            .eq('ativo', true);

          const { data: allUnits } = await supabase
            .from('unidades')
            .select('id, pai_id, nome')
            .eq('igreja_id', churchId);

          const unitMap = new Map<string, any>();
          (allUnits || []).forEach((u: any) => unitMap.set(u.id, u));

          const leadersByUnit = new Map<string, Set<string>>();
          (allUnitLeaders || []).forEach((ul: any) => {
            if (!leadersByUnit.has(ul.unidade_id)) {
              leadersByUnit.set(ul.unidade_id, new Set());
            }
            leadersByUnit.get(ul.unidade_id)!.add(ul.pessoa_id);
          });

          // Checa se o usuário é líder da própria célula
          const isDirectLeader =
            leadersByUnit.get(cellId)?.has(userMemberId) ||
            member.unidade_id === cellId;

          // Checa se é líder de algum ancestral em linha direta ascendente
          let isAncestorLeader = false;
          let currentParent = currentUnit.pai_id;
          while (currentParent) {
            if (leadersByUnit.get(currentParent)?.has(userMemberId)) {
              isAncestorLeader = true;
              break;
            }
            const pUnit = unitMap.get(currentParent);
            currentParent = pUnit?.pai_id;
          }

          if (!isDirectLeader && !isAncestorLeader) {
            return NextResponse.json(
              { error: 'Você não tem permissão para editar as informações desta célula. Apenas líderes em linha direta ou pastores podem alterar.' },
              { status: 403 }
            );
          }
        }
      }
    }

    // 3. Monta o payload de atualização na tabela 'unidades' (tabela primária e consolidada)
    const meetingDayVal = meetingDay?.trim() || 'Quarta-feira';
    const meetingTimeVal = meetingTime?.trim() || '19:30';
    const neighborhoodVal = neighborhood !== undefined ? (neighborhood?.trim() || 'Centro') : undefined;
    const addressVal = address !== undefined ? (address?.trim() || '') : undefined;

    const unitUpdatePayload: any = {
      atualizado_em: new Date().toISOString(),
    };

    if (name && typeof name === 'string') unitUpdatePayload.nome = name.trim();
    if (meetingDay && typeof meetingDay === 'string') {
      unitUpdatePayload.dia_semana = meetingDayVal;
      unitUpdatePayload.dia_reuniao = meetingDayVal;
    }
    if (meetingTime && typeof meetingTime === 'string') {
      unitUpdatePayload.horario = meetingTimeVal;
      unitUpdatePayload.horario_reuniao = meetingTimeVal;
    }
    if (neighborhoodVal !== undefined) unitUpdatePayload.bairro = neighborhoodVal;
    if (addressVal !== undefined) unitUpdatePayload.endereco = addressVal;
    if (fotoUrl !== undefined) unitUpdatePayload.foto_url = fotoUrl || null;
    if (parentUnitId !== undefined) unitUpdatePayload.pai_id = parentUnitId || null;

    const { data: updatedUnit, error: updateErr } = await supabase
      .from('unidades')
      .update(unitUpdatePayload)
      .eq('id', cellId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[UpdateCell] Falha ao atualizar unidades:', updateErr);
      return NextResponse.json(
        { error: `Falha ao salvar dados da célula na tabela unidades: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 4. Sincronização secundária opcional com a tabela 'celulas' (para compatibilidade retroativa)
    try {
      const celulaPayload: any = {
        dia_semana: meetingDayVal,
        horario: meetingTimeVal,
        atualizado_em: new Date().toISOString(),
      };
      if (neighborhoodVal !== undefined) celulaPayload.bairro = neighborhoodVal;
      if (addressVal !== undefined) celulaPayload.endereco = addressVal;

      const { data: existingCelula } = await supabase
        .from('celulas')
        .select('unidade_id')
        .eq('unidade_id', cellId)
        .maybeSingle();

      if (existingCelula) {
        await supabase
          .from('celulas')
          .update(celulaPayload)
          .eq('unidade_id', cellId);
      } else {
        await supabase
          .from('celulas')
          .insert([
            {
              unidade_id: cellId,
              ...celulaPayload,
              quantidade_membros: updatedUnit.quantidade_membros || 0,
              criado_em: new Date().toISOString(),
            },
          ]);
      }
    } catch (cErr) {
      // Falha em 'celulas' não bloqueia a aplicação pois 'unidades' é a fonte de verdade
      console.warn('[UpdateCell] Aviso sincronizando celulas legadas:', cErr);
    }

    // 5. Sincronização secundária opcional com a tabela legada 'cells' se existir
    try {
      const cellsPayload: any = {};
      if (unitUpdatePayload.nome !== undefined) cellsPayload.nome = unitUpdatePayload.nome;
      if (unitUpdatePayload.endereco !== undefined) cellsPayload.endereco = unitUpdatePayload.endereco;
      if (unitUpdatePayload.dia_semana !== undefined) cellsPayload.dia_reuniao = unitUpdatePayload.dia_semana;
      if (unitUpdatePayload.horario !== undefined) cellsPayload.horario_reuniao = unitUpdatePayload.horario;

      if (Object.keys(cellsPayload).length > 0) {
        await supabase
          .from('cells')
          .update(cellsPayload)
          .eq('id', cellId);
      }
    } catch {
      // Ignora erro em 'cells'
    }

    // 6. Busca líderes e setor para montar o objeto CellGroup de retorno
    let parentName = 'Setor Geral';
    if (updatedUnit.pai_id) {
      const { data: pData } = await supabase
        .from('unidades')
        .select('nome')
        .eq('id', updatedUnit.pai_id)
        .maybeSingle();
      if (pData?.nome) parentName = pData.nome;
    }

    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select('pessoa_id')
      .eq('unidade_id', cellId)
      .eq('ativo', true);

    const leaderIds = (leadersData || []).map((l: any) => l.pessoa_id);
    let leaderNames: string[] = [];

    if (leaderIds.length > 0) {
      const { data: leaderMembers } = await supabase
        .from('membros')
        .select('nome')
        .in('id', leaderIds);
      leaderNames = (leaderMembers || []).map((m: any) => m.nome).filter(Boolean);
    }

    const formattedLeader =
      leaderNames.length === 1
        ? leaderNames[0]
        : leaderNames.length === 2
        ? `${leaderNames[0]} e ${leaderNames[1]}`
        : leaderNames.length > 2
        ? `${leaderNames.slice(0, -1).join(', ')} e ${leaderNames[leaderNames.length - 1]}`
        : 'Líder Responsável';

    const finalCell: CellGroup = {
      id: updatedUnit.id,
      churchId: updatedUnit.igreja_id,
      name: updatedUnit.nome,
      leaderName: formattedLeader,
      leaderNames,
      leaderMemberIds: leaderIds,
      sectorName: parentName,
      address: updatedUnit.endereco || addressVal || '',
      bairro: updatedUnit.bairro || neighborhoodVal || 'Centro',
      fotoUrl: updatedUnit.foto_url || fotoUrl || undefined,
      meetingDay: updatedUnit.dia_semana || updatedUnit.dia_reuniao || meetingDayVal,
      meetingTime: updatedUnit.horario || updatedUnit.horario_reuniao || meetingTimeVal,
      memberCount: updatedUnit.quantidade_membros || 0,
      parentUnitId: updatedUnit.pai_id,
      parentName,
    };

    return NextResponse.json({
      success: true,
      message: 'Informações da célula atualizadas com sucesso.',
      cell: finalCell,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/cells/update:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar célula.' },
      { status: 500 }
    );
  }
}
