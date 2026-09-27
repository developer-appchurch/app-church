import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export interface MonthlyGrowthStat {
  monthKey: string; // '2026-09'
  monthLabel: string; // 'Set/26'
  year: number;
  month: number; // 1-12
  newMembers: number; // Membros com criado_em neste mês
  totalMembers: number; // Acumulado até este mês
  linkedMembers: number;
  unlinkedMembers: number;
  growthRatePct: number;
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

// Cache de crescimento por igreja (5 minutos)
const growthCache = new Map<string, { data: any; expiry: number }>();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    const nowTime = Date.now();
    const cached = growthCache.get(churchId);
    if (cached && cached.expiry > nowTime) {
      return NextResponse.json(cached.data);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Busca todos os membros da igreja com suas datas de criação (criado_em / created_at) e unidade_id
    let dbMembers: any[] = [];

    // Tenta primeiro na tabela `membros` com `criado_em`
    let { data: membrosData, error: membrosError } = await supabase
      .from('membros')
      .select('id, criado_em, unidade_id')
      .eq('igreja_id', churchId);

    if (membrosError) {
      // Tenta com `created_at`
      const fallbackTry = await supabase
        .from('membros')
        .select('id, created_at, unidade_id')
        .eq('igreja_id', churchId);
      
      if (!fallbackTry.error && fallbackTry.data) {
        dbMembers = fallbackTry.data.map((m: any) => ({
          id: m.id,
          criado_em: m.created_at,
          unidade_id: m.unidade_id,
        }));
      } else {
        // Tenta na tabela legada `members`
        const legTry = await supabase
          .from('members')
          .select('id, criado_em, created_at, unidade_id')
          .eq('igreja_id', churchId);
        
        if (legTry.data) {
          dbMembers = legTry.data.map((m: any) => ({
            id: m.id,
            criado_em: m.criado_em || m.created_at,
            unidade_id: m.unidade_id,
          }));
        }
      }
    } else if (membrosData) {
      dbMembers = membrosData;
    }

    const totalCurrentMembers = dbMembers.length;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Agrupamento por chave 'YYYY-MM'
    const monthCounts: Record<string, { newMembers: number; linked: number; unlinked: number }> = {};

    let earliestDate: Date = now;
    let hasValidDates = false;

    dbMembers.forEach((m) => {
      const rawDate = m.criado_em || m.created_at;
      let dateObj: Date | null = null;

      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          dateObj = parsed;
          hasValidDates = true;
          if (dateObj < earliestDate) {
            earliestDate = dateObj;
          }
        }
      }

      // Se não houver data, assume o mês corrente (ou marco de entrada em lote)
      const targetDate = dateObj || now;
      const key = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      if (!monthCounts[key]) {
        monthCounts[key] = { newMembers: 0, linked: 0, unlinked: 0 };
      }
      monthCounts[key].newMembers += 1;
      if (m.unidade_id) {
        monthCounts[key].linked += 1;
      } else {
        monthCounts[key].unlinked += 1;
      }
    });

    // Determina a lista de meses a exibir (pelo menos os últimos 12 meses, ou desde o mês mais antigo até o atual)
    const startYear = hasValidDates ? Math.min(earliestDate.getFullYear(), currentYear - 1) : currentYear - 1;
    const startMonth = hasValidDates && startYear === earliestDate.getFullYear() ? earliestDate.getMonth() : 0;

    // Gera lista contínua de meses
    const monthsList: { year: number; month: number; key: string; label: string }[] = [];
    
    // Gerar pelo menos os últimos 12 meses
    const totalMonthsSpan = 12;
    for (let i = totalMonthsSpan - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      monthsList.push({
        year: y,
        month: m + 1,
        key,
        label: `${MONTH_NAMES_SHORT[m]}/${String(y).slice(-2)}`,
      });
    }

    // Calcula acumulado progressivo
    let cumulative = 0;
    let cumulativeLinked = 0;
    let cumulativeUnlinked = 0;

    // Soma qualquer membro criado antes do primeiro mês da lista
    const firstListedKey = monthsList[0].key;
    Object.entries(monthCounts).forEach(([key, val]) => {
      if (key < firstListedKey) {
        cumulative += val.newMembers;
        cumulativeLinked += val.linked;
        cumulativeUnlinked += val.unlinked;
      }
    });

    const growthSeries: MonthlyGrowthStat[] = monthsList.map((mObj) => {
      const monthData = monthCounts[mObj.key] || { newMembers: 0, linked: 0, unlinked: 0 };
      const prevTotal = cumulative;
      
      cumulative += monthData.newMembers;
      cumulativeLinked += monthData.linked;
      cumulativeUnlinked += monthData.unlinked;

      const growthRate = prevTotal > 0 ? (monthData.newMembers / prevTotal) * 100 : monthData.newMembers > 0 ? 100 : 0;

      return {
        monthKey: mObj.key,
        monthLabel: mObj.label,
        year: mObj.year,
        month: mObj.month,
        newMembers: monthData.newMembers,
        totalMembers: cumulative,
        linkedMembers: cumulativeLinked,
        unlinkedMembers: cumulativeUnlinked,
        growthRatePct: Number(growthRate.toFixed(1)),
      };
    });

    // Se todos os membros caíram no mesmo mês (ex: setembro/2026), ajustamos para que o acumulado final coincida com o total atual
    if (growthSeries.length > 0 && cumulative === 0 && totalCurrentMembers > 0) {
      const lastIdx = growthSeries.length - 1;
      growthSeries[lastIdx].newMembers = totalCurrentMembers;
      growthSeries[lastIdx].totalMembers = totalCurrentMembers;
    }

    const resultPayload = {
      churchId,
      totalCurrentMembers,
      basedOnColumn: 'criado_em',
      growthSeries,
    };
    growthCache.set(churchId, { data: resultPayload, expiry: Date.now() + 5 * 60 * 1000 });

    return NextResponse.json(resultPayload);
  } catch (error: any) {
    console.error('Erro em GET /api/members/growth:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao calcular curva de crescimento de membros.' },
      { status: 500 }
    );
  }
}
