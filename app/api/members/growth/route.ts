import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export interface MonthlyGrowthStat {
  monthKey: string; // '2026-09'
  monthLabel: string; // 'Set/26'
  year: number;
  month: number; // 1-12
  newMembers: number; // Novos no mês
  totalMembers: number; // Acumulado até este mês
  linkedMembers: number;
  unlinkedMembers: number;
  growthRatePct: number;
}

export interface BatchImportInfo {
  monthKey: string;
  monthLabel: string;
  year: number;
  month: number;
  count: number;
  percentage: number;
  explanation: string;
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

// Cache em memória de 5 minutos por igreja
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

    // Mapa de mês 'YYYY-MM' -> contagens agregadas
    const monthCounts: Record<string, { newMembers: number; linked: number; unlinked: number }> = {};
    let isRpcUsed = false;

    // 1. Tenta executar a agregação direta no Postgres via RPC get_monthly_member_growth
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_monthly_member_growth', { p_church_id: churchId });

    if (!rpcError && Array.isArray(rpcData)) {
      isRpcUsed = true;
      rpcData.forEach((row: any) => {
        if (row.mes) {
          const d = new Date(row.mes);
          if (!isNaN(d.getTime())) {
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth() + 1;
            const key = `${y}-${String(m).padStart(2, '0')}`;
            monthCounts[key] = {
              newMembers: Number(row.novos || 0),
              linked: Number(row.vinculados || 0),
              unlinked: Number(row.sem_vinculo || 0),
            };
          }
        }
      });
    } else {
      if (rpcError) {
        console.warn('[Growth Route] RPC get_monthly_member_growth não disponível, acionando fallback:', rpcError.message);
      }

      // Fallback otimizado com query agregada / select mínimo
      let { data: fallbackMembers, error: fbErr } = await supabase
        .from('membros')
        .select('criado_em, unidade_id')
        .eq('igreja_id', churchId);

      if (fbErr || !fallbackMembers) {
        const { data: legMembers } = await supabase
          .from('members')
          .select('criado_em, created_at, unidade_id')
          .eq('igreja_id', churchId);
        fallbackMembers = legMembers || [];
      }

      (fallbackMembers || []).forEach((m: any) => {
        const rawDate = m.criado_em || m.created_at;
        const d = rawDate ? new Date(rawDate) : new Date();
        const y = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
        const mon = isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
        const key = `${y}-${String(mon).padStart(2, '0')}`;

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
    }

    // Calcula total de membros a partir dos dados agregados
    let totalCurrentMembers = 0;
    Object.values(monthCounts).forEach((val) => {
      totalCurrentMembers += val.newMembers;
    });

    // 2. Detecção de Importação em Lote:
    // Se um único mês concentrar mais de 70% dos membros totais (ex: migração em massa)
    let isBatchImportDetected = false;
    let batchImportInfo: BatchImportInfo | undefined = undefined;

    if (totalCurrentMembers > 0) {
      for (const [key, val] of Object.entries(monthCounts)) {
        const ratio = val.newMembers / totalCurrentMembers;
        if (ratio >= 0.70 && val.newMembers >= 10) {
          const [yStr, mStr] = key.split('-');
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          const monthLabel = `${MONTH_NAMES_SHORT[m - 1]}/${String(y).slice(-2)}`;
          const fullLabel = `${MONTH_NAMES_SHORT[m - 1]}/${y}`;
          const pct = Number((ratio * 100).toFixed(1));

          isBatchImportDetected = true;
          batchImportInfo = {
            monthKey: key,
            monthLabel,
            year: y,
            month: m,
            count: val.newMembers,
            percentage: pct,
            explanation: `Importação em lote detectada em ${fullLabel} (${pct}% da base de membros) — histórico anterior indisponível.`,
          };
          break;
        }
      }
    }

    // Determina o primeiro mês real com dados
    const sortedMonthKeys = Object.keys(monthCounts).sort();
    const firstRealDataMonth = sortedMonthKeys.length > 0 ? sortedMonthKeys[0] : undefined;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Gera lista contínua dos últimos 12 meses até o mês atual
    const totalMonthsSpan = 12;
    const monthsList: { year: number; month: number; key: string; label: string }[] = [];
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

    // Soma membros de meses anteriores ao primeiro mês da janela de 12 meses
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

    // Se todos caíram no último mês e cumulative estava zerada
    if (growthSeries.length > 0 && cumulative === 0 && totalCurrentMembers > 0) {
      const lastIdx = growthSeries.length - 1;
      growthSeries[lastIdx].newMembers = totalCurrentMembers;
      growthSeries[lastIdx].totalMembers = totalCurrentMembers;
    }

    const resultPayload = {
      churchId,
      totalCurrentMembers,
      isBatchImportDetected,
      batchImportInfo,
      firstRealDataMonth,
      source: isRpcUsed ? 'postgres_rpc' : 'fallback_query',
      growthSeries,
    };

    // Atualiza cache em memória de 5 minutos
    growthCache.set(churchId, { data: resultPayload, expiry: Date.now() + 5 * 60 * 1000 });

    return NextResponse.json(resultPayload);
  } catch (err: any) {
    console.error('[Growth API Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao obter crescimento de membros.' },
      { status: 500 }
    );
  }
}
