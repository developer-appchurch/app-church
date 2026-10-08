'use client';

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell as RechartsCell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, GraduationCap, Loader2, TrendingUp, Users, X, AlertCircle } from 'lucide-react';
import { THRESHOLD_COLORS, colorForPercent } from '@/lib/trackColors';

interface CellIndicators {
  leadersInTraining: number;
  averageMembers: number | null;
  meetingsInAverage: number;
  growth: { date: string; members: number; guests: number; total: number }[];
  track: {
    totalMembers: number;
    steps: { id: number; title: string; completionCount: number; completionPercent: number }[];
  };
}

interface CellIndicatorsModalProps {
  cellId: string;
  cellName: string;
  onClose: () => void;
}

const NAVY = '#052447';

const formatDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

async function fetchCellIndicators(cellId: string): Promise<CellIndicators> {
  const res = await fetch(`/api/cells/indicators?cellId=${encodeURIComponent(cellId)}`, { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Falha ao carregar os indicadores da célula.');
  return data as CellIndicators;
}

/** Modal de indicadores da célula (Minha Célula › ícone de gráfico). Os dados só são buscados ao abrir. */
export const CellIndicatorsModal: React.FC<CellIndicatorsModalProps> = ({ cellId, cellName, onClose }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cell-indicators', cellId],
    queryFn: () => fetchCellIndicators(cellId),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Indicadores da célula ${cellName}`}
        className="bg-slate-50 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 bg-[#04213d] text-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 size={18} className="text-sky-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold truncate">Indicadores da Célula</h2>
              <p className="text-[11px] text-slate-300 truncate">{cellName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3">
          {isLoading && (
            <div className="py-16 flex justify-center text-slate-400">
              <Loader2 className="animate-spin" size={24} />
            </div>
          )}

          {!isLoading && error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {(error as Error).message}
            </div>
          )}

          {data && (
            <>
              {/* Cards */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <StatCard
                  icon={GraduationCap}
                  label="Líderes em Treinamento"
                  value={String(data.leadersInTraining)}
                />
                <StatCard
                  icon={Users}
                  label="Média de Presença"
                  value={data.averageMembers === null ? '—' : data.averageMembers.toLocaleString('pt-BR')}
                  hint={
                    data.meetingsInAverage > 0
                      ? `membros nas últimas ${data.meetingsInAverage} reuniões`
                      : 'sem reuniões registradas'
                  }
                />
              </div>

              {/* Curva de crescimento */}
              <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp size={15} className="text-[#052447]" />
                  Curva de Crescimento
                </h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Total de presentes (membros + convidados) por reunião, nos últimos 2 meses.
                </p>
                {data.growth.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Nenhuma reunião registrada nos últimos 2 meses.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.growth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDay}
                        interval={0}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as CellIndicators['growth'][number];
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
                              <p className="font-bold text-slate-800">Reunião de {formatDay(p.date)}</p>
                              <p className="text-slate-700">
                                Total: <strong>{p.total}</strong>
                              </p>
                              <p className="text-slate-500">
                                {p.members} membros + {p.guests} convidados
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>

              {/* Trilho de Liderança da célula */}
              <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <BarChart3 size={15} className="text-[#052447]" />
                      Trilho de Liderança da Célula
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Quanto cada etapa foi cumprida pelos {data.track.totalMembers} membros da célula.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: THRESHOLD_COLORS.high }} />≥ 65%
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: THRESHOLD_COLORS.mid }} />30–65%
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: THRESHOLD_COLORS.low }} />&lt; 30%
                    </span>
                  </div>
                </div>
                {data.track.steps.length === 0 || data.track.totalMembers === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Sem dados do trilho para esta célula.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(240, data.track.steps.length * 30)}>
                    <BarChart data={data.track.steps} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                      <YAxis type="category" dataKey="title" width={120} tick={{ fontSize: 10, fill: '#475569' }} />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        formatter={(value: any, _name, item: any) => [
                          `${value}% (${item.payload.completionCount} de ${data.track.totalMembers})`,
                          'Conclusão',
                        ]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="completionPercent" radius={[0, 4, 4, 0]} barSize={14}>
                        {data.track.steps.map((s) => (
                          <RechartsCell key={s.id} fill={colorForPercent(s.completionPercent)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string; hint?: string }> = ({
  icon: Icon,
  label,
  value,
  hint,
}) => (
  <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4">
    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-slate-500">
      <Icon size={14} className="text-[#052447] shrink-0" />
      <span className="truncate">{label}</span>
    </div>
    <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{value}</p>
    {hint && <p className="text-[10px] sm:text-[11px] text-slate-400 leading-tight">{hint}</p>}
  </div>
);
