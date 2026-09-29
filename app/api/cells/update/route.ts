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
      ativo,
      motherCellId,
      unidade_criadora_id,
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

    // 1. Busca a unidade atual (somente as colunas necessárias)
    const { data: currentUnit, error: unitErr } = await supabase
      .from('unidades')
      .select('id, pai_id, nome, igreja_id, quantidade_membros, unidade_criadora_id')
      .eq('id', cellId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (unitErr || !currentUnit) {
      return NextResponse.json({ error: 'Célula não encontrada.' }, { status: 404 });
    }

    // 2. Validação Otimizada de Permissão em Linha Direta (sem carregar a igreja toda)
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
          // Checa se o usuário é líder direto da célula
          let isAuthorized = member.unidade_id === cellId;

          if (!isAuthorized) {
            const { data: directLeader } = await supabase
              .from('unidade_lideres')
              .select('id')
              .eq('unidade_id', cellId)
              .eq('pessoa_id', userMemberId)
              .eq('ativo', true)
              .maybeSingle();

            if (directLeader) {
              isAuthorized = true;
            }
          }

          // Checa se é líder da unidade criadora (multiplicação)
          if (!isAuthorized && currentUnit.unidade_criadora_id) {
            const { data: creatorLeader } = await supabase
              .from('unidade_lideres')
              .select('id')
              .eq('unidade_id', currentUnit.unidade_criadora_id)
              .eq('pessoa_id', userMemberId)
              .eq('ativo', true)
              .maybeSingle();

            if (creatorLeader || member.unidade_id === currentUnit.unidade_criadora_id) {
              isAuthorized = true;
            }
          }

          // Checa se é líder de algum ancestral direto na hierarquia (ex: Setor pai, Área pai)
          if (!isAuthorized && currentUnit.pai_id) {
            const ancestorIds: string[] = [];
            let currParent = currentUnit.pai_id;

            // Percorre a cadeia de pais para coletar no máximo 5 níveis de ancestrais
            while (currParent && ancestorIds.length < 5) {
              ancestorIds.push(currParent);
              const { data: pUnit } = await supabase
                .from('unidades')
                .select('pai_id')
                .eq('id', currParent)
                .maybeSingle();

              currParent = pUnit?.pai_id || null;
            }

            if (ancestorIds.length > 0) {
              const { data: ancestorLeader } = await supabase
                .from('unidade_lideres')
                .select('id')
                .in('unidade_id', ancestorIds)
                .eq('pessoa_id', userMemberId)
                .eq('ativo', true)
                .limit(1)
                .maybeSingle();

              if (ancestorLeader) {
                isAuthorized = true;
              }
            }
          }

          if (!isAuthorized) {
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
    if (ativo !== undefined) unitUpdatePayload.ativo = Boolean(ativo);
    const resolvedMother = motherCellId || unidade_criadora_id;
    if (resolvedMother !== undefined) {
      unitUpdatePayload.unidade_criadora_id = resolvedMother && resolvedMother.trim() !== '' ? resolvedMother.trim() : null;
    }

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

    // 4. Busca líderes e nome do setor/pai para retorno rápido
    let parentName = 'Setor Geral';
    if (updatedUnit.pai_id) {
      const { data: pData } = await supabase
        .from('unidades')
        .select('nome')
        .eq('id', updatedUnit.pai_id)
        .maybeSingle();
      if (pData?.nome) parentName = pData.nome;
    }

    // Consulta de líderes da unidade em 1 query com join seguro
    let leaderNames: string[] = [];
    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select(`
        pessoa_id,
        membro:membros!unidade_lideres_pessoa_id_fkey (nome)
      `)
      .eq('unidade_id', cellId)
      .eq('ativo', true);

    if (leadersData && leadersData.length > 0) {
      leaderNames = leadersData
        .map((l: any) => {
          const m = Array.isArray(l.membro) ? l.membro[0] : l.membro;
          return m?.nome;
        })
        .filter(Boolean);
    }

    // Fallback se join não retornou nomes
    if (leaderNames.length === 0 && leadersData && leadersData.length > 0) {
      const leaderIds = leadersData.map((l: any) => l.pessoa_id).filter(Boolean);
      if (leaderIds.length > 0) {
        const { data: leaderMembers } = await supabase
          .from('membros')
          .select('nome')
          .in('id', leaderIds);
        leaderNames = (leaderMembers || []).map((m: any) => m.nome).filter(Boolean);
      }
    }

    const formattedLeader =
      leaderNames.length === 1
        ? leaderNames[0]
        : leaderNames.length > 1
        ? leaderNames.join(' & ')
        : 'Sem Líder Definido';

    const cellResult: CellGroup = {
      id: updatedUnit.id,
      churchId: updatedUnit.igreja_id,
      name: updatedUnit.nome,
      leaderName: formattedLeader,
      leaderNames: leaderNames,
      sectorName: parentName,
      parentUnitId: updatedUnit.pai_id,
      parentName: parentName,
      address: updatedUnit.endereco || '',
      bairro: updatedUnit.bairro || 'Centro',
      fotoUrl: updatedUnit.foto_url || undefined,
      meetingDay: updatedUnit.dia_semana || 'Quarta-feira',
      meetingTime: updatedUnit.horario || '19:30',
      memberCount: updatedUnit.quantidade_membros || 0,
      unidade_criadora_id: updatedUnit.unidade_criadora_id || null,
      motherCellId: updatedUnit.unidade_criadora_id || undefined,
    };

    return NextResponse.json({
      success: true,
      cell: cellResult,
      message: 'Célula atualizada com sucesso.',
    });
  } catch (error: any) {
    console.error('Erro na rota /api/cells/update:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao atualizar dados da célula.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cells/update
 * Permite desativar (ativo = false) ou excluir com segurança uma célula de 'public.unidades'.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cellId = searchParams.get('cellId');
    const churchId = searchParams.get('churchId');
    const hardDelete = searchParams.get('hardDelete') === 'true';

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

    // 1. Confirma existência e isolamento da célula em unidades
    const { data: unit, error: checkErr } = await supabase
      .from('unidades')
      .select('id, nome, igreja_id')
      .eq('id', cellId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (checkErr || !unit) {
      return NextResponse.json({ error: 'Célula não encontrada nesta igreja.' }, { status: 404 });
    }

    if (hardDelete) {
      // Desvincula membros antes da exclusão física
      await supabase
        .from('membros')
        .update({ unidade_id: null, observacoes: 'Membro desvinculado por exclusão da célula' })
        .eq('unidade_id', cellId)
        .eq('igreja_id', churchId);

      // Remove líderes associados da célula
      await supabase
        .from('unidade_lideres')
        .delete()
        .eq('unidade_id', cellId);

      // Exclui a unidade
      const { error: delErr } = await supabase
        .from('unidades')
        .delete()
        .eq('id', cellId)
        .eq('igreja_id', churchId);

      if (delErr) {
        console.error('[DeleteCell] Falha ao deletar de unidades:', delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Célula "${unit.nome}" excluída com sucesso.`,
      });
    } else {
      // Soft-delete / Desativação padrão
      const { error: deactErr } = await supabase
        .from('unidades')
        .update({
          ativo: false,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', cellId)
        .eq('igreja_id', churchId);

      if (deactErr) {
        console.error('[DeleteCell] Falha ao desativar unidade:', deactErr);
        return NextResponse.json({ error: deactErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Célula "${unit.nome}" desativada com sucesso.`,
      });
    }
  } catch (error: any) {
    console.error('Erro na rota DELETE /api/cells/update:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao excluir célula.' },
      { status: 500 }
    );
  }
}
