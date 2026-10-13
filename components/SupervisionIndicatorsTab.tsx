'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell as RechartsCell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ClipboardCheck, Loader2, MapPin } from 'lucide-react';
import { UserProfile } from '../types';
import { THRESHOLD_COLORS } from '@/lib/trackColors';

/** Meta de células supervisionadas por mês (% das células que existiam no mês). */
const SUPERVISION_GOAL_PERCENT = 85;

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

interface SupervisionCell {
  id: string;
  name: string;
  sectorId: string | null;
  /** Primeiro mês (índice em `months`) em que a célula existia. */
  start: number;
  /** Último mês em que existiu (célula já desativada); null = continua existindo. */
  end: number | null;
  /** Índices dos meses em que foi supervisionada. */
  sup: number[];
}

interface SupervisionData {
  months: string[];
  labels: { sector?: string | null; area?: string | null };
  areas: { id: string; name: string }[];
  sectors: { id: string; name: string; areaId: string | null }[];
  cells: SupervisionCell[];
  wholeChurch: boolean;
}

interface SupervisionIndicatorsTabProps {
  currentUser: UserProfile;
}

const selectClass =
  'text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

function monthParts(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return { year: y, month: m };
}

function shortMonthLabel(iso: string) {
  const { year, month } = monthParts(iso);
  return `${MONTHS_SHORT[month - 1]}/${String(year).slice(-2)}`;
}

function longMonthLabel(iso: string) {
  const { year, month } = monthParts(iso);
  return `${MONTHS_LONG[month - 1]}/${year}`;
}

function existsInMonth(cell: SupervisionCell, idx: number) {
  return cell.start <= idx && (cell.end === null || cell.end >= idx);
}

interface ChartPoint {
  idx: number;
  label: string;
  percent: number | null;
  supervised: number;
  total: number;
  partial: boolean;
}

