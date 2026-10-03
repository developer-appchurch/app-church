'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from 'recharts';
import {
  TrendingUp,
  Users,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Target,
  Award,
  Database,
  RefreshCw,
  AlertTriangle,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { OrganizationalUnit, CellMember } from '../types';

export interface ChurchMemberGrowthChartProps {
  churchId?: string;
  totalMembers: number;
  linkedCount: number;
  unlinkedCount: number;
  units?: OrganizationalUnit[];
  members?: (CellMember & { isUnlinked?: boolean; cellName?: string; created_at?: string; createdAt?: string; criado_em?: string })[];
  churchName?: string;
}

type PeriodFilter = '6m' | '12m' | 'ytd';
type ViewMode = 'combined' | 'cumulative' | 'monthly_new';

interface MonthlyGrowthPoint {
  monthKey: string;
  monthLabel: string;
  year: number;
  month: number;
  totalMembers: number;
  newMembers: number;
  linkedMembers: number;
  unlinkedMembers: number;
  growthRatePct: number;
}

interface BatchImportInfo {
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

export const ChurchMemberGrowthChart: React.FC<ChurchMemberGrowthChartProps> = ({
  churchId,
  totalMembers,
  linkedCount,
  unlinkedCount,
  units = [],
  members = [],
  churchName,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('12m');
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [apiSeries, setApiSeries] = useState<MonthlyGrowthPoint[] | null>(null);
  const [isBatchImportDetected, setIsBatchImportDetected] = useState<boolean>(false);
  const [batchImportInfo, setBatchImportInfo] = useState<BatchImportInfo | null>(null);
  const [firstRealDataMonth, setFirstRealDataMonth] = useState<string | null>(null);
  const [hidePreMigrationMonths, setHidePreMigrationMonths] = useState<boolean>(true);
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [isRpcUsed, setIsRpcUsed] = useState<boolean>(true);

  useEffect(() => {
    queueMicrotask(() => {
      setIsMounted(true);
    });
  }, []);

  // Busca dados agregados reais direto da rota /api/members/growth (Postgres RPC)
  useEffect(() => {
    if (!churchId) return;

    let isSubscribed = true;
    const fetchGrowth = async () => {
      try {
        setIsLoadingApi(true);
        const res = await fetch(`/api/members/growth?churchId=${encodeURIComponent(churchId)}`);
        if (!res.ok) throw new Error('Falha ao carregar curva de crescimento');
        const json = await res.json().catch(() => ({}));
        if (isSubscribed) {
          if (json.growthSeries && Array.isArray(json.growthSeries)) {
            setApiSeries(json.growthSeries);
          }
          setIsBatchImportDetected(Boolean(json.isBatchImportDetected));
          if (json.batchImportInfo) {
            setBatchImportInfo(json.batchImportInfo);
          }
          if (json.firstRealDataMonth) {
            setFirstRealDataMonth(json.firstRealDataMonth);
          }
          setIsRpcUsed(json.source === 'postgres_rpc');
        }
      } catch (err) {
        console.warn('Usando processamento local para curva de crescimento:', err);
      } finally {
        if (isSubscribed) {
          setIsLoadingApi(false);
        }
      }
    };

    fetchGrowth();

    return () => {
      isSubscribed = false;
    };
  }, [churchId]);

  // Construção do histórico mensal com base na agregação vinda da API
  const rawGrowthData = useMemo<MonthlyGrowthPoint[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 a 11

    const numMonths = period === '6m' ? 6 : period === '12m' ? 12 : currentMonth + 1;

    // Se temos dados vindos diretamente da API agregados pelo Postgres
    if (apiSeries && apiSeries.length > 0) {
      if (period === 'ytd') {
        return apiSeries.filter((p) => p.year === currentYear);
      }
      return apiSeries.slice(-numMonths);
    }

    // Fallback: cálculo baseado nos membros passados por props caso a rota falhe
    const rawMonths: { month: number; year: number; label: string; key: string }[] = [];
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      rawMonths.push({
        month: m,
        year: y,
        label: `${MONTH_NAMES_SHORT[m]}/${String(y).slice(-2)}`,
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
      });
    }

    const memberCreationDates: Date[] = [];
    members.forEach((m) => {
      const dateStr = m.criado_em || (m as any).created_at || (m as any).createdAt;
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          memberCreationDates.push(parsed);
        }
      }
    });

    const safeTotal = Math.max(0, totalMembers);
    const safeLinked = Math.max(0, linkedCount);
    const linkedRatio = safeTotal > 0 ? safeLinked / safeTotal : 0.85;

    let runningTotal = 0;

    return rawMonths.map((mObj, idx) => {
      let monthNew = 0;

      if (memberCreationDates.length > 0) {
        monthNew = memberCreationDates.filter(
          (d) => d.getFullYear() === mObj.year && d.getMonth() === mObj.month
        ).length;
      } else {
        if (idx === rawMonths.length - 1) {
          monthNew = safeTotal;
        } else {
          monthNew = 0;
        }
      }

      const prevTotal = runningTotal;
      runningTotal = idx === rawMonths.length - 1 ? safeTotal : runningTotal + monthNew;
      const actualNew = Math.max(0, runningTotal - prevTotal);
      const growthRate = prevTotal > 0 ? (actualNew / prevTotal) * 100 : actualNew > 0 ? 100 : 0;
      const currentLinked = Math.round(runningTotal * linkedRatio);
      const currentUnlinked = Math.max(0, runningTotal - currentLinked);

      return {
        monthKey: mObj.key,
        monthLabel: mObj.label,
        year: mObj.year,
        month: mObj.month + 1,
        totalMembers: runningTotal,
        newMembers: actualNew,
        linkedMembers: currentLinked,
        unlinkedMembers: currentUnlinked,
        growthRatePct: Number(growthRate.toFixed(1)),
      };
    });
  }, [apiSeries, period, totalMembers, linkedCount, members]);

  // Se a importação em lote foi detectada e o usuário optou por ocultar meses anteriores vazios
  const growthData = useMemo<MonthlyGrowthPoint[]>(() => {
    if (!hidePreMigrationMonths || !isBatchImportDetected || !firstRealDataMonth) {
      return rawGrowthData;
    }

    const filtered = rawGrowthData.filter((p) => p.monthKey >= firstRealDataMonth);
    // Garante pelo menos o ponto do mês de importação
    return filtered.length > 0 ? filtered : rawGrowthData;
  }, [rawGrowthData, hidePreMigrationMonths, isBatchImportDetected, firstRealDataMonth]);

  // Indicadores calculados no período selecionado
  const stats = useMemo(() => {
    if (growthData.length === 0) {
      return {
        totalNetGrowth: 0,
        growthPercent: '0',
        avgNewPerMonth: '0',
        bestMonth: null,
      };
    }

    const firstPoint = growthData[0];
    const lastPoint = growthData[growthData.length - 1];
    const netGrowth = Math.max(0, lastPoint.totalMembers - firstPoint.totalMembers);
    const growthPercent =
      firstPoint.totalMembers > 0
        ? ((netGrowth / firstPoint.totalMembers) * 100).toFixed(1)
        : lastPoint.totalMembers > 0
        ? '100'
        : '0';

    const totalNew = growthData.reduce((acc, p) => acc + p.newMembers, 0);
    const avgNew = (totalNew / growthData.length).toFixed(1);

    const best = [...growthData].sort((a, b) => b.newMembers - a.newMembers)[0];

    return {
      totalNetGrowth: netGrowth,
      growthPercent,
      avgNewPerMonth: avgNew,
      bestMonth: best,
    };
  }, [growthData]);

  // Tooltip customizado
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: MonthlyGrowthPoint = payload[0].payload;
      return (
        <div className="bg-[#04213d] text-white p-3.5 rounded-2xl shadow-xl border border-slate-700/80 text-xs min-w-[210px] animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2 mb-2">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <Calendar size={13} />
              {data.monthLabel}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              +{data.growthRatePct}%
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                Total Acumulado:
              </span>
              <strong className="text-white text-sm font-black">{data.totalMembers}</strong>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                Novos no Mês:
              </span>
              <strong className="text-emerald-300 font-bold">+{data.newMembers}</strong>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800 text-slate-400">
              <span>Em Células:</span>
              <span className="text-slate-200 font-semibold">{data.linkedMembers}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs space-y-4">
      {/* Header do Card de Crescimento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#04213d] text-sky-400 flex items-center justify-center shrink-0 shadow-2xs">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-[#04213d] tracking-tight">
                Curva de Crescimento de Membros
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1">
                <Database size={10} />
                {isRpcUsed ? 'Postgres RPC Agregado' : 'Baseado em criado_em'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Evolução mensal agregada no banco de dados pela data de registro de cada membro
            </p>
          </div>
        </div>

        {/* Filtros de Período e Modo de Visão */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {/* Seletor de Modo de Exibição */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('combined')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'combined'
                  ? 'bg-white text-[#04213d] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Curva acumulada com barras de novas adesões"
            >
              Combinado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cumulative')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'cumulative'
                  ? 'bg-white text-[#04213d] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Apenas curva de crescimento total"
            >
              Curva Total
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly_new')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'monthly_new'
                  ? 'bg-white text-[#04213d] shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Apenas novos membros por mês"
            >
              Novos / Mês
            </button>
          </div>

          {/* Seletor de Período */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setPeriod('6m')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                period === '6m'
                  ? 'bg-[#04213d] text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6M
            </button>
            <button
              type="button"
              onClick={() => setPeriod('12m')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                period === '12m'
                  ? 'bg-[#04213d] text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12M
            </button>
            <button
              type="button"
              onClick={() => setPeriod('ytd')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                period === 'ytd'
                  ? 'bg-[#04213d] text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ano Atual
            </button>
          </div>
        </div>
      </div>

      {/* Alerta Transparente de Importação em Lote / Histórico Anterior Indisponível */}
      {isBatchImportDetected && batchImportInfo && (
        <div className="bg-amber-50/90 border border-amber-300/90 rounded-xl p-3 sm:p-3.5 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-bold flex items-center gap-1.5 flex-wrap">
                <span>Importação em lote detectada em {batchImportInfo.monthLabel} ({batchImportInfo.percentage}% da base de membros)</span>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-md">
                  Histórico anterior indisponível
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Os meses anteriores não representam zero crescimento real, mas sim a ausência de registros prévios à migração em lote.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHidePreMigrationMonths(!hidePreMigrationMonths)}
            className="px-3 py-1.5 text-[11px] font-bold bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-lg shadow-2xs transition shrink-0 cursor-pointer self-start sm:self-center flex items-center gap-1.5 active:scale-95"
          >
            <SlidersHorizontal size={12} />
            <span>
              {hidePreMigrationMonths
                ? 'Ver período completo (com zeros)'
                : 'Ocultar meses pré-importação'}
            </span>
          </button>
        </div>
      )}

      {/* Mini KPIs de Performance no Período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Crescimento Líquido</span>
            <ArrowUpRight size={13} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg sm:text-xl font-black text-[#04213d]">
              +{stats.totalNetGrowth}
            </span>
            <span className="text-[11px] font-bold text-emerald-600">
              (+{stats.growthPercent}%)
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">no período exibido</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Média de Ingressos</span>
            <Users size={13} className="text-sky-600" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg sm:text-xl font-black text-[#04213d]">
              {stats.avgNewPerMonth}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold">membros/mês</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">ritmo de adesões</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Melhor Mês</span>
            <Award size={13} className="text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-sm sm:text-base font-black text-[#04213d] truncate">
              {stats.bestMonth?.monthLabel || '-'}
            </span>
            <span className="text-[11px] font-bold text-emerald-600">
              +{stats.bestMonth?.newMembers || 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">pico de adesões</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl">
          <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Taxa em Célula</span>
            <Target size={13} className="text-purple-600" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg sm:text-xl font-black text-[#04213d]">
              {totalMembers > 0 ? Math.round((linkedCount / totalMembers) * 100) : 0}%
            </span>
            <span className="text-[10px] text-slate-500 font-semibold">
              ({linkedCount}/{totalMembers})
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">engajamento ativo</p>
        </div>
      </div>

      {/* Container do Gráfico Recharts */}
      <div className="h-[280px] sm:h-[320px] w-full pt-2">
        {!isMounted || isLoadingApi ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-400 font-semibold gap-2">
            <RefreshCw size={14} className="animate-spin text-sky-600" />
            Carregando curva de crescimento agregada...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={growthData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="memberGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#04213d" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#04213d" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="newMembersBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.4} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

              <XAxis
                dataKey="monthLabel"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />

              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />

              {viewMode === 'combined' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
              )}

              <Tooltip content={CustomTooltip} />

              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '8px', fontSize: '11px' }}
              />

              {/* Barras de Novos Membros no Mês */}
              {(viewMode === 'combined' || viewMode === 'monthly_new') && (
                <Bar
                  yAxisId={viewMode === 'combined' ? 'right' : 'left'}
                  dataKey="newMembers"
                  name="Novos no Mês"
                  fill="url(#newMembersBarGradient)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              )}

              {/* Área/Curva de Membros Totais */}
              {(viewMode === 'combined' || viewMode === 'cumulative') && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="totalMembers"
                  name="Total Acumulado"
                  stroke="#04213d"
                  strokeWidth={2.5}
                  fill="url(#memberGrowthGradient)"
                  activeDot={{ r: 6, stroke: '#04213d', strokeWidth: 2, fill: '#38bdf8' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Rodapé Estratégico com Insight & Dica de Backfill */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <Sparkles size={13} className="text-amber-500 shrink-0" />
          <span>
            {stats.totalNetGrowth > 0
              ? `Base atualizada com ${stats.totalNetGrowth} novos registros no período.`
              : 'Base de membros estabilizada.'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <Info size={11} className="text-slate-400 shrink-0" />
          <span>
            Agregação nativa via SQL <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">date_trunc(&apos;month&apos;, criado_em)</code>
          </span>
        </div>
      </div>
    </div>
  );
};
