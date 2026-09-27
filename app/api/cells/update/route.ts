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

    // 3. Monta o payload de atualização na tabela 'unidades'
    const updatePayload: any = {
      atualizado_em: new Date().toISOString(),
    };

    if (name && typeof name === 'string') updatePayload.nome = name.trim();
    if (meetingDay && typeof meetingDay === 'string') {
      updatePayload.dia_semana = meetingDay.trim();
      updatePayload.dia_reuniao = meetingDay.trim();
    }
    if (meetingTime && typeof meetingTime === 'string') {
      updatePayload.horario = meetingTime.trim();
      updatePayload.horario_reuniao = meetingTime.trim();
    }
    if (neighborhood !== undefined) updatePayload.bairro = neighborhood?.trim() || 'Centro';
    if (address !== undefined) updatePayload.endereco = address?.trim() || '';
    if (fotoUrl !== undefined) updatePayload.foto_url = fotoUrl || null;
    if (parentUnitId !== undefined) updatePayload.pai_id = parentUnitId || null;

    const { data: updatedUnit, error: updateErr } = await supabase
      .from('unidades')
      .update(updatePayload)
      .eq('id', cellId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[UpdateCell] Falha ao atualizar unidades:', updateErr);
      return NextResponse.json(
        { error: `Falha ao salvar dados da célula: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 4. Sincronização secundária opcional com a tabela 'celulas' (para compatibilidade retroativa)
    try {
      const celulaPayload: any = {};
      if (updatePayload.bairro !== undefined) celulaPayload.bairro = updatePayload.bairro;
      if (updatePayload.endereco !== undefined) celulaPayload.endereco = updatePayload.endereco;
      if (updatePayload.dia_semana !== undefined) {
        celulaPayload.dia_semana = updatePayload.dia_semana;
        celulaPayload.dia_reuniao = updatePayload.dia_semana;
      }
      if (updatePayload.horario !== undefined) {
        celulaPayload.horario = updatePayload.horario;
        celulaPayload.horario_reuniao = updatePayload.horario;
      }
      if (updatePayload.foto_url !== undefined) celulaPayload.foto_url = updatePayload.foto_url;

      if (Object.keys(celulaPayload).length > 0) {
        await supabase
          .from('celulas')
          .update(celulaPayload)
          .eq('unidade_id', cellId);
      }
    } catch {
      // Ignora erro em 'celulas'
    }

    // 5. Sincronização secundária opcional com a tabela legada 'cells'
    try {
      const cellsPayload: any = {};
      if (updatePayload.nome !== undefined) cellsPayload.nome = updatePayload.nome;
      if (updatePayload.endereco !== undefined) cellsPayload.endereco = updatePayload.endereco;
      if (updatePayload.dia_semana !== undefined) cellsPayload.dia_reuniao = updatePayload.dia_semana;
      if (updatePayload.horario !== undefined) cellsPayload.horario_reuniao = updatePayload.horario;

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
      address: updatedUnit.endereco || '',
      bairro: updatedUnit.bairro || 'Centro',
      fotoUrl: updatedUnit.foto_url || undefined,
      meetingDay: updatedUnit.dia_semana || updatedUnit.dia_reuniao || 'Quinta-feira',
      meetingTime: updatedUnit.horario || updatedUnit.horario_reuniao || '19:30',
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