export const SupervisionIndicatorsTab: React.FC<SupervisionIndicatorsTabProps> = ({ currentUser }) => {
  const churchId = currentUser.churchId;

  // Uma única consulta traz tudo o que a aba precisa (já dentro da cobertura do usuário).
  // Filtros, mês escolhido, percentuais e lista de pendentes são calculados em memória:
  // trocar de Área/Setor/mês não faz requisição nem recarrega o gráfico.
  const { data, isLoading, error } = useQuery<SupervisionData>({
    queryKey: ['supervision-indicators', churchId, currentUser.id],
    queryFn: async () => {
      const res = await fetch(`/api/indicators/supervision?churchId=${encodeURIComponent(churchId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Falha ao carregar a supervisão das células.');
      return body as SupervisionData;
    },
    enabled: Boolean(churchId),
    staleTime: 1000 * 60 * 5,
  });

  const [areaId, setAreaId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);

  const sectorById = useMemo(() => {
    const map = new Map<string, SupervisionData['sectors'][number]>();
    (data?.sectors || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [data]);

  const areaById = useMemo(() => {
    const map = new Map<string, SupervisionData['areas'][number]>();
    (data?.areas || []).forEach((a) => map.set(a.id, a));
    return map;
  }, [data]);

  const sectorOptions = useMemo(
    () => (data?.sectors || []).filter((s) => !areaId || s.areaId === areaId),
    [data, areaId]
  );

  const filteredCells = useMemo(() => {
    if (!data) return [];
    return data.cells.filter((c) => {
      if (sectorId) return c.sectorId === sectorId;
      if (areaId) return (c.sectorId && sectorById.get(c.sectorId)?.areaId) === areaId;
      return true;
    });
  }, [data, areaId, sectorId, sectorById]);

  // Primeiro mês com alguma célula (considerando toda a cobertura, não o filtro), para o
  // eixo não "pular" quando o usuário filtra; meses anteriores não têm dados e ficam de fora.
  const firstIdx = useMemo(() => {
    if (!data || data.cells.length === 0) return 0;
    return Math.min(...data.cells.map((c) => c.start));
  }, [data]);

  const lastIdx = data ? data.months.length - 1 : 0;

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const points: ChartPoint[] = [];
    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const existing = filteredCells.filter((c) => existsInMonth(c, idx));
      const supervised = existing.filter((c) => c.sup.includes(idx)).length;
      points.push({
        idx,
        label: shortMonthLabel(data.months[idx]),
        percent: existing.length > 0 ? Math.round((supervised / existing.length) * 100) : null,
        supervised,
        total: existing.length,
        partial: idx === lastIdx,
      });
    }
    return points;
  }, [data, filteredCells, firstIdx, lastIdx]);

  // Por padrão mostra o último mês fechado (o mês corrente ainda está em andamento).
  const defaultIdx = lastIdx - 1 >= firstIdx ? lastIdx - 1 : lastIdx;
  const selectedIdx = pickedIdx !== null && pickedIdx >= firstIdx && pickedIdx <= lastIdx ? pickedIdx : defaultIdx;
  const selectedPoint = chartData.find((p) => p.idx === selectedIdx) || null;

  const pendingCells = useMemo(() => {
    if (!data) return [];
    return filteredCells
      .filter((c) => existsInMonth(c, selectedIdx) && !c.sup.includes(selectedIdx))
      .map((c) => {
        const sector = c.sectorId ? sectorById.get(c.sectorId) : undefined;
        const area = sector?.areaId ? areaById.get(sector.areaId) : undefined;
        return {
          id: c.id,
          name: c.name,
          where: [sector?.name, area?.name].filter(Boolean).join(' · '),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data, filteredCells, selectedIdx, sectorById, areaById]);

  const sectorLabel = data?.labels?.sector || 'Setor';
  const areaLabel = data?.labels?.area || 'Área';

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
        {(error as Error | null)?.message || 'Falha ao carregar a supervisão das células.'}
      </div>
    );
  }

  if (data.cells.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 text-center text-sm text-slate-400">
        Nenhuma célula sob a sua cobertura ainda.
      </div>
    );
  }

  const showAreaFilter = data.areas.length > 1;
  const showSectorFilter = data.sectors.length > 1;

  const handleAreaChange = (value: string) => {
    setAreaId(value);
    setSectorId('');
  };

  const handleBarClick = (entry: any) => {
    const idx = entry?.payload?.idx ?? entry?.idx;
    if (typeof idx === 'number') setPickedIdx(idx);
  };

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#052447] text-white flex items-center justify-center shrink-0">
            <ClipboardCheck size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 truncate">Supervisão das Células</h2>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Células supervisionadas em cada mês, nos últimos 12 meses.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showAreaFilter && (
            <select
              aria-label={areaLabel}
              value={areaId}
              onChange={(e) => handleAreaChange(e.target.value)}
              className={selectClass}
            >
              <option value="">Todas as {areaLabel.toLowerCase()}s</option>
              {data.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {showSectorFilter && (
            <select
              aria-label={sectorLabel}
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              className={selectClass}
            >
              <option value="">Todos os {sectorLabel.toLowerCase()}es</option>
              {sectorOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {!showAreaFilter && !showSectorFilter && data.sectors[0] && (
            <span className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-600 font-semibold">
              <MapPin size={14} className="text-[#052447]" />
              {sectorLabel} {data.sectors[0].name}
            </span>
          )}
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-slate-100 rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <ClipboardCheck size={15} className="text-[#052447]" />
            % de células supervisionadas por mês
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: THRESHOLD_COLORS.high }} />≥ {SUPERVISION_GOAL_PERCENT}% (meta)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#052447]" />
              &lt; {SUPERVISION_GOAL_PERCENT}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#052447] opacity-50" />
              Mês em andamento
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 22, left: 0, right: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} interval={0} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              unit="%"
              width={42}
            />
            <Tooltip
              cursor={{ fill: 'rgba(5, 36, 71, 0.06)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = active && payload && payload[0] ? (payload[0].payload as ChartPoint) : null;
                if (!p) return null;
                return (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs">
                    <p className="font-bold text-slate-800 capitalize">{longMonthLabel(data.months[p.idx])}</p>
                    {p.percent === null ? (
                      <p className="text-slate-500">Nenhuma célula neste filtro.</p>
                    ) : (
                      <p className="text-slate-600">
                        {p.supervised} de {p.total} células supervisionadas ({p.percent}%)
                      </p>
                    )}
                    {p.partial && <p className="text-slate-400">Mês em andamento</p>}
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={SUPERVISION_GOAL_PERCENT}
              stroke="#052447"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Meta ${SUPERVISION_GOAL_PERCENT}%`,
                position: 'insideTopRight',
                fill: '#052447',
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <Bar
              dataKey="percent"
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
              onClick={handleBarClick}
            >
              {chartData.map((p) => {
                const reached = (p.percent ?? 0) >= SUPERVISION_GOAL_PERCENT;
                const isSelected = p.idx === selectedIdx;
                return (
                  <RechartsCell
                    key={p.idx}
                    fill={reached ? THRESHOLD_COLORS.high : '#052447'}
                    fillOpacity={p.partial ? 0.5 : 1}
                    stroke={isSelected ? '#38bdf8' : 'none'}
                    strokeWidth={isSelected ? 3 : 0}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
              <LabelList
                dataKey="percent"
                position="top"
                formatter={(value: unknown) => (typeof value === 'number' ? `${value}%` : '')}
                fill="#334155"
                fontSize={11}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
          Uma célula conta como supervisionada no mês se teve supervisão registrada no relatório semanal. O percentual é
          calculado sobre as células que existiam naquele mês. Clique numa barra para ver as células que ficaram sem supervisão.
        </p>
      </div>

      {/* Células sem supervisão no mês escolhido */}
      <div className="bg-slate-100 rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
          <h3 className="text-sm font-bold text-slate-800">
            {selectedIdx === lastIdx ? 'Ainda sem supervisão em ' : 'Células sem supervisão em '}
            <span className="capitalize">{longMonthLabel(data.months[selectedIdx])}</span>
          </h3>
          {selectedPoint && selectedPoint.total > 0 && (
            <span className="text-xs text-slate-600">
              {selectedPoint.total - selectedPoint.supervised} de {selectedPoint.total} células ·{' '}
              <span className="font-bold text-slate-800">{selectedPoint.percent}%</span> supervisionadas
            </span>
          )}
        </div>

        {pendingCells.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            {selectedPoint && selectedPoint.total > 0
              ? 'Todas as células foram supervisionadas neste mês.'
              : 'Nenhuma célula neste filtro neste mês.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingCells.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200/90 shadow-2xs px-3.5 py-2.5 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                {c.where && <p className="text-[11px] text-slate-500 truncate">{c.where}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
