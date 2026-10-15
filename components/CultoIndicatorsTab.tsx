'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Church, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { UserProfile } from '../types';

/**
 * Aba "Cultos" de Indicadores da Igreja: tendência semanal (linha), ano atual x ano anterior
 * (barras), histórico mensal e resumo por ano. Os dados chegam agregados numa única chamada;
 * campus, culto, indicador e soma/média são aplicados aqui, sem nova consulta.
 */

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const COLOR_CURRENT = '#052447';
const COLOR_PREVIOUS = '#94a3b8';
const COLOR_LINE = '#0e7490';

interface AggRow {
  h: string;
  n: number;
  a: number;
  c: number;
  v: number;
  cv: number;
  r: number;
  g: number;
}
interface MonthlyRow extends AggRow {
  y: number;
  m: number;
}
interface WeeklyRow extends AggRow {
  w: string;
}
interface CultoIndicatorsData {
  today: string;
  campuses: { id: string; name: string; active: boolean }[];
  schedules: { id: string; campusId: string; name: string; dayOfWeek: number; time: string; active: boolean }[];
  monthly: MonthlyRow[];
  weekly: WeeklyRow[];
  peaks: { h: string; d: string; t: number }[];
}

async function fetchCultoIndicators(churchId: string): Promise<CultoIndicatorsData> {
  const res = await fetch(`/api/indicators/culto?churchId=${encodeURIComponent(churchId)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Não foi possível carregar os indicadores de culto.');
  return json as CultoIndicatorsData;
}

/** Opções da consulta (usadas pela aba e pelo pré-carregamento ao apontar para ela). */
export const cultoIndicatorsQuery = (churchId: string, userId: string) => ({
  queryKey: ['culto-indicators', churchId, userId] as const,
  queryFn: () => fetchCultoIndicators(churchId),
  staleTime: 5 * 60 * 1000,
});

type MetricKey = 'total' | 'a' | 'c' | 'v' | 'cv' | 'r' | 'g';
const METRICS: { id: MetricKey; label: string }[] = [
  { id: 'total', label: 'Total de pessoas (adultos + crianças)' },
  { id: 'a', label: 'Adultos' },
  { id: 'c', label: 'Crianças' },
  { id: 'v', label: 'Voluntários' },
  { id: 'cv', label: 'Conversões' },
  { id: 'r', label: 'Reconciliações' },
  { id: 'g', label: 'Convidados' },
];

type Mode = 'sum' | 'avg';

const selectClass =
  'text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function metricOf(row: AggRow, metric: MetricKey): number {
  return metric === 'total' ? row.a + row.c : row[metric];
}

/** Soma (ou média por culto) de um conjunto de linhas. null quando não há cultos. */
function aggregate(rows: AggRow[], metric: MetricKey, mode: Mode): number | null {
  let services = 0;
  let sum = 0;
  for (const r of rows) {
    services += r.n;
    sum += metricOf(r, metric);
  }
  if (services === 0) return null;
  return mode === 'sum' ? sum : sum / services;
}

function dayOfWeekOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dm(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

interface Props {
  currentUser: UserProfile;
}

export const CultoIndicatorsTab: React.FC<Props> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const query = useQuery({
    ...cultoIndicatorsQuery(churchId || '', currentUser.id),
    enabled: !!churchId,
  });

  const [campusId, setCampusId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [metric, setMetric] = useState<MetricKey>('total');
  const [mode, setMode] = useState<Mode>('sum');
  const [weeks, setWeeks] = useState(26);
  const [yearChoice, setYearChoice] = useState<number | null>(null);

  const data = query.data;

  const visibleSchedules = useMemo(
    () => (data?.schedules || []).filter((s) => !campusId || s.campusId === campusId),
    [data, campusId]
  );

  // horários que entram nos cálculos, conforme os filtros de campus e culto
  const allowedIds = useMemo(() => {
    const set = new Set<string>();
    (data?.schedules || []).forEach((s) => {
      if (campusId && s.campusId !== campusId) return;
      if (scheduleId && s.id !== scheduleId) return;
      set.add(s.id);
    });
    return set;
  }, [data, campusId, scheduleId]);

  const monthly = useMemo(() => (data?.monthly || []).filter((r) => allowedIds.has(r.h)), [data, allowedIds]);
  const weekly = useMemo(() => (data?.weekly || []).filter((r) => allowedIds.has(r.h)), [data, allowedIds]);

  const currentYear = data ? Number(data.today.slice(0, 4)) : new Date().getFullYear();
  const currentMonth = data ? Number(data.today.slice(5, 7)) : new Date().getMonth() + 1;

  const years = useMemo(() => {
    const set = new Set<number>((data?.monthly || []).map((r) => r.y));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [data, currentYear]);
  const year = yearChoice && years.includes(yearChoice) ? yearChoice : currentYear;

  const metricLabel = METRICS.find((m) => m.id === metric)?.label.split(' (')[0] || '';
  const valueLabel = mode === 'sum' ? metricLabel : `${metricLabel} (média por culto)`;
  const digits = mode === 'avg' ? 1 : 0;

  // Barras: mês a mês, ano escolhido x ano anterior
  const barData = useMemo(
    () =>
      MONTHS_SHORT.map((label, i) => {
        const m = i + 1;
        const cur = year === currentYear && m > currentMonth ? null : aggregate(monthly.filter((r) => r.y === year && r.m === m), metric, mode);
        const prev = aggregate(monthly.filter((r) => r.y === year - 1 && r.m === m), metric, mode);
        return {
          label,
          [String(year)]: cur === null ? null : Math.round(cur * 10) / 10,
          [String(year - 1)]: prev === null ? null : Math.round(prev * 10) / 10,
        };
      }),
    [monthly, year, currentYear, currentMonth, metric, mode]
  );

  // Linha: tendência semanal (domingo a sábado) das últimas N semanas
  const lineData = useMemo(() => {
    if (!data) return [];
    const thisWeek = addDays(data.today, -dayOfWeekOf(data.today));
    const out: { label: string; week: string; value: number | null }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const w = addDays(thisWeek, -7 * i);
      const v = aggregate(weekly.filter((r) => r.w === w), metric, mode);
      out.push({ label: dm(w), week: w, value: v === null ? null : Math.round(v * 10) / 10 });
    }
    return out;
  }, [data, weekly, weeks, metric, mode]);

  // Cartões de resumo do ano escolhido
  const summary = useMemo(() => {
    const yearRows = monthly.filter((r) => r.y === year);
    // compara o mesmo período: no ano atual, só até o mês corrente
    const upTo = year === currentYear ? currentMonth : 12;
    const curSame = monthly.filter((r) => r.y === year && r.m <= upTo);
    const prevSame = monthly.filter((r) => r.y === year - 1 && r.m <= upTo);
    const curSum = aggregate(curSame, metric, 'sum');
    const prevSum = aggregate(prevSame, metric, 'sum');
    const variation = curSum !== null && prevSum !== null && prevSum > 0 ? ((curSum - prevSum) / prevSum) * 100 : null;
    const peak = (data?.peaks || [])
      .filter((p) => allowedIds.has(p.h))
      .sort((a, b) => b.t - a.t)[0];
    return {
      yearSum: aggregate(yearRows, metric, 'sum'),
      yearAvg: aggregate(yearRows, metric, 'avg'),
      services: yearRows.reduce((acc, r) => acc + r.n, 0),
      variation,
      peak,
    };
  }, [monthly, year, currentYear, currentMonth, metric, data, allowedIds]);

  // Histórico mensal do ano escolhido
  const monthRows = useMemo(
    () =>
      MONTHS_LONG.map((name, i) => {
        const m = i + 1;
        const rows = monthly.filter((r) => r.y === year && r.m === m);
        const prevRows = monthly.filter((r) => r.y === year - 1 && r.m === m);
        const cur = aggregate(rows, metric, mode);
        const prev = aggregate(prevRows, metric, mode);
        return {
          name,
          services: rows.reduce((acc, r) => acc + r.n, 0),
          cur,
          prev,
          delta: cur !== null && prev !== null && prev > 0 ? ((cur - prev) / prev) * 100 : null,
        };
      }),
    [monthly, year, metric, mode]
  );

  // Resumo por ano (todos os anos disponíveis)
  const yearRows = useMemo(
    () =>
      years.map((y) => {
        const rows = monthly.filter((r) => r.y === y);
        return {
          year: y,
          services: rows.reduce((acc, r) => acc + r.n, 0),
          sum: aggregate(rows, metric, 'sum'),
          avg: aggregate(rows, metric, 'avg'),
        };
      }),
    [years, monthly, metric]
  );

  if (!churchId) return null;

  if (query.isLoading) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
        {(query.error as Error)?.message || 'Não foi possível carregar os indicadores de culto.'}
      </div>
    );
  }
  if (data.monthly.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-8 text-center space-y-2">
        <Church size={28} className="mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-800">Ainda não há contagens de culto lançadas.</p>
        <p className="text-xs text-slate-500">
          Quem tem a permissão <strong>Gestor de Culto</strong> lança os números em <strong>Contagem de Culto</strong>, no
          menu lateral. Os gráficos aparecem aqui assim que o primeiro culto for registrado.
        </p>
      </div>
    );
  }

  const peakSchedule = summary.peak ? data.schedules.find((s) => s.id === summary.peak!.h) : null;
  const showPeak = metric === 'total';

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 flex flex-wrap items-center gap-2">
        {data.campuses.length > 1 && (
          <select
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value);
              setScheduleId('');
            }}
            className={selectClass}
            aria-label="Campus"
          >
            <option value="">Todos os campus</option>
            {data.campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {visibleSchedules.length > 1 && (
          <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className={selectClass} aria-label="Culto">
            <option value="">Todos os cultos</option>
            {visibleSchedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({DAYS[s.dayOfWeek]} {s.time})
              </option>
            ))}
          </select>
        )}
        <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className={selectClass} aria-label="Indicador">
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="inline-flex p-0.5 bg-slate-100 rounded-xl">
          {([
            { id: 'sum', label: 'Soma' },
            { id: 'avg', label: 'Média por culto' },
          ] as const).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setMode(o.id)}
              className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition cursor-pointer ${
                mode === o.id ? 'bg-[#052447] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select value={year} onChange={(e) => setYearChoice(Number(e.target.value))} className={selectClass} aria-label="Ano">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Cartões */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard label={`${metricLabel} em ${year}`} value={fmt(summary.yearSum)} hint={`${fmt(summary.services)} cultos`} />
        <StatCard label="Média por culto" value={fmt(summary.yearAvg, 1)} hint={`em ${year}`} />
        <StatCard
          label={`Variação vs ${year - 1}`}
          value={summary.variation === null ? '—' : `${summary.variation > 0 ? '+' : ''}${fmt(summary.variation, 1)}%`}
          hint={year === currentYear ? `jan–${MONTHS_SHORT[currentMonth - 1]} (mesmo período)` : 'ano completo'}
          tone={summary.variation === null ? 'neutral' : summary.variation >= 0 ? 'up' : 'down'}
        />
        {showPeak ? (
          <StatCard
            label="Maior público (12 meses)"
            value={summary.peak ? fmt(summary.peak.t) : '—'}
            hint={summary.peak ? `${dm(summary.peak.d)} · ${peakSchedule?.name ?? ''}` : ''}
          />
        ) : (
          <StatCard label="Cultos lançados" value={fmt(summary.services)} hint={`em ${year}`} />
        )}
      </div>

      {/* Linha: tendência semanal */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-black text-slate-900">Tendência semanal</h3>
          <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={selectClass} aria-label="Período">
            <option value={12}>Últimas 12 semanas</option>
            <option value={26}>Últimas 26 semanas</option>
            <option value={52}>Últimas 52 semanas</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">{valueLabel} por semana (domingo a sábado).</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={mode === 'avg'} />
              <Tooltip
                formatter={(v: any) => [fmt(Number(v), digits), valueLabel]}
                labelFormatter={(_l: any, payload: any) => `Semana de ${payload?.[0]?.payload?.label ?? ''}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={COLOR_LINE}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Barras: ano x ano anterior */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4">
        <h3 className="text-sm font-black text-slate-900">
          {year} x {year - 1}
        </h3>
        <p className="text-[11px] text-slate-500 mb-2">{valueLabel}, mês a mês.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={mode === 'avg'} />
              <Tooltip formatter={(v: any, name: any) => [fmt(Number(v), digits), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={String(year - 1)} fill={COLOR_PREVIOUS} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey={String(year)} fill={COLOR_CURRENT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Histórico mensal */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 overflow-x-auto">
        <h3 className="text-sm font-black text-slate-900 mb-2">Histórico mensal · {year}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 pr-2 font-bold">Mês</th>
              <th className="py-1.5 px-2 font-bold text-right">Cultos</th>
              <th className="py-1.5 px-2 font-bold text-right">{year}</th>
              <th className="py-1.5 px-2 font-bold text-right">{year - 1}</th>
              <th className="py-1.5 pl-2 font-bold text-right">Variação</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.map((r) => (
              <tr key={r.name} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2 font-semibold text-slate-800">{r.name}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{r.services || '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-bold text-slate-900">{fmt(r.cur, digits)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{fmt(r.prev, digits)}</td>
                <td
                  className={`py-1.5 pl-2 text-right tabular-nums font-semibold ${
                    r.delta === null ? 'text-slate-400' : r.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {r.delta === null ? '—' : `${r.delta > 0 ? '+' : ''}${fmt(r.delta, 1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumo por ano */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 overflow-x-auto">
        <h3 className="text-sm font-black text-slate-900 mb-2">Resumo por ano · {metricLabel}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 pr-2 font-bold">Ano</th>
              <th className="py-1.5 px-2 font-bold text-right">Cultos</th>
              <th className="py-1.5 px-2 font-bold text-right">Soma</th>
              <th className="py-1.5 pl-2 font-bold text-right">Média por culto</th>
            </tr>
          </thead>
          <tbody>
            {yearRows.map((r) => (
              <tr key={r.year} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-2 font-semibold text-slate-800">{r.year}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{r.services || '—'}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-bold text-slate-900">{fmt(r.sum)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-slate-600">{fmt(r.avg, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'up' | 'down';
}> = ({ label, value, hint, tone = 'neutral' }) => (
  <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4">
    <p className="text-[11px] font-bold text-slate-500 leading-tight">{label}</p>
    <p
      className={`mt-1 text-2xl font-black tabular-nums flex items-center gap-1.5 ${
        tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-rose-600' : 'text-slate-900'
      }`}
    >
      {tone === 'up' && <TrendingUp size={18} />}
      {tone === 'down' && <TrendingDown size={18} />}
      {value}
    </p>
    {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
  </div>
);
