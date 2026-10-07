import { NextRequest, NextResponse } from 'next/server';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission, requireLevel, unitInChurch } from '@/lib/requireSession';
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

// Cache em memória no servidor para respostas de relatórios (TTL 60s)
const serverReportsCache = new Map<string, { data: any; expiry: number }>();

function invalidateServerReportsCache(cellId?: string) {
  if (!cellId) {
    serverReportsCache.clear();
    return;
  }
  for (const k of Array.from(serverReportsCache.keys())) {
    if (k.startsWith(`reports:${cellId}:`)) {
      serverReportsCache.delete(k);
    }
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
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const cellId = searchParams.get('cellId');
    const churchId = resolveChurchId(auth.actor, searchParams.get('churchId'));
    if (searchParams.get('churchId') && !churchId) return forbiddenChurch();
    const mode = searchParams.get('mode') || (searchParams.get('all') === 'true' ? 'all' : 'recent');
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));

    if (!cellId) {
      return NextResponse.json({ error: 'cellId é obrigatório' }, { status: 400 });
    }
    const unitDenied = await unitInChurch(auth.actor, cellId);
    if (unitDenied) return unitDenied;

    // 1. Verifica cache em memória no servidor
    const cacheKey = `reports:${cellId}:${churchId || 'all'}:${mode}:${offset}:${limit}`;
    const nowTime = Date.now();
    const cached = serverReportsCache.get(cacheKey);
    if (cached && cached.expiry > nowTime) {
      return NextResponse.json(cached.data);
    }

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado' }, { status: 500 });
    }

    // Calcula limite dos últimos 2 meses
    const now = new Date();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    const minDateStr = twoMonthsAgo.toISOString().split('T')[0];

    // Query otimizada com embedding direto (1 única ida ao PostgreSQL)
    const EMBEDDED_SELECT =
      '*, lancador:membros!relatorios_semanais_lancado_por_fkey(id, nome), presencas:relatorio_presencas(membro_id, membro:membros(id, nome))';

    let query = supabase
      .from('relatorios_semanais')
      .select(EMBEDDED_SELECT)
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

    // Prepara query de contagem de relatórios mais antigos
    let countPromise: Promise<any> = Promise.resolve({ count: 0, error: null });
    if (mode === 'recent' || mode === 'older') {
      let countQuery = supabase
        .from('relatorios_semanais')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', cellId)
        .lt('data_relatorio', minDateStr);

      if (churchId) {
        countQuery = countQuery.eq('igreja_id', churchId);
      }
      countPromise = countQuery as any;
    }

    // Executa em PARALELO a busca principal e a contagem
    let [reportsResult, countResult] = await Promise.all([query, countPromise]);

    // Fallback de resiliência: se embedding de FK não estiver disponível, tenta query padrão
    let usesEmbedding = true;
    if (reportsResult.error) {
      console.warn('[GET /api/reports] Embedding não disponível, executando fallback padrão:', reportsResult.error.message);
      usesEmbedding = false;

      let fallbackQuery = supabase
        .from('relatorios_semanais')
        .select('*')
        .eq('unidade_id', cellId)
        .order('data_relatorio', { ascending: false })
        .order('criado_em', { ascending: false });

      if (churchId) fallbackQuery = fallbackQuery.eq('igreja_id', churchId);
      if (mode === 'recent') {
        fallbackQuery = fallbackQuery.gte('data_relatorio', minDateStr);
      } else if (mode === 'older') {
        fallbackQuery = fallbackQuery.lt('data_relatorio', minDateStr).range(offset, offset + limit - 1);
      }

      reportsResult = await fallbackQuery;
      if (reportsResult.error) {
        console.error('[GET /api/reports] Erro:', reportsResult.error);
        return NextResponse.json({ error: reportsResult.error.message }, { status: 500 });
      }
    }

    const reportRows = reportsResult.data || [];
    const reportIds = reportRows.map((r: any) => r.id).filter(Boolean);

    // Contagem de relatórios mais antigos no banco
    let hasOlderReports = false;
    let olderReportsCount = 0;
    if (countResult && typeof countResult.count === 'number' && countResult.count > 0) {
      hasOlderReports = true;
      olderReportsCount = countResult.count;
    }

    let lancadorMap = new Map<string, string>();
    let presencasByReport: Record<string, string[]> = {};
    let memberNamesMap = new Map<string, string>();

    if (!usesEmbedding) {
      // Modo Fallback com consultas adicionais em paralelo
      const lancadorIds = Array.from(new Set(reportRows.map((r: any) => r.lancado_por).filter(Boolean)));

      const [lancadoresResult, presencasResult] = await Promise.all([
        lancadorIds.length > 0
          ? supabase.from('membros').select('id, nome').in('id', lancadorIds)
          : Promise.resolve({ data: [] }),
        reportIds.length > 0
          ? supabase.from('relatorio_presencas').select('relatorio_id, membro_id, membro:membros(id, nome)').in('relatorio_id', reportIds)
          : Promise.resolve({ data: [] }),
      ]);

      (lancadoresResult.data || []).forEach((l: any) => lancadorMap.set(l.id, l.nome));

      for (const id of reportIds) {
        presencasByReport[id] = [];
      }

      if (presencasResult.data) {
        for (const row of presencasResult.data) {
          if (row.relatorio_id && row.membro_id) {
            if (!presencasByReport[row.relatorio_id]) {
              presencasByReport[row.relatorio_id] = [];
            }
            presencasByReport[row.relatorio_id].push(row.membro_id);
            const membroObj: any = Array.isArray((row as any).membro) ? (row as any).membro[0] : (row as any).membro;
            if (membroObj?.nome) {
              memberNamesMap.set(row.membro_id, membroObj.nome);
            }
          }
        }
      }
    } else {
      for (const row of reportRows) {
        if (Array.isArray(row.presencas)) {
          for (const p of row.presencas) {
            const membroObj: any = Array.isArray((p as any).membro) ? (p as any).membro[0] : (p as any).membro;
            if (p.membro_id && membroObj?.nome) {
              memberNamesMap.set(p.membro_id, membroObj.nome);
            }
          }
        }
      }
    }

    // Processa os dados
    const reports = reportRows.map((row: any) => {
      const observacaoTexto = cleanObservationText(row.observacao);
      let presentesIds: string[] = [];
      let lancadorNome = 'Líder Responsável';

      if (usesEmbedding) {
        lancadorNome = row.lancador?.nome || 'Líder Responsável';
        presentesIds = Array.isArray(row.presencas)
          ? row.presencas.map((p: any) => p.membro_id).filter(Boolean)
          : [];
      } else {
        lancadorNome = lancadorMap.get(row.lancado_por) || row.lancador?.nome || 'Líder Responsável';
        presentesIds = presencasByReport[row.id] || [];
      }

      const presentesNomes: Record<string, string> = {};
      const presentesMembros: { id: string; nome: string }[] = [];

      for (const mId of presentesIds) {
        const name = memberNamesMap.get(mId) || '';
        if (name) {
          presentesNomes[mId] = name;
        }
        presentesMembros.push({ id: mId, nome: name || 'Membro' });
      }

      return {
        ...row,
        lancado_por_nome: lancadorNome,
        observacao: observacaoTexto,
        observacao_texto: observacaoTexto,
        presentes_ids: presentesIds,
        presentes_nomes: presentesNomes,
        presentes_membros: presentesMembros,
      };
    });

    // Busca nomes faltantes em lote se houver IDs sem nome resolvido
    const allPresentIds = Array.from(new Set(reports.flatMap((r: any) => r.presentes_ids)));
    const missingIds = allPresentIds.filter((id) => !memberNamesMap.has(id));
    if (missingIds.length > 0) {
      try {
        const { data: missingMems } = await supabase
          .from('membros')
          .select('id, nome')
          .in('id', missingIds);

        if (missingMems && missingMems.length > 0) {
          const mapExtra = new Map<string, string>();
          missingMems.forEach((m: any) => mapExtra.set(m.id, m.nome));

          reports.forEach((r: any) => {
            r.presentes_ids.forEach((id: string, idx: number) => {
              if (mapExtra.has(id)) {
                const name = mapExtra.get(id)!;
                r.presentes_nomes[id] = name;
                if (r.presentes_membros[idx]) {
                  r.presentes_membros[idx].nome = name;
                }
              }
            });
          });
        }
      } catch (err) {
        console.warn('Aviso ao resolver nomes extras de membros presentes:', err);
      }
    }

    const hasMore = mode === 'older' ? offset + reportRows.length < olderReportsCount : hasOlderReports;
    const nextOffset = offset + reportRows.length;

    const responsePayload = {
      reports,
      hasOlderReports,
      olderReportsCount,
      hasMore,
      nextOffset,
      mode,
      minDate: minDateStr,
    };

    // Grava no cache por 60 segundos
    serverReportsCache.set(cacheKey, {
      data: responsePayload,
      expiry: nowTime + 60_000,
    });

    return NextResponse.json(responsePayload, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
      },
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
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const {
      reportId: explicitReportId,
      allowOverwrite = false,
      churchId: requestedChurchId,
      cellId,
      memberId: requestedMemberId,
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

    // A igreja e o autor do lançamento vêm da sessão, nunca do corpo da requisição
    const churchId = resolveChurchId(auth.actor, requestedChurchId);
    if (requestedChurchId && !churchId) return forbiddenChurch();
    const memberId = auth.actor.memberId || requestedMemberId;
    if (cellId) {
      const unitDenied = await unitInChurch(auth.actor, cellId);
      if (unitDenied) return unitDenied;
    }
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
      // Coleta todos os IDs associados a este relatório (ID explícito, existente e salvo) para evitar qualquer resíduo órfão
      const idsToPurge = Array.from(
        new Set([targetReportId, explicitReportId, existingReport?.id].filter(Boolean))
      );

      // Passo A: Expurgar todas as presenças anteriores vinculadas a todos esses IDs
      for (const rId of idsToPurge) {
        const { error: purgeError } = await supabase
          .from('relatorio_presencas')
          .delete()
          .eq('relatorio_id', rId);

        if (purgeError) {
          console.error(`[POST /api/reports] Erro ao expurgar presenças do relatório ${rId}:`, purgeError);
        }
      }

      // Passo B: Recriar a lista de presenças com os membros atualmente selecionados
      if (sanitizedMemberIds.length > 0) {
        // Tenta primeiro inserir com unidade_id caso a coluna tenha sido adicionada ao banco
        const presencasPayloadWithUnidade = sanitizedMemberIds.map((mId: string) => ({
          relatorio_id: targetReportId,
          membro_id: mId,
          unidade_id: cellId,
        }));

        let { error: insertPresError } = await supabase
          .from('relatorio_presencas')
          .insert(presencasPayloadWithUnidade);

        // Se o banco indicar que a coluna unidade_id não existe, tenta sem ela
        if (insertPresError && insertPresError.message?.includes('unidade_id') && insertPresError.message?.includes('column')) {
          const presencasPayloadStandard = sanitizedMemberIds.map((mId: string) => ({
            relatorio_id: targetReportId,
            membro_id: mId,
          }));

          const resRetry = await supabase
            .from('relatorio_presencas')
            .insert(presencasPayloadStandard);
          insertPresError = resRetry.error;
        }

        if (insertPresError) {
          console.error(`[POST /api/reports] Aviso ao persistir presenças em relatorio_presencas (${targetReportId}):`, insertPresError.message);
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

    // Invalida o cache de relatórios da célula para sincronização imediata
    invalidateServerReportsCache(cellId);

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

/**
 * DELETE /api/reports
 * Exclui um relatório semanal e suas presenças caso ainda não tenha sido validado pela tesouraria
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    let reportId = searchParams.get('id') || searchParams.get('reportId');
    let cellId = searchParams.get('cellId');

    if (!reportId) {
      try {
        const body = await req.json();
        reportId = body.id || body.reportId;
        cellId = body.cellId || cellId;
      } catch {
        // Sem body JSON
      }
    }

    if (!reportId) {
      return NextResponse.json({ error: 'ID do relatório é obrigatório' }, { status: 400 });
    }

    // Busca o relatório para checar tesouraria_recebido e obter unidade_id
    const { data: existingReport, error: fetchError } = await supabase
      .from('relatorios_semanais')
      .select('id, unidade_id, tesouraria_recebido')
      .eq('id', reportId)
      .maybeSingle();

    if (fetchError) {
      console.error('[DELETE /api/reports] Erro ao buscar relatório:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existingReport) {
      return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }
    const reportUnitDenied = await unitInChurch(auth.actor, existingReport.unidade_id);
    if (reportUnitDenied) return reportUnitDenied;

    if (existingReport.tesouraria_recebido) {
      return NextResponse.json(
        { error: 'Este relatório já foi validado pela tesouraria e não pode ser excluído.' },
        { status: 400 }
      );
    }

    const targetCellId = cellId || existingReport.unidade_id;

    // 1. Remove presenças associadas
    const { error: deletePresError } = await supabase
      .from('relatorio_presencas')
      .delete()
      .eq('relatorio_id', reportId);

    if (deletePresError) {
      console.warn('[DELETE /api/reports] Aviso ao remover presenças:', deletePresError.message);
    }

    // 2. Remove o relatório
    const { error: deleteReportError } = await supabase
      .from('relatorios_semanais')
      .delete()
      .eq('id', reportId);

    if (deleteReportError) {
      console.error('[DELETE /api/reports] Erro ao remover relatório:', deleteReportError);
      return NextResponse.json({ error: deleteReportError.message }, { status: 500 });
    }

    // Invalida o cache
    invalidateServerReportsCache(targetCellId);

    return NextResponse.json({
      success: true,
      message: 'Relatório excluído com sucesso.',
      reportId,
    });
  } catch (err: any) {
    console.error('[DELETE /api/reports] Exceção:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
