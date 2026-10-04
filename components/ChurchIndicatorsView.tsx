'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell as RechartsCell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Award,
  BarChart3,
  Flame,
  GitCompareArrows,
  Loader2,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { UserProfile, ChurchHierarchicalLevel, OrganizationalUnit } from '../types';
import { AppChurchService } from '../lib/supabase';

interface ChurchIndicatorsViewProps {
  currentUser: UserProfile;
  onBack?: () => void;
}

type ScopeTab = 'church' | 'area' | 'sector';
type ViewMode = 'charts' | 'compare';
type IndicatorsTab = 'track';

const TABS: { id: IndicatorsTab; label: string; icon: React.ElementType }[] = [
  { id: 'track', label: 'Trilho de Liderança', icon: Award },
];

const THRESHOLD_COLORS = {
  high: '#059669', // emerald-600 — ≥ 65%
  mid: '#d97706', // amber-600 — 30% a 65%
  low: '#dc2626', // red-600 — < 30%
};

function colorForPercent(percent: number): string {
  if (percent >= 65) return THRESHOLD_COLORS.high;
  if (percent >= 30) return THRESHOLD_COLORS.mid;
  return THRESHOLD_COLORS.low;
}

interface IndicatorsData {
  scopeUnit: { id: string; name?: string } | null;
  totalMembers: number;
  totalSteps: number;
  avgCompletionPercent: number;
  completedCount: number;
  completedPercent: number;
  steps: { id: number; stepNumber: number; title: string; completionCount: number; completionPercent: number }[];
  bestStep: { id: number; stepNumber: number; title: string; completionPercent: number } | null;
  worstStep: { id: number; stepNumber: number; title: string; completionPercent: number } | null;
  distribution: { notStarted: number; inProgress: number; completed: number };
  compareUnits: { id: string; name: string; totalMembers: number; avgCompletionPercent: number }[];
}

