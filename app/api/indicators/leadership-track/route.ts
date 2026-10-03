import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/indicators/leadership-track
 *
 * Estatísticas agregadas do Trilho de Liderança para a tela "Indicadores
 * Igreja". Escopo flexível:
 *  - Sem unitId: toda a igreja.
 *  - Com unitId: a unidade escolhida (Área, Setor ou Célula) e toda a sua
 *    subárvore — resolvida percorrendo pai_id em memória, já que uma
 *    igreja raramente tem mais que algumas centenas de unidades.
 *
 * Com compareLevelId, também devolve "compareUnits": as unidades daquele
 * nível (filhas diretas de unitId, ou todas do nível quando unitId é nulo)
 * com sua própria média de conclusão — usado no modo "Comparativo".
 *
 * Body/Query: { churchId, unitId?, compareLevelId? }
 */

function collectSubtreeIds(rootId: string, childrenMap: Map<string, string[]>): Set<string> {
  const result = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

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

    // 1. Unidades da igreja — usadas para resolver a subárvore do escopo e os
    // grupos de comparação (nunca retornadas por inteiro na resposta).
    const { data: unitsRows, error: unitsErr } = await supabase
      .from('unidades')
      .select('id, nome, pai_id, nivel_tipo_id')
      .eq('igreja_id', churchId);

    if (unitsErr) {
      return NextResponse.json({ error: unitsErr.message }, { status: 500 });
    }

    const units = unitsRows || [];
    const unitById = new Map<string, any>();
    const childrenMap = new Map<string, string[]>();
    units.forEach((u: any) => {
      unitById.set(u.id, u);
      if (u.pai_id) {
        const list = childrenMap.get(u.pai_id) || [];
        list.push(u.id);
        childrenMap.set(u.pai_id, list);
      }
    });

    if (unitId && !unitById.has(unitId)) {
      return NextResponse.json({ error: 'Unidade não encontrada nesta igreja.' }, { status: 404 });
    }

    // 2. Etapas do trilho (próprias da igreja; senão o padrão global)
    const { data: ownSteps } = await supabase
      .from('etapas_trilha')
      .select('id, numero_etapa, titulo')
      .eq('igreja_id', churchId)
      .order('numero_etapa', { ascending: true });

    let steps = ownSteps || [];
    if (steps.length === 0) {
      const { data: globalSteps } = await supabase
        .from('etapas_trilha')
        .select('id, numero_etapa, titulo')
        .is('igreja_id', null)
        .order('numero_etapa', { ascending: true });
      steps = globalSteps || [];
    }
    const stepIds = steps.map((s: any) => s.id);
    const totalSteps = steps.length;

    // 3. Membros no escopo (toda a igreja, ou a subárvore da unidade escolhida)
    let membersQuery = supabase.from('membros').select('id, unidade_id').eq('igreja_id', churchId);
    if (unitId) {
      const subtreeIds = Array.from(collectSubtreeIds(unitId, childrenMap));
      membersQuery = membersQuery.in('unidade_id', subtreeIds);
    }
    const { data: memberRows, error: membersErr } = await membersQuery;
    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }
    const members = memberRows || [];
    const memberIdSet = new Set(members.map((m: any) => m.id));
    const totalMembers = members.length;

    // 4. Conclusões (concluida = true) das etapas desta igreja, filtradas aos
    // membros do escopo em memória — evita um IN gigante de membro_id no SQL.
    let completionRows: { etapa_id: number; membro_id: string }[] = [];
    if (stepIds.length > 0) {
      const { data: compRows, error: compErr } = await supabase
        .from('membro_etapas_trilha')
        .select('etapa_id, membro_id')
        .in('etapa_id', stepIds)
        .eq('concluida', true);

      if (compErr) {
        return NextResponse.json({ error: compErr.message }, { status: 500 });
      }
      completionRows = (compRows || []).filter((r: any) => memberIdSet.has(r.membro_id));
    }

    const completionCountByStep = new Map<number, number>();
    const completedStepsByMember = new Map<string, number>();
    completionRows.forEach((r) => {
      completionCountByStep.set(r.etapa_id, (completionCountByStep.get(r.etapa_id) || 0) + 1);
      completedStepsByMember.set(r.membro_id, (completedStepsByMember.get(r.membro_id) || 0) + 1);
    });

    // 5. Estatísticas por etapa
    const stepsStats = steps.map((s: any) => {
      const completionCount = completionCountByStep.get(s.id) || 0;
      const completionPercent = totalMembers > 0 ? (completionCount / totalMembers) * 100 : 0;
      return {
        id: s.id,
        stepNumber: s.numero_etapa,
        title: s.titulo,
        completionCount,
        completionPercent: Math.round(completionPercent * 10) / 10,
      };
    });

    let bestStep: (typeof stepsStats)[number] | null = null;
    let worstStep: (typeof stepsStats)[number] | null = null;
    stepsStats.forEach((s) => {
      if (!bestStep || s.completionPercent > bestStep.completionPercent) bestStep = s;
      if (!worstStep || s.completionPercent < worstStep.completionPercent) worstStep = s;
    });

    // 6. Média geral, destaque de 100% e distribuição (não iniciado / em
    // andamento / completo)
    let sumPercent = 0;
    let completedCount = 0;
    let notStarted = 0;
    let inProgress = 0;
    members.forEach((m: any) => {
      const completed = completedStepsByMember.get(m.id) || 0;
      const percent = totalSteps > 0 ? (completed / totalSteps) * 100 : 0;
      sumPercent += percent;
      if (completed === 0) notStarted++;
      else if (totalSteps > 0 && completed >= totalSteps) completedCount++;
      else inProgress++;
    });
    const avgCompletionPercent = totalMembers > 0 ? Math.round((sumPercent / totalMembers) * 10) / 10 : 0;
    const completedPercent = totalMembers > 0 ? Math.round((completedCount / totalMembers) * 1000) / 10 : 0;

    // 7. Grupos de comparação (opcional) — reaproveita "members" e
    // "completedStepsByMember" já calculados, sem novas consultas ao banco.
    let compareUnits: {
      id: string;
      name: string;
      totalMembers: number;
      avgCompletionPercent: number;
    }[] = [];

    if (compareLevelId) {
      const candidateUnits = units.filter(
        (u: any) => u.nivel_tipo_id === compareLevelId && (!unitId || u.pai_id === unitId)
      );

      compareUnits = candidateUnits
        .map((u: any) => {
          const subtree = collectSubtreeIds(u.id, childrenMap);
          const unitMembers = members.filter((m: any) => m.unidade_id && subtree.has(m.unidade_id));
          let unitSum = 0;
          unitMembers.forEach((m: any) => {
            const completed = completedStepsByMember.get(m.id) || 0;
            unitSum += totalSteps > 0 ? (completed / totalSteps) * 100 : 0;
          });
          const unitAvg = unitMembers.length > 0 ? Math.round((unitSum / unitMembers.length) * 10) / 10 : 0;
          return {
            id: u.id,
            name: u.nome,
            totalMembers: unitMembers.length,
            avgCompletionPercent: unitAvg,
          };
        })
        .sort((a, b) => b.avgCompletionPercent - a.avgCompletionPercent);
    }

    return NextResponse.json({
      success: true,
      scopeUnit: unitId ? { id: unitId, name: unitById.get(unitId)?.nome } : null,
      totalMembers,
      totalSteps,
      avgCompletionPercent,
      completedCount,
      completedPercent,
      steps: stepsStats,
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
