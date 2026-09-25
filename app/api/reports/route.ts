import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Função utilitária para limpar observação e remover qualquer JSON antigo/resíduo de metadados
 */
function cleanObservationText(val: any): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const text = parsed.observacao || parsed.texto_livre || parsed.observacoes_extras || '';
      return typeof text === 'string' ? text.trim() : '';
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Função utilitária para converter valor em moeda para número float
 */
function parseCurrency(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/[^0-9,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Retorna ano e semana ISO de uma data YYYY-MM-DD
 */
function getISOWeekAndYear(dateStr: string): { year: number; week: number } {
  try {
    const date = new Date(dateStr + 'T12:00:00Z');
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  } catch {
    const d = new Date();
    return { year: d.getFullYear(), week: 1 };
  }
}

/**
 * GET /api/reports?cellId=...&churchId=...&mode=recent|older|all&offset=0&limit=10
 * Retorna os relatórios semanais da célula de forma otimizada e paginada
 * - mode=recent: últimos 2 meses (rápido e leve para o carregamento inicial)
 * - mode=older: busca os relatórios anteriores aos últimos 2 meses via paginação (offset/limit)
 * - mode=all: busca todos os relatórios
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cellId = searchParams.get('cellId');
    const churchId = searchParams.get('churchId');
    const mode = searchParams.get('mode') || (searchParams.get('all') === 'true' ? 'all' : 'recent');
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!cellId) {
      return NextResponse.json({ error: 'cellId é obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado' }, { status: 500 });
    }

    // Calcula limite dos últimos 2 meses
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    const minDateStr = twoMonthsAgo.toISOString().split('T')[0];

    let query = supabase
      .from('relatorios_semanais')
      .select('*, lancador:membros!relatorios_semanais_lancado_por_fkey(id, nome)')
      .eq('unidade_id', cellId)
      .order('data_relatorio', { ascending: false })
      .order('criado_em', { ascending: false });

    if (churchId) {
      query = query.eq('igreja_id', churchId);
    }

    if (mode === 'recent') {
      // Carregamento rápido: apenas últimos 2 meses
      query = query.gte('data_relatorio', minDateStr);
    } else if (mode === 'older') {
      // Carregamento paginado de relatórios anteriores
      query = query
        .lt('data_relatorio', minDateStr)
        .range(offset, offset + limit - 1);
    }

    let { data, error } = await query;

    // Se houver erro de relacionamento de chave estrangeira com lancador, faz query simples
    if (error && error.message.includes('relation')) {
      let fallbackQuery = supabase
        .from('relatorios_semanais')
        .select('*')
        .eq('unidade_id', cellId)
        .order('data_relatorio', { ascending: false })
        .order('criado_em', { ascending: false });

      if (churchId) {
        fallbackQuery = fallbackQuery.eq('igreja_id', churchId);
      }
      if (mode === 'recent') {
        fallbackQuery = fallbackQuery.gte('data_relatorio', minDateStr);
      } else if (mode === 'older') {
        fallbackQuery = fallbackQuery
          .lt('data_relatorio', minDateStr)
          .range(offset, offset + limit - 1);
      }

      const res = await fallbackQuery;
      data = res.data;
      error = res.error;
    }

    if (error) {
      console.error('[GET /api/reports] Erro:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reportRows = data || [];
    const reportIds = reportRows.map((r: any) => r.id).filter(Boolean);

    // Contagem de relatórios mais antigos no banco
    let hasOlderReports = false;
    let olderReportsCount = 0;
    if (mode === 'recent' || mode === 'older') {
      try {
        let countQuery = supabase
          .from('relatorios_semanais')
          .select('id', { count: 'exact', head: true })
          .eq('unidade_id', cellId)
          .lt('data_relatorio', minDateStr);

        if (churchId) {
          countQuery = countQuery.eq('igreja_id', churchId);
        }

        const { count } = await countQuery;
        if (count && count > 0) {
          hasOlderReports = true;
          olderReportsCount = count;
        }
      } catch (countErr) {
        console.warn('[GET /api/reports] Erro ao contar relatórios anteriores:', countErr);
      }
    }

    // Busca presenças da tabela relatorio_presencas para esses relatórios
    let presencasByReport: Record<string, string[]> = {};
    if (reportIds.length > 0) {
      // Inicializa cada ID com lista vazia para garantir precisão
      for (const id of reportIds) {
        presencasByReport[id] = [];
      }

      const { data: presRows, error: presError } = await supabase
        .from('relatorio_presencas')
        .select('relatorio_id, membro_id')
        .in('relatorio_id', reportIds);

      if (!presError && presRows) {
        for (const row of presRows) {
          if (row.relatorio_id && row.membro_id) {
            if (!presencasByReport[row.relatorio_id]) {
              presencasByReport[row.relatorio_id] = [];
            }
            presencasByReport[row.relatorio_id].push(row.membro_id);
          }
        }
      }
    }

    // Processa os dados
    const reports = reportRows.map((row: any) => {
      const observacaoTexto = cleanObservationText(row.observacao);
      const presentesIds = presencasByReport[row.id] || [];

      return {
        ...row,
        lancado_por_nome: row.lancador?.nome || 'Líder Responsável',
        observacao: observacaoTexto,
        observacao_texto: observacaoTexto,
        presentes_ids: presentesIds,
      };
    });

    const hasMore = mode === 'older' ? offset + reportRows.length < olderReportsCount : hasOlderReports;
    const nextOffset = offset + reportRows.length;

    return NextResponse.json({
      reports,
      hasOlderReports,
      olderReportsCount,
      hasMore,
      nextOffset,
      mode,
      minDate: minDateStr,
    });
  } catch (err: any) {
    console.error('[GET /api/reports] Exceção:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/reports
 * Cadastra ou atualiza um relatório semanal na tabela relatorios_semanais
 * e sincroniza as presenças dos membros na tabela relatorio_presencas
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      reportId: explicitReportId,
      allowOverwrite = false,
      churchId,
      cellId,
      memberId,
      authorName,
      reportDate,
      membersCount = 0,
      valorPix = '0,00',
      valorEspecie = '0,00',
      convidadosCount = 0,
      childrenCount = 0,
      observacao = '',
      supervisao = false,
      presentMemberIds = [],
    } = body;

    if (!cellId) {
      return NextResponse.json({ error: 'cellId (unidade_id) é obrigatório' }, { status: 400 });
    }
    if (!churchId) {
      return NextResponse.json({ error: 'churchId (igreja_id) é obrigatório' }, { status: 400 });
    }
    if (!reportDate) {
      return NextResponse.json({ error: 'data_relatorio é obrigatória' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado' }, { status: 500 });
    }

    // Identifica ou valida lancado_por (chave estrangeira para membros.id)
    let finalMemberId = memberId;
    if (finalMemberId) {
      const { data: checkMember } = await supabase
        .from('membros')
        .select('id')
        .eq('id', finalMemberId)
        .maybeSingle();

      if (!checkMember) {
        finalMemberId = null;
      }
    }

    if (!finalMemberId) {
      // 1. Tenta pegar um membro da própria célula
      const { data: cellMember } = await supabase
        .from('membros')
        .select('id')
        .eq('unidade_id', cellId)
        .limit(1)
        .maybeSingle();

      if (cellMember?.id) {
        finalMemberId = cellMember.id;
      } else {
        // 2. Tenta pegar qualquer membro da mesma igreja
        const { data: churchMember } = await supabase
          .from('membros')
          .select('id')
          .eq('igreja_id', churchId)
          .limit(1)
          .maybeSingle();
        finalMemberId = churchMember?.id;
      }
    }

    if (!finalMemberId) {
      return NextResponse.json(
        { error: 'Não foi possível identificar o membro responsável pelo lançamento na base de dados.' },
        { status: 400 }
      );
    }

    const parsedPix = parseCurrency(valorPix);
    const parsedEspecie = parseCurrency(valorEspecie);
    const { year: isoYear, week: isoWeek } = getISOWeekAndYear(reportDate);
    const cleanObs = cleanObservationText(observacao);

    // Sanitiza e deduplica os IDs dos membros presentes
    const sanitizedMemberIds: string[] = Array.isArray(presentMemberIds)
      ? Array.from(
          new Set(
            presentMemberIds
              .map((id: any) => (id !== null && id !== undefined ? String(id).trim() : ''))
              .filter(Boolean)
          )
        )
      : [];

    const reportPayload: any = {
      igreja_id: churchId,
      unidade_id: cellId,
      lancado_por: finalMemberId,
      data_relatorio: reportDate,
      houve_reuniao: true,
      qtd_membros: sanitizedMemberIds.length,
      qtd_convidados: Number(convidadosCount) || 0,
      qtd_criancas: Number(childrenCount) || 0,
      valor_pix: parsedPix,
      valor_especie: parsedEspecie,
      observacao: cleanObs,
      supervisao: Boolean(supervisao),
    };

    // 1. Procura se já existe relatório para este ID ou para a mesma semana/ano/data
    let existingReport: any = null;

    if (explicitReportId) {
      const { data: byId } = await supabase
        .from('relatorios_semanais')
        .select('*')
        .eq('id', explicitReportId)
        .maybeSingle();
      existingReport = byId;
    }

    if (!existingReport) {
      const { data: byWeek } = await supabase
        .from('relatorios_semanais')
        .select('*')
        .eq('unidade_id', cellId)
        .eq('ano_iso', isoYear)
        .eq('numero_semana', isoWeek)
        .maybeSingle();
      if (byWeek) {
        existingReport = byWeek;
      }
    }

    if (!existingReport) {
      const { data: byDate } = await supabase
        .from('relatorios_semanais')
        .select('*')
        .eq('unidade_id', cellId)
        .eq('data_relatorio', reportDate)
        .maybeSingle();
      if (byDate) {
        existingReport = byDate;
      }
    }

    // Se já existe um relatório e o usuário AINDA NÃO confirmou a substituição:
    if (existingReport && !allowOverwrite) {
      let lancadorNome = 'Líder Responsável';
      if (existingReport.lancado_por) {
        const { data: lData } = await supabase
          .from('membros')
          .select('nome')
          .eq('id', existingReport.lancado_por)
          .maybeSingle();
        if (lData?.nome) lancadorNome = lData.nome;
      }

      const existingReportData = {
        id: existingReport.id,
        data_relatorio: existingReport.data_relatorio,
        ano_iso: existingReport.ano_iso || isoYear,
        numero_semana: existingReport.numero_semana || isoWeek,
        lancado_por_nome: lancadorNome,
        qtd_membros: existingReport.qtd_membros ?? 0,
        qtd_convidados: existingReport.qtd_convidados ?? 0,
        qtd_criancas: existingReport.qtd_criancas ?? 0,
        valor_pix: existingReport.valor_pix ?? 0,
        valor_especie: existingReport.valor_especie ?? 0,
        supervisao: existingReport.supervisao ?? false,
        observacao: existingReport.observacao || '',
        criado_em: existingReport.criado_em,
      };

      return NextResponse.json({
        duplicate: true,
        message: `Já existe um relatório lançado para esta célula nesta semana (Semana ${existingReportData.numero_semana} / ${existingReportData.ano_iso}).`,
        existingReport: existingReportData,
      });
    }

    let savedReport: any = null;

    if (existingReport && allowOverwrite) {
      // Usuário confirmou a substituição: atualiza o relatório existente
      const { data: updated, error: updateError } = await supabase
        .from('relatorios_semanais')
        .update(reportPayload)
        .eq('id', existingReport.id)
        .select()
        .single();

      if (updateError) {
        console.error('[POST /api/reports] Erro ao atualizar:', updateError);
        return NextResponse.json({ error: `Erro ao atualizar relatório: ${updateError.message}` }, { status: 500 });
      }
      savedReport = updated;
    } else {
      // Inserção de novo relatório
      const { data: inserted, error: insertError } = await supabase
        .from('relatorios_semanais')
        .insert(reportPayload)
        .select()
        .single();

      if (insertError) {
        if (
          insertError.code === '23505' ||
          insertError.message.includes('unique') ||
          insertError.message.includes('duplicate')
        ) {
          // Se disparou restrição única no banco
          const { data: conflictReport } = await supabase
            .from('relatorios_semanais')
            .select('*')
            .eq('unidade_id', cellId)
            .eq('ano_iso', isoYear)
            .eq('numero_semana', isoWeek)
            .maybeSingle();

          if (conflictReport && !allowOverwrite) {
            let conflictLancadorNome = 'Líder Responsável';
            if (conflictReport.lancado_por) {
              const { data: cL } = await supabase
                .from('membros')
                .select('nome')
                .eq('id', conflictReport.lancado_por)
                .maybeSingle();
              if (cL?.nome) conflictLancadorNome = cL.nome;
            }

            return NextResponse.json({
              duplicate: true,
              message: `Já existe um relatório lançado para esta célula nesta semana.`,
              existingReport: {
                ...conflictReport,
                lancado_por_nome: conflictLancadorNome,
              },
            });
          }

          if (conflictReport && allowOverwrite) {
            const { data: updFb, error: updFbErr } = await supabase
              .from('relatorios_semanais')
              .update(reportPayload)
              .eq('id', conflictReport.id)
              .select()
              .single();

            if (updFbErr) {
              return NextResponse.json({ error: updFbErr.message }, { status: 500 });
            }
            savedReport = updFb;
          } else {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
          }
        } else {
          console.error('[POST /api/reports] Erro ao inserir:', insertError);
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      } else {
        savedReport = inserted;
      }
    }

    const targetReportId = savedReport?.id || existingReport?.id || explicitReportId;

    // 2. Expurgar e recriar completamente a lista de presenças em 'relatorio_presencas'
    if (targetReportId) {
      // Passo A: Expurgar todas as presenças anteriores vinculadas a este relatório
      const { error: purgeError } = await supabase
        .from('relatorio_presencas')
        .delete()
        .eq('relatorio_id', targetReportId);

      if (purgeError) {
        console.error(`[POST /api/reports] Erro ao expurgar presenças do relatório ${targetReportId}:`, purgeError);
      }

      // Passo B: Recriar a lista de presenças com os membros atualmente selecionados
      if (sanitizedMemberIds.length > 0) {
        const presencasPayload = sanitizedMemberIds.map((mId: string) => ({
          relatorio_id: targetReportId,
          membro_id: mId,
        }));

        const { error: insertPresError } = await supabase
          .from('relatorio_presencas')
          .insert(presencasPayload);

        if (insertPresError) {
          console.error(`[POST /api/reports] Erro ao recriar relatorio_presencas para ${targetReportId}:`, insertPresError);
        }
      }
    }

    // Busca nome do lançador para retorno
    let authorNameFinal = authorName || 'Líder Responsável';
    if (savedReport?.lancado_por) {
      const { data: lancadorData } = await supabase
        .from('membros')
        .select('nome')
        .eq('id', savedReport.lancado_por)
        .maybeSingle();
      if (lancadorData?.nome) {
        authorNameFinal = lancadorData.nome;
      }
    }

    return NextResponse.json({
      success: true,
      report: {
        ...savedReport,
        id: targetReportId,
        lancado_por_nome: authorNameFinal,
        observacao: cleanObs,
        observacao_texto: cleanObs,
        presentes_ids: sanitizedMemberIds,
        qtd_membros: sanitizedMemberIds.length,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/reports] Exceção:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
