'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, Users } from 'lucide-react';
import { UserProfile } from '../types';

/**
 * Aba do menor nível da hierarquia (ex.: "Células") em Indicadores da Igreja: apurado semanal
 * (domingo a sábado) dos relatórios — barras = soma de membros, linha = soma de convidados.
 * Os dados chegam numa única chamada; setor, área e nº de semanas são aplicados aqui.
 */

const COLOR_BARS = '#052447';
const COLOR_LINE = '#0e7490';
const COLOR_GUESTS = '#38bdf8';

interface WeeklyRow {
  w: string;
  s: string | null;
  a: string | null;
  n: number;
  m: number;
  g: number;
  c: number;
}
export interface CelulasIndicatorsData {
  today: string;
  label: string | null;
  sectorLabel: string | null;
  areaLabel: string | null;
  areas: { id: string; name: string }[];
  sectors: { id: string; name: string; areaId: string | null }[];
  weekly: WeeklyRow[];
}

async function fetchCelulasIndicators(churchId: string): Promise<CelulasIndicatorsData> {
  const res = await fetch(`/api/indicators/celulas?churchId=${encodeURIComponent(churchId)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Não foi possível carregar os indicadores.');
  return json as CelulasIndicatorsData;
}

/** Opções da consulta (usadas pela aba e pelo pré-carregamento ao apontar para ela). */
export const celulasIndicatorsQuery = (churchId: string, userId: string) => ({
  queryKey: ['celulas-indicators', churchId, userId] as const,
  queryFn: () => fetchCelulasIndicators(churchId),
  staleTime: 5 * 60 * 1000,
});

/** Plural simples em português para o nome do nível ("Célula" → "Células"). */
export function pluralizeLevel(name: string): string {
  const n = name.trim();
  if (!n) return n;
  const lower = n.toLowerCase();
  if (lower.endsWith('s')) return n;
  if (lower.endsWith('ão')) return `${n.slice(0, -2)}ões`;
  if (/[rz]$/.test(lower)) return `${n}es`;
  if (lower.endsWith('l')) return `${n.slice(0, -1)}is`;
  return `${n}s`;
}

const selectClass =
  'text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n)
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dm = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};

interface Props {
  currentUser: UserProfile;
}

export const CelulasIndicatorsTab: React.FC<Props> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const query = useQuery({
    ...celulasIndicatorsQuery(churchId || '', currentUser.id),
    enabled: !!churchId,
  });

  const [areaId, setAreaId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [weeks, setWeeks] = useState(26);

  const data = query.data;
  const plural = pluralizeLevel(data?.label || 'Célula');

  const visibleSectors = useMemo(
    () => (data?.sectors || []).filter((s) => !areaId || s.areaId === areaId),
    [data, areaId]
  );

  const filtered = useMemo(
    () => (data?.weekly || []).filter((r) => (!areaId || r.a === areaId) && (!sectorId || r.s === sectorId)),
    [data, areaId, sectorId]
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    const byWeek = new Map<string, { m: number; g: number; c: number; n: number }>();
    for (const r of filtered) {
      const cur = byWeek.get(r.w) || { m: 0, g: 0, c: 0, n: 0 };
      cur.m += r.m;
      cur.g += r.g;
      cur.c += r.c;
      cur.n += r.n;
      byWeek.set(r.w, cur);
    }
    const dow = new Date(`${data.today}T00:00:00Z`).getUTCDay();
    const thisWeek = addDays(data.today, -dow);
    const out: { label: string; week: string; membros: number | null; convidados: number | null; relatorios: number }[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const w = addDays(thisWeek, -7 * i);
      const v = byWeek.get(w);
      out.push({
        label: dm(w),
        week: w,
        membros: v ? v.m : null,
        convidados: v ? v.g : null,
        relatorios: v ? v.n : 0,
      });
    }
    return out;
  }, [data, filtered, weeks]);

  const summary = useMemo(() => {
    const withData = chartData.filter((d) => d.membros !== null);
    const members = withData.reduce((a, d) => a + (d.membros || 0), 0);
    const guests = withData.reduce((a, d) => a + (d.convidados || 0), 0);
    const reports = withData.reduce((a, d) => a + d.relatorios, 0);
    const last = [...withData].reverse()[0];
    return {
      avgMembers: withData.length ? members / withData.length : null,
      guests,
      reports,
      last,
    };
  }, [chartData]);

  if (!churchId) return null;

  if (query.isLoading) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-10 flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
        {(query.error as Error)?.message || 'Não foi possível carregar os indicadores.'}
      </div>
    );
  }
  if (data.weekly.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-8 text-center space-y-2">
        <Users size={28} className="mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-800">Ainda não há relatórios semanais lançados.</p>
        <p className="text-xs text-slate-500">
          Os gráficos aparecem aqui assim que os líderes enviarem os relatórios de {plural.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-3 sm:p-4 flex flex-wrap items-center gap-2">
        {data.areas.length > 0 && (
          <select
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setSectorId('');
            }}
            className={selectClass}
            aria-label={data.areaLabel || 'Área'}
          >
            <option value="">Todas as {pluralizeLevel(data.areaLabel || 'Área').toLowerCase()}</option>
            {data.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {visibleSectors.length > 0 && (
          <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className={selectClass} aria-label={data.sectorLabel || 'Setor'}>
            <option value="">Todos os {pluralizeLevel(data.sectorLabel || 'Setor').toLowerCase()}</option>
            {visibleSectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard
          label="Membros na última semana"
          value={fmt(summary.last?.membros)}
          hint={summary.last ? `semana de ${summary.last.label}` : ''}
        />
        <StatCard label="Média semanal de membros" value={fmt(summary.avgMembers, 1)} hint={`últimas ${weeks} semanas`} />
        <StatCard label="Convidados no período" value={fmt(summary.guests)} hint={`últimas ${weeks} semanas`} />
        <StatCard label="Reuniões relatadas" value={fmt(summary.reports)} hint={`últimas ${weeks} semanas`} />
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-black text-slate-900">Tendência semanal · {plural}</h3>
          <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={selectClass} aria-label="Período">
            <option value={12}>Últimas 12 semanas</option>
            <option value={26}>Últimas 26 semanas</option>
            <option value={52}>Últimas 52 semanas</option>
            <option value={104}>Últimas 104 semanas</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">
          Soma de membros (barras) e de convidados (linha) por semana, de domingo a sábado.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any, name: any) => [fmt(Number(v)), name]}
                labelFormatter={(_l: any, payload: any) => `Semana de ${payload?.[0]?.payload?.label ?? ''}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="membros" name="Membros" fill={COLOR_BARS} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="convidados"
                name="Convidados"
                stroke={COLOR_LINE}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-3 sm:p-4">
        <h3 className="text-sm font-black text-slate-900">Total de pessoas · {plural}</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Membros + convidados por semana (últimas {weeks} semanas). A altura da barra é o total.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any, name: any) => [fmt(Number(v)), name]}
                labelFormatter={(_l: any, payload: any) => {
                  const p = payload?.[0]?.payload;
                  return `Semana de ${p?.label ?? ''} · total ${fmt((p?.membros ?? 0) + (p?.convidados ?? 0))}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="membros" name="Membros" stackId="total" fill={COLOR_BARS} isAnimationActive={false} />
              <Bar
                dataKey="convidados"
                name="Convidados"
                stackId="total"
                fill={COLOR_GUESTS}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-3 sm:p-4">
    <p className="text-[11px] font-bold text-slate-500 leading-tight">{label}</p>
    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{value}</p>
    {hint && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{hint}</p>}
  </div>
);