export const ChurchIndicatorsView: React.FC<ChurchIndicatorsViewProps> = ({ currentUser, onBack }) => {
  const churchId = currentUser.churchId;
  const [activeTab, setActiveTab] = useState<IndicatorsTab>('track');

  // Base: níveis e unidades da hierarquia (carregados uma vez, usados para
  // montar os seletores de Área/Setor e resolver o nível de comparação)
  const [levels, setLevels] = useState<ChurchHierarchicalLevel[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [isLoadingBase, setIsLoadingBase] = useState(true);
  const [baseError, setBaseError] = useState('');

  const [scopeTab, setScopeTab] = useState<ScopeTab>('church');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('charts');

  const [indicators, setIndicators] = useState<IndicatorsData | null>(null);
  const [isLoadingIndicators, setIsLoadingIndicators] = useState(true);
  const [indicatorsError, setIndicatorsError] = useState('');

  useEffect(() => {
    if (!churchId) return;
    let mounted = true;
    (async () => {
      setIsLoadingBase(true);
      try {
        const [lvls, unts] = await Promise.all([
          AppChurchService.getChurchLevels(churchId),
          AppChurchService.getUnits(churchId, undefined, 'flat'),
        ]);
        if (!mounted) return;
        setLevels(lvls);
        setUnits(unts);
      } catch (err: any) {
        if (mounted) setBaseError(err?.message || 'Falha ao carregar a estrutura da igreja.');
      } finally {
        if (mounted) setIsLoadingBase(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [churchId]);

  const cellLevel = levels.length > 0 ? levels[levels.length - 1] : null;
  const sectorLevel = levels.length > 1 ? levels[levels.length - 2] : null;
  const areaLevel = levels.length > 2 ? levels[levels.length - 3] : null;

  const areaOptions = useMemo(
    () => (areaLevel ? units.filter((u) => u.levelTypeId === areaLevel.id) : []),
    [units, areaLevel]
  );
  const sectorOptions = useMemo(
    () => (sectorLevel ? units.filter((u) => u.levelTypeId === sectorLevel.id) : []),
    [units, sectorLevel]
  );

  // Seleciona a primeira opção automaticamente quando o usuário troca para
  // uma aba de escopo que ainda não tem unidade escolhida
  useEffect(() => {
    if (scopeTab === 'area' && !selectedAreaId && areaOptions.length > 0) {
      setSelectedAreaId(areaOptions[0].id);
    }
    if (scopeTab === 'sector' && !selectedSectorId && sectorOptions.length > 0) {
      setSelectedSectorId(sectorOptions[0].id);
    }
  }, [scopeTab, areaOptions, sectorOptions, selectedAreaId, selectedSectorId]);

  const effectiveUnitId =
    scopeTab === 'area' ? selectedAreaId || undefined : scopeTab === 'sector' ? selectedSectorId || undefined : undefined;

  const effectiveUnitName =
    scopeTab === 'area'
      ? areaOptions.find((a) => a.id === selectedAreaId)?.name
      : scopeTab === 'sector'
      ? sectorOptions.find((s) => s.id === selectedSectorId)?.name
      : undefined;

  // Nível usado no modo "Comparativo": o nível logo abaixo do escopo atual.
  // Se a igreja não tem unidades de Área cadastradas, cai para comparar
  // Setores mesmo a partir de "Igreja em Geral".
  const compareLevelId = useMemo(() => {
    if (scopeTab === 'sector') return cellLevel?.id;
    if (scopeTab === 'area') return sectorLevel?.id;
    return areaOptions.length > 0 ? areaLevel?.id : sectorLevel?.id;
  }, [scopeTab, cellLevel, sectorLevel, areaLevel, areaOptions.length]);

  const compareLevelName =
    compareLevelId === areaLevel?.id ? areaLevel?.name : compareLevelId === sectorLevel?.id ? sectorLevel?.name : cellLevel?.name;

  const scopeIsReady =
    scopeTab === 'church' || (scopeTab === 'area' && !!selectedAreaId) || (scopeTab === 'sector' && !!selectedSectorId);

  const loadIndicators = useCallback(async () => {
    if (!churchId || !scopeIsReady) return;
    setIsLoadingIndicators(true);
    setIndicatorsError('');
    try {
      const data = await AppChurchService.getLeadershipTrackIndicators(churchId, effectiveUnitId, compareLevelId);
      setIndicators(data);
    } catch (err: any) {
      setIndicatorsError(err?.message || 'Falha ao calcular os indicadores.');
    } finally {
      setIsLoadingIndicators(false);
    }
  }, [churchId, scopeIsReady, effectiveUnitId, compareLevelId]);

  useEffect(() => {
    if (!isLoadingBase) loadIndicators();
  }, [isLoadingBase, loadIndicators]);

  const scopeLabel =
    scopeTab === 'church' ? 'toda a igreja' : scopeTab === 'area' ? `Área ${effectiveUnitName || ''}` : `Setor ${effectiveUnitName || ''}`;

  const distributionData = indicators
    ? [
        { name: 'Não iniciado', value: indicators.distribution.notStarted, color: '#cbd5e1' },
        { name: 'Em andamento', value: indicators.distribution.inProgress, color: '#38bdf8' },
        { name: 'Completo', value: indicators.distribution.completed, color: '#059669' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-20">
      <div className="max-w-6xl mx-auto mb-3 sm:mb-5">
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex items-center gap-3.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 sm:p-2 -ml-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg sm:rounded-xl transition cursor-pointer shrink-0"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <BarChart3 size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
              Indicadores da Igreja
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5 truncate">
              Acompanhe o avanço do discipulado por toda a igreja, Área ou Setor.
            </p>
          </div>
        </div>

        <div className="flex gap-1 mt-2 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive ? 'bg-[#052447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-3">
        {isLoadingBase ? (
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 flex items-center justify-center text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : baseError ? (
          <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
            {baseError}
          </div>
        ) : (
          <>
            {/* Escopo + modo de visualização */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-xl">
                  {([
                    { id: 'church', label: 'Igreja em Geral' },
                    { id: 'area', label: `Por ${areaLevel?.name || 'Área'}` },
                    { id: 'sector', label: `Por ${sectorLevel?.name || 'Setor'}` },
                  ] as { id: ScopeTab; label: string }[]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setScopeTab(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
                        scopeTab === opt.id ? 'bg-[#052447] text-white shadow-2xs' : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {scopeTab === 'area' && (
                  <select
                    value={selectedAreaId}
                    onChange={(e) => setSelectedAreaId(e.target.value)}
                    className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    {areaOptions.length === 0 && <option value="">Nenhuma {areaLevel?.name || 'Área'} cadastrada</option>}
                    {areaOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}

                {scopeTab === 'sector' && (
                  <select
                    value={selectedSectorId}
                    onChange={(e) => setSelectedSectorId(e.target.value)}
                    className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    {sectorOptions.length === 0 && <option value="">Nenhum {sectorLevel?.name || 'Setor'} cadastrado</option>}
                    {sectorOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl self-start lg:self-auto">
                {([
                  { id: 'charts', label: 'Gráficos', icon: BarChart3 },
                  { id: 'compare', label: 'Comparativo', icon: GitCompareArrows },
                ] as { id: ViewMode; label: string; icon: React.ElementType }[]).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setViewMode(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
                        viewMode === opt.id ? 'bg-[#052447] text-white shadow-2xs' : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <Icon size={14} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!scopeIsReady ? (
              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 text-center text-sm text-slate-400">
                Nenhuma unidade cadastrada para esse escopo ainda.
              </div>
            ) : isLoadingIndicators ? (
              <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 flex items-center justify-center text-slate-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : indicatorsError ? (
              <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
                {indicatorsError}
              </div>
            ) : indicators ? (
              <>
                {/* Cards de KPI */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-[#052447] rounded-xl sm:rounded-2xl border border-[#04213d] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">
                        Total de Membros
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0">
                        <Users size={14} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-white">{indicators.totalMembers}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">em {scopeLabel}</p>
                    <div className="mt-2 pt-2 border-t border-white/10 text-[11px] space-y-0.5">
                      <p className="flex justify-between text-white/70">
                        <span>Com progresso:</span>
                        <span className="font-bold text-emerald-300">
                          {indicators.totalMembers - indicators.distribution.notStarted}
                        </span>
                      </p>
                      <p className="flex justify-between text-white/70">
                        <span>Sem progresso (0%):</span>
                        <span className="font-bold text-rose-300">{indicators.distribution.notStarted}</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#052447] rounded-xl sm:rounded-2xl border border-[#04213d] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">
                        Conclusão Média
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0">
                        <TrendingUp size={14} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-white">
                      {indicators.avgCompletionPercent}
                      <span className="text-base font-bold text-white/50">%</span>
                    </p>
                    <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-400"
                        style={{ width: `${Math.min(100, indicators.avgCompletionPercent)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-white/50 mt-1.5">
                      Média do trilho entre os {indicators.totalMembers} membros · {indicators.totalSteps} etapas
                    </p>
                  </div>

                  <div className="bg-[#052447] rounded-xl sm:rounded-2xl border border-[#04213d] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">
                        Trilho Completo
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0">
                        <Award size={14} />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-white">
                      {indicators.completedCount}
                      <span className="text-base font-bold text-white/50 ml-1">
                        ({indicators.completedPercent}%)
                      </span>
                    </p>
                    <p className="text-[11px] text-white/50 mt-2">
                      Ainda não concluíram: {indicators.totalMembers - indicators.completedCount} (
                      {Math.round((100 - indicators.completedPercent) * 10) / 10}%)
                    </p>
                  </div>

                  <div className="bg-[#052447] rounded-xl sm:rounded-2xl border border-[#04213d] shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">
                        Destaque &amp; Gargalo
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0">
                        <Sparkles size={14} />
                      </div>
                    </div>
                    {indicators.bestStep && (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-300 font-semibold mb-1">
                        <Trophy size={13} className="shrink-0" />
                        <span className="truncate">
                          {indicators.bestStep.title} ({indicators.bestStep.completionPercent}%)
                        </span>
                      </p>
                    )}
                    {indicators.worstStep && (
                      <p className="flex items-center gap-1.5 text-xs text-rose-300 font-semibold">
                        <Flame size={13} className="shrink-0" />
                        <span className="truncate">
                          {indicators.worstStep.title} ({indicators.worstStep.completionPercent}%)
                        </span>
                      </p>
                    )}
                    {!indicators.bestStep && !indicators.worstStep && (
                      <p className="text-xs text-white/40">Nenhuma etapa cadastrada.</p>
                    )}
                  </div>
                </div>

                {viewMode === 'charts' && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
                    <div className="bg-slate-100 rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                          <BarChart3 size={15} className="text-[#052447]" />
                          Conclusão por Etapa do Trilho
                        </h3>
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
                      {indicators.steps.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">Nenhuma etapa do trilho cadastrada.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={Math.max(260, indicators.steps.length * 34)}>
                          <BarChart data={indicators.steps} layout="vertical" margin={{ left: 8, right: 24 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                            <YAxis
                              type="category"
                              dataKey="title"
                              width={140}
                              tick={{ fontSize: 11, fill: '#475569' }}
                            />
                            <Tooltip
                              formatter={(value: any, _name, item: any) => [
                                `${value}% (${item.payload.completionCount} de ${indicators.totalMembers})`,
                                'Conclusão',
                              ]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                            <Bar dataKey="completionPercent" radius={[0, 6, 6, 0]} barSize={16}>
                              {indicators.steps.map((s) => (
                                <RechartsCell key={s.id} fill={colorForPercent(s.completionPercent)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="bg-slate-100 rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-4">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3">
                        <Users size={15} className="text-[#052447]" />
                        Distribuição do Trilho
                      </h3>
                      <div className="relative">
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={distributionData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={65}
                              outerRadius={100}
                              paddingAngle={2}
                            >
                              {distributionData.map((d) => (
                                <RechartsCell key={d.name} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: any, name: any) => [`${value} membro(s)`, name]}
                              contentStyle={{ fontSize: 12, borderRadius: 8 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-xl font-black text-slate-900">{indicators.totalMembers}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">Membros</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3 mt-2">
                        {distributionData.map((d) => (
                          <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                            {d.name} ({d.value})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {viewMode === 'compare' && (
                  <div className="bg-slate-100 rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3">
                      <GitCompareArrows size={15} className="text-[#052447]" />
                      Comparativo entre {compareLevelName || 'Unidades'}
                    </h3>
                    {indicators.compareUnits.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">
                        Nenhuma unidade de {compareLevelName?.toLowerCase() || 'comparação'} cadastrada neste escopo.
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(260, indicators.compareUnits.length * 36)}>
                        <BarChart data={indicators.compareUnits} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: '#475569' }} />
                          <Tooltip
                            formatter={(value: any, _name, item: any) => [
                              `${value}% · ${item.payload.totalMembers} membro(s)`,
                              'Média do trilho',
                            ]}
                            contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          />
                          <Bar dataKey="avgCompletionPercent" radius={[0, 6, 6, 0]} barSize={16} fill="#052447" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};
