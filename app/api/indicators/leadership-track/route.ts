import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/indicators/leadership-track
 *
 * Estatísticas agregadas do Trilho de Liderança para a tela "Indicadores
 * Igreja". Escopo flexível:
 *  - Sem unitId: toda a igreja.
 *  - Com unitId: a unidade escolhida (Área, Setor ou Célula) e toda a sua
 *    subárvore.
 *
 * Com compareLevelId, também devolve "compareUnits": as unidades daquele
 * nível (filhas diretas de unitId, ou todas do nível quando unitId é nulo)
 * com sua própria média de conclusão — usado no modo "Comparativo".
 *
 * Todo o cálculo (contagem de membros, conclusões do trilho e resolução da
 * subárvore de unidades) é feito dentro do Postgres via RPC
 * (indicators_trilho_resumo / indicators_trilho_comparativo), em vez de
 * trazer listas de membros/conclusões para somar em JavaScript. Isso evita
 * o limite padrão de 1000 linhas por consulta do PostgREST — que antes
 * travava igrejas com mais de 1000 membros exatamente em 1000 — e mantém a
 * tela rápida independentemente do tamanho da igreja, já que só o
 * resultado agregado (poucas linhas) trafega pela rede.
 *
 * Query: { churchId, unitId?, compareLevelId? }
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const unitId = searchParams.get('unitId') || null;
    const compareLevelId = searchParams.get('compareLevelId') || null;

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // As três consultas abaixo (nome da unidade de escopo, resumo agregado e
    // comparativo) são independentes entre si — nenhuma usa o resultado da
    // outra — mas antes eram feitas em série (await um atrás do outro), o que
    // soma 3 idas e vindas à rede em vez de 1. Rodando em paralelo com
    // Promise.all, o tempo total passa a ser o da consulta mais lenta, não a
    // soma de todas.
    const unitNamePromise = unitId
      ? supabase.from('unidades').select('id, nome').eq('id', unitId).eq('igreja_id', churchId).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const);

    const resumoPromise = supabase.rpc('indicators_trilho_resumo', {
      p_igreja_id: churchId,
      p_unidade_id: unitId,
    });

    const comparativoPromise = compareLevelId
      ? supabase.rpc('indicators_trilho_comparativo', {
          p_igreja_id: churchId,
          p_nivel_id: compareLevelId,
          p_unidade_pai_id: unitId,
        })
      : Promise.resolve({ data: [], error: null } as const);

    const [unitNameRes, resumoRes, comparativoRes] = await Promise.all([
      unitNamePromise,
      resumoPromise,
      comparativoPromise,
    ]);

    if (unitId) {
      if (unitNameRes.error) {
        return NextResponse.json({ error: unitNameRes.error.message }, { status: 500 });
      }
      if (!unitNameRes.data) {
        return NextResponse.json({ error: 'Unidade não encontrada nesta igreja.' }, { status: 404 });
      }
    }
    const scopeUnitName: string | undefined = (unitNameRes.data as any)?.nome;

    const { data: resumo, error: resumoErr } = resumoRes;
    if (resumoErr) {
      return NextResponse.json({ error: resumoErr.message }, { status: 500 });
    }

    const totalMembers: number = resumo?.totalMembers ?? 0;
    const totalSteps: number = resumo?.totalSteps ?? 0;
    const steps: { id: number; stepNumber: number; title: string; completionCount: number; completionPercent: number }[] =
      resumo?.steps ?? [];
    const notStarted: number = resumo?.notStarted ?? 0;
    const inProgress: number = resumo?.inProgress ?? 0;
    const completedCount: number = resumo?.completedCount ?? 0;
    const avgCompletionPercent: number = resumo?.avgCompletionPercent ?? 0;
    const completedPercent = totalMembers > 0 ? Math.round((completedCount / totalMembers) * 1000) / 10 : 0;

    let bestStep: (typeof steps)[number] | null = null;
    let worstStep: (typeof steps)[number] | null = null;
    steps.forEach((s) => {
      if (!bestStep || s.completionPercent > bestStep.completionPercent) bestStep = s;
      if (!worstStep || s.completionPercent < worstStep.completionPercent) worstStep = s;
    });

    // Comparativo (opcional, já buscado em paralelo acima junto com o resumo)
    let compareUnits: { id: string; name: string; totalMembers: number; avgCompletionPercent: number }[] = [];
    if (compareLevelId) {
      const { data: comparativo, error: compErr } = comparativoRes;
      if (compErr) {
        return NextResponse.json({ error: compErr.message }, { status: 500 });
      }
      compareUnits = comparativo || [];
    }

    return NextResponse.json({
      success: true,
      scopeUnit: unitId ? { id: unitId, name: scopeUnitName } : null,
      totalMembers,
      totalSteps,
      avgCompletionPercent,
      completedCount,
      completedPercent,
      steps,
      bestStep,
      worstStep,
      distribution: { notStarted, inProgress, completed: completedCount },
      compareUnits,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/leadership-track:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao calcular indicadores.' }, { status: 500 });
  }
}
