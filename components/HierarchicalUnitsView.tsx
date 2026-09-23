'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  CheckCircle2,
  AlertCircle,
  Users,
  ChevronRight,
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  MapPin,
  Loader2,
  Search,
  Sparkles,
  Info,
  ShieldCheck,
  Check,
  UserCheck,
  UserPlus,
  Compass,
  Lock,
  X,
} from 'lucide-react';
import {
  ChurchHierarchicalLevel,
  OrganizationalUnit,
  UserProfile,
  CellMember,
  UserRole,
} from '../types';
import { AppChurchService } from '../lib/supabase';

interface HierarchicalUnitsViewProps {
  user: UserProfile;
  initialLevelIndex?: number;
  targetChurchId?: string;
  targetChurchName?: string;
  onNavigateOverview?: () => void;
  onNavigatePool?: () => void;
}

export const HierarchicalUnitsView: React.FC<HierarchicalUnitsViewProps> = ({
  user,
  initialLevelIndex = 0,
  targetChurchId,
  targetChurchName,
  onNavigateOverview,
  onNavigatePool,
}) => {
  const effectiveChurchId = targetChurchId || user.churchId;
  const effectiveChurchName = targetChurchName || user.churchName || 'Igreja';

  const [levels, setLevels] = useState<ChurchHierarchicalLevel[]>([]);
  const [activeLevelId, setActiveLevelId] = useState<string>('');
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [churchMembers, setChurchMembers] = useState<CellMember[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  // Modal para cadastro rápido de novos líderes desta congregação
  const [isAddLeaderModalOpen, setIsAddLeaderModalOpen] = useState(false);
  const [newLeaderName, setNewLeaderName] = useState('');
  const [newLeaderRole, setNewLeaderRole] = useState<UserRole>('Líder de Célula');
  const [newLeaderPhone, setNewLeaderPhone] = useState('');
  const [newLeaderEmail, setNewLeaderEmail] = useState('');
  const [isSavingLeader, setIsSavingLeader] = useState(false);
  const [leaderAddError, setLeaderAddError] = useState('');

  // Modal de Vinculação Direta de Líderes para Unidades Existentes
  const [isBindLeaderModalOpen, setIsBindLeaderModalOpen] = useState<boolean>(false);
  const [unitToBindLeaders, setUnitToBindLeaders] = useState<OrganizationalUnit | null>(null);
  const [bindLeaderSelectedIds, setBindLeaderSelectedIds] = useState<string[]>([]);
  const [bindLeaderSearchTerm, setBindLeaderSearchTerm] = useState<string>('');
  const [isBindingLeaders, setIsBindingLeaders] = useState<boolean>(false);
  const [bindLeaderError, setBindLeaderError] = useState<string>('');

  // Form states
  const [unitName, setUnitName] = useState<string>('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<string[]>([]);
  const [createAnother, setCreateAnother] = useState<boolean>(false);

  // Leaf level specific fields
  const [neighborhood, setNeighborhood] = useState<string>('Centro');
  const [address, setAddress] = useState<string>('');
  const [meetingDay, setMeetingDay] = useState<string>('Quarta-feira');
  const [meetingTime, setMeetingTime] = useState<string>('19:30');

  // Search filter for unit list
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Regra de Desbloqueio: Nível 0 é livre; Nível N só é liberado se o Nível N-1 já tiver pelo menos 1 unidade criada
  const isLevelUnlocked = (index: number) => {
    if (index === 0) return true;
    const parentLvl = levels[index - 1];
    if (!parentLvl) return false;
    return units.some((u) => u.levelTypeId === parentLvl.id);
  };

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [fetchedLevels, fetchedUnits, fetchedMembers] = await Promise.all([
          AppChurchService.getChurchLevels(effectiveChurchId),
          AppChurchService.getUnits(effectiveChurchId),
          AppChurchService.getMembers(effectiveChurchId),
        ]);

        if (!isMounted) return;
        setLevels(fetchedLevels);
        setUnits(fetchedUnits);
        setChurchMembers(fetchedMembers);

        if (fetchedLevels.length > 0) {
          // Garante que não inicia num nível bloqueado
          let targetIndex = Math.min(initialLevelIndex, fetchedLevels.length - 1);
          while (targetIndex > 0) {
            const prevLvl = fetchedLevels[targetIndex - 1];
            const prevUnitsCount = fetchedUnits.filter((u) => u.levelTypeId === prevLvl.id).length;
            if (prevUnitsCount > 0) break;
            targetIndex--;
          }
          setActiveLevelId(fetchedLevels[targetIndex].id);
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados de hierarquia:', err);
        if (isMounted) {
          setErrorMessage(
            err?.message || 'Falha ao carregar níveis e unidades organizacionais.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [effectiveChurchId, initialLevelIndex]);

  // Nível ativo atual
  const activeLevel = useMemo(() => {
    return levels.find((l) => l.id === activeLevelId) || levels[0];
  }, [levels, activeLevelId]);

  const activeLevelIndex = useMemo(() => {
    return levels.findIndex((l) => l.id === activeLevelId);
  }, [levels, activeLevelId]);

  const isRootLevel = activeLevelIndex === 0;
  const isLeafLevel = activeLevelIndex === levels.length - 1;

  // Nível pai imediato
  const parentLevel = useMemo(() => {
    if (activeLevelIndex <= 0) return null;
    return levels[activeLevelIndex - 1];
  }, [levels, activeLevelIndex]);

  // Unidades do nível pai já cadastradas
  const parentUnitsAvailable = useMemo(() => {
    if (!parentLevel) return [];
    return units.filter((u) => u.levelTypeId === parentLevel.id);
  }, [units, parentLevel]);

  // Unidades cadastradas no nível ativo atual
  const currentLevelUnits = useMemo(() => {
    if (!activeLevel) return [];
    const list = units.filter((u) => u.levelTypeId === activeLevel.id);
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        (u.parentName && u.parentName.toLowerCase().includes(term)) ||
        u.leaders.some((l) => l.name.toLowerCase().includes(term)) ||
        (u.neighborhood && u.neighborhood.toLowerCase().includes(term))
    );
  }, [units, activeLevel, searchTerm]);

  // Apenas membros desta igreja específica (Primeiro Ponto do usuário)
  const filteredChurchMembers = useMemo(() => {
    return churchMembers.filter((m) => m.churchId === effectiveChurchId);
  }, [churchMembers, effectiveChurchId]);

  // Filtro de membros da igreja para o modal de vinculação direta de líderes
  const modalFilteredMembers = useMemo(() => {
    if (!bindLeaderSearchTerm.trim()) return filteredChurchMembers;
    const term = bindLeaderSearchTerm.toLowerCase();
    return filteredChurchMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        (m.role && m.role.toLowerCase().includes(term)) ||
        (m.phone && m.phone.includes(term)) ||
        (m.neighborhood && m.neighborhood.toLowerCase().includes(term)) ||
        (m.cellName && m.cellName.toLowerCase().includes(term))
    );
  }, [filteredChurchMembers, bindLeaderSearchTerm]);

  // Pai selecionado efetivo (calculado dinamicamente para evitar cascading renders)
  const effectiveParentId = useMemo(() => {
    if (isRootLevel) return '';
    if (selectedParentId && parentUnitsAvailable.some((p) => p.id === selectedParentId)) {
      return selectedParentId;
    }
    return parentUnitsAvailable[0]?.id || '';
  }, [isRootLevel, selectedParentId, parentUnitsAvailable]);

  const handleSelectLevel = (levelId: string) => {
    setActiveLevelId(levelId);
    setErrorMessage('');
    setSuccessBanner('');
    setUnitName('');
    setSelectedLeaderIds([]);
    setSearchTerm('');
  };

  const handleToggleLeader = (memberId: string) => {
    if (selectedLeaderIds.includes(memberId)) {
      setSelectedLeaderIds(selectedLeaderIds.filter((id) => id !== memberId));
    } else {
      setSelectedLeaderIds([...selectedLeaderIds, memberId]);
    }
  };

  const handleOpenBindLeaderModal = (unit: OrganizationalUnit) => {
    setUnitToBindLeaders(unit);
    setBindLeaderSelectedIds(unit.leaders ? unit.leaders.map((l) => l.id) : []);
    setBindLeaderSearchTerm('');
    setBindLeaderError('');
    setIsBindLeaderModalOpen(true);
  };

  const handleToggleBindLeader = (memberId: string) => {
    setBindLeaderSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSaveUnitLeaders = async () => {
    if (!unitToBindLeaders) return;
    setIsBindingLeaders(true);
    setBindLeaderError('');

    try {
      const result = await AppChurchService.updateUnitLeaders(
        unitToBindLeaders.id,
        effectiveChurchId,
        bindLeaderSelectedIds
      );

      // Atualiza a lista de unidades no estado local
      setUnits((prev) =>
        prev.map((u) => {
          if (u.id === unitToBindLeaders.id) {
            return {
              ...u,
              leaders: result.leaders,
            };
          }
          return u;
        })
      );

      setSuccessBanner(
        result.leaders.length > 0
          ? `${result.leaders.length} líder(es) vinculado(s) com sucesso a "${unitToBindLeaders.name}"!`
          : `Líderes atualizados para "${unitToBindLeaders.name}".`
      );

      setIsBindLeaderModalOpen(false);
      setUnitToBindLeaders(null);
    } catch (err: any) {
      console.error('Erro ao vincular líderes:', err);
      setBindLeaderError(err?.message || 'Falha ao vincular líderes.');
    } finally {
      setIsBindingLeaders(false);
    }
  };

  const handleQuickAddLeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaderName.trim()) {
      setLeaderAddError('Informe o nome do líder.');
      return;
    }

    setIsSavingLeader(true);
    setLeaderAddError('');

    try {
      const added = await AppChurchService.addMember({
        churchId: effectiveChurchId,
        cellId: '',
        name: newLeaderName.trim(),
        role: newLeaderRole,
        neighborhood: 'Centro',
        birthday: '01/01',
        phone: newLeaderPhone.trim(),
        email: newLeaderEmail.trim(),
        attendanceStatus: 'green',
        attendancePercentage: 100,
      });

      setChurchMembers((prev) => [added, ...prev]);
      setSelectedLeaderIds((prev) => [...prev, added.id]);
      if (unitToBindLeaders) {
        setBindLeaderSelectedIds((prev) => [...prev, added.id]);
      }
      setNewLeaderName('');
      setNewLeaderPhone('');
      setNewLeaderEmail('');
      setIsAddLeaderModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao adicionar líder:', err);
      setLeaderAddError(err?.message || 'Falha ao cadastrar líder.');
    } finally {
      setIsSavingLeader(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessBanner('');

    if (!unitName.trim()) {
      setErrorMessage(`Informe o nome do(a) ${activeLevel.name}.`);
      return;
    }

    const parentIdToUse = isRootLevel ? null : (selectedParentId || effectiveParentId || null);

    if (!isRootLevel && !parentIdToUse) {
      setErrorMessage(
        `Selecione o(a) ${parentLevel?.name || 'nível superior'} ao qual este(a) ${
          activeLevel.name
        } pertence.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedLeaders = filteredChurchMembers.filter((m) =>
        selectedLeaderIds.includes(m.id)
      );

      const createdUnit = await AppChurchService.createUnit({
        churchId: effectiveChurchId,
        levelTypeId: activeLevel.id,
        name: unitName.trim(),
        parentId: parentIdToUse,
        leaderMemberIds: selectedLeaderIds,
        leaderNames: selectedLeaders.map((l) => l.name),
        neighborhood: isLeafLevel ? neighborhood.trim() : undefined,
        address: isLeafLevel ? address.trim() : undefined,
        meetingDay: isLeafLevel ? meetingDay : undefined,
        meetingTime: isLeafLevel ? meetingTime : undefined,
      });

      // Atualiza lista de unidades no estado local
      setUnits((prev) => [createdUnit, ...prev]);

      setSuccessBanner(
        `${activeLevel.name} "${createdUnit.name}" cadastrado(a) com sucesso!`
      );

      if (createAnother) {
        // Mantém o mesmo pai selecionado e limpa campos específicos
        setUnitName('');
        setSelectedLeaderIds([]);
        if (isLeafLevel) {
          setAddress('');
        }
      } else {
        // Limpa tudo
        setUnitName('');
        setSelectedLeaderIds([]);
        if (isLeafLevel) {
          setAddress('');
        }
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar unidade:', err);
      setErrorMessage(err?.message || 'Falha ao salvar unidade organizacional.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 size={36} className="animate-spin text-[#052447] mb-3" />
        <p className="text-sm font-semibold">Carregando estrutura organizacional da igreja...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header com Contexto da Igreja */}
      <div className="bg-[#04213d] text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Layers size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                Gestão Estrutural
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-medium">
                {user.churchName}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Cadastro de Níveis Organizacionais
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Defina as unidades da igreja seguindo a hierarquia configurada
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateOverview && (
            <button
              type="button"
              onClick={onNavigateOverview}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-white/10"
            >
              <Compass size={14} />
              <span>Ver Organograma</span>
            </button>
          )}
          {onNavigatePool && (
            <button
              type="button"
              onClick={onNavigatePool}
              className="px-3.5 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-sky-400/30"
            >
              <Users size={14} />
              <span>Pool Geral de Membros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs dinâmicas de Nível — Mostra EXATAMENTE os níveis definidos para esta igreja */}
      <div className="bg-white rounded-2xl p-2 shadow-xs border border-slate-200/80 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {levels.map((lvl, index) => {
            const isActive = lvl.id === activeLevelId;
            const count = units.filter((u) => u.levelTypeId === lvl.id).length;
            const isFirst = index === 0;
            const isLast = index === levels.length - 1;
            const isUnlocked = isLevelUnlocked(index);

            return (
              <button
                key={lvl.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => isUnlocked && handleSelectLevel(lvl.id)}
                title={
                  !isUnlocked
                    ? `Nível bloqueado: cadastre pelo menos um(a) ${levels[index - 1]?.name} antes.`
                    : undefined
                }
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                  !isUnlocked
                    ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200'
                    : isActive
                    ? 'bg-[#052447] text-white shadow-sm cursor-pointer'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                {!isUnlocked ? (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
                    <Lock size={11} />
                  </div>
                ) : (
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isActive
                        ? 'bg-sky-400 text-[#04213d]'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {index + 1}
                  </div>
                )}
                <span>{lvl.name}</span>
                {isUnlocked && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600 font-normal'
                    }`}
                  >
                    {count} {count === 1 ? 'unidade' : 'unidades'}
                  </span>
                )}
                {isLast && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                      !isUnlocked
                        ? 'bg-slate-200 text-slate-500'
                        : isActive
                        ? 'bg-emerald-400/30 text-emerald-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    Célula
                  </span>
                )}
                {index < levels.length - 1 && (
                  <ChevronRight size={14} className="text-slate-300 ml-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alerta de Feedback de Sucesso */}
      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-3 cursor-pointer"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Regra de Dependência Pai: Se o nível exige pai e não há nenhum pai criado ainda */}
      {!isRootLevel && parentUnitsAvailable.length === 0 ? (
        <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-6 sm:p-8 text-center max-w-2xl mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4 border border-amber-300">
            <AlertCircle size={30} />
          </div>
          <h2 className="text-lg font-bold text-amber-950 mb-2">
            Nenhum(a) {parentLevel?.name} cadastrado(a) ainda
          </h2>
          <p className="text-xs sm:text-sm text-amber-800 leading-relaxed max-w-lg mx-auto mb-5">
            A estrutura hierárquica exige que cada <strong>{activeLevel.name}</strong> seja
            vinculado(a) a um(a) <strong>{parentLevel?.name}</strong> imediatamente acima.
            Para manter a integridade da igreja, cadastre pelo menos um(a) {parentLevel?.name}{' '}
            primeiro.
          </p>
          <button
            type="button"
            onClick={() => parentLevel && handleSelectLevel(parentLevel.id)}
            className="px-5 py-2.5 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            <span>Cadastrar {parentLevel?.name} Agora</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Formulário de Cadastro do Nível Atual */}
          <div className="lg:col-span-6 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-black text-sm">
                  {activeLevelIndex + 1}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Novo(a) {activeLevel.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isRootLevel
                      ? 'Nível mais alto da hierarquia (sem unidade pai)'
                      : `Vinculado(a) diretamente a um(a) ${parentLevel?.name}`}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                Ordem {activeLevel.order}
              </span>
            </div>

            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Seleção de Pai (obrigatório para níveis não-raiz) */}
              {!isRootLevel && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {parentLevel?.name} Responsável (Unidade Pai) *
                  </label>
                  <select
                    required
                    value={effectiveParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 cursor-pointer"
                  >
                    {parentUnitsAvailable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{' '}
                        {p.leaders && p.leaders.length > 0
                          ? `(Líder: ${p.leaders.map((l) => l.name).join(', ')})`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Este(a) {activeLevel.name} ficará subordinado(a) ao(à){' '}
                    {parentLevel?.name} selecionado(a).
                  </p>
                </div>
              )}

              {/* Nome da Unidade */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nome do(a) {activeLevel.name} *
                </label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder={
                    isLeafLevel
                      ? 'Ex: Célula Betel, Ágape, Filadélfia'
                      : `Ex: ${activeLevel.name} Norte, ${activeLevel.name} Central`
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800"
                />
              </div>

              {/* Múltiplos Líderes da Unidade (Exclusivo para membros desta igreja) */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      Líderes do(a) {activeLevel.name}
                    </label>
                    <span className="text-[10px] text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                      Membros de {effectiveChurchName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {selectedLeaderIds.length}{' '}
                      {selectedLeaderIds.length === 1 ? 'selecionado' : 'selecionados'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderAddError('');
                        setIsAddLeaderModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-sky-800 hover:text-sky-950 flex items-center gap-1 cursor-pointer bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-300 transition"
                    >
                      <Plus size={13} />
                      <span>Cadastrar Líder</span>
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/70 space-y-1">
                  {filteredChurchMembers.length === 0 ? (
                    <div className="p-4 text-center space-y-2">
                      <p className="text-xs text-slate-500 font-medium">
                        Nenhum membro cadastrado em <strong>{effectiveChurchName}</strong> ainda.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLeaderAddError('');
                          setIsAddLeaderModalOpen(true);
                        }}
                        className="text-xs font-bold text-sky-800 hover:text-sky-950 inline-flex items-center gap-1.5 underline cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Cadastrar líder para {effectiveChurchName}</span>
                      </button>
                    </div>
                  ) : (
                    filteredChurchMembers.map((member) => {
                      const isSelected = selectedLeaderIds.includes(member.id);
                      return (
                        <div
                          key={member.id}
                          onClick={() => handleToggleLeader(member.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition ${
                            isSelected
                              ? 'bg-sky-50 border border-sky-300 text-sky-950 font-bold shadow-2xs'
                              : 'hover:bg-white text-slate-700 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] transition ${
                                isSelected
                                  ? 'bg-[#052447] text-white border-[#052447]'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800">{member.name}</span>
                              {member.phone && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  {member.phone}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-md bg-slate-100">
                            {member.role || 'Membro'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Permite duplas de liderança (ex: casal de líderes, vice-líder). Apenas membros desta igreja são listados.
                </p>
              </div>

              {/* Campos específicos da CÉLULA (nível folha) */}
              {isLeafLevel && (
                <div className="pt-2 border-t border-slate-100 space-y-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    <MapPin size={14} />
                    <span>Detalhes de Reunião da Célula</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Ex: Centro ou Jardim Europa"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Endereço Completo
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Rua, número, complemento"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Dia da Reunião
                      </label>
                      <select
                        value={meetingDay}
                        onChange={(e) => setMeetingDay(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                      >
                        <option value="Segunda-feira">Segunda-feira</option>
                        <option value="Terça-feira">Terça-feira</option>
                        <option value="Quarta-feira">Quarta-feira</option>
                        <option value="Quinta-feira">Quinta-feira</option>
                        <option value="Sexta-feira">Sexta-feira</option>
                        <option value="Sábado">Sábado</option>
                        <option value="Domingo">Domingo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Horário da Reunião
                      </label>
                      <input
                        type="text"
                        value={meetingTime}
                        onChange={(e) => setMeetingTime(e.target.value)}
                        placeholder="Ex: 19:30"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Opção de "Criar e adicionar outro" para cadastro ágil em lote */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 p-2.5 rounded-xl border border-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={createAnother}
                    onChange={(e) => setCreateAnother(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-800 focus:ring-sky-700 cursor-pointer"
                  />
                  <span>
                    Criar e adicionar outro(a) {activeLevel.name} mantendo o mesmo pai
                    selecionado
                  </span>
                </label>
              </div>

              {/* Botão de Submissão */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Cadastrando {activeLevel.name}...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Salvar {activeLevel.name}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Listagem de Unidades já cadastradas neste nível */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeLevel.name}s Cadastrados(as)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total de {currentLevelUnits.length}{' '}
                    {currentLevelUnits.length === 1 ? 'registro' : 'registros'} neste nível
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                  {currentLevelUnits.length}
                </div>
              </div>

              {/* Barra de Pesquisa */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar ${activeLevel.name.toLowerCase()} por nome, líder ou pai...`}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              {/* Lista */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {currentLevelUnits.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    <Building2 size={32} className="mx-auto text-slate-300 mb-2" />
                    <p>Nenhum(a) {activeLevel.name} encontrado(a).</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Preencha o formulário ao lado para cadastrar o primeiro.
                    </p>
                  </div>
                ) : (
                  currentLevelUnits.map((unit) => (
                    <div
                      key={unit.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/80 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">
                            {unit.name}
                          </h4>
                          {!isRootLevel && unit.parentName && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <span>Subordinado a:</span>
                              <strong className="text-slate-700 font-semibold">
                                {unit.parentName}
                              </strong>
                            </p>
                          )}
                        </div>

                        {isLeafLevel && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                            {unit.memberCount || 0}{' '}
                            {unit.memberCount === 1 ? 'membro' : 'membros'}
                          </span>
                        )}
                      </div>

                      {/* Líderes / Opção de Vincular Líderes */}
                      {unit.leaders && unit.leaders.length > 0 ? (
                        <div className="pt-2 border-t border-slate-200/70 mt-1">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-medium">
                                Líder(es):
                              </span>
                              {unit.leaders.map((ldr) => (
                                <span
                                  key={ldr.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white text-[11px] font-semibold text-slate-700 border border-slate-200 shadow-2xs"
                                >
                                  <UserCheck size={11} className="text-sky-700" />
                                  <span>{ldr.name}</span>
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenBindLeaderModal(unit)}
                              className="text-[11px] font-bold text-sky-800 hover:text-sky-950 flex items-center gap-1 cursor-pointer bg-sky-50 hover:bg-sky-100 px-2.5 py-1 rounded-lg border border-sky-200 transition shrink-0 self-start sm:self-auto"
                            >
                              <UserCheck size={12} />
                              <span>Alterar Líderes</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2">
                          <div className="p-2.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                              <div>
                                <span className="text-xs font-bold text-amber-900 block">
                                  Sem líder vinculado
                                </span>
                                <span className="text-[10px] text-amber-700">
                                  Vincule um ou mais líderes para este(a) {activeLevel.name.toLowerCase()}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenBindLeaderModal(unit)}
                              className="px-3 py-1.5 bg-[#052447] hover:bg-[#073366] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                            >
                              <UserPlus size={13} />
                              <span>Vincular Líder</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Dados adicionais para célula */}
                      {isLeafLevel && (
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-slate-500 border-t border-slate-200/60 mt-1.5">
                          {unit.meetingDay && (
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {unit.meetingDay} {unit.meetingTime ? `às ${unit.meetingTime}` : ''}
                            </span>
                          )}
                          {unit.neighborhood && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {unit.neighborhood}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Cadastro Ágil de Líder para esta Igreja */}
      {isAddLeaderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Cadastrar Novo Líder
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Igreja: {effectiveChurchName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddLeaderModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickAddLeader} className="p-5 space-y-4">
              {leaderAddError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{leaderAddError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Líder *
                </label>
                <input
                  type="text"
                  required
                  value={newLeaderName}
                  onChange={(e) => setNewLeaderName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cargo / Função
                  </label>
                  <select
                    value={newLeaderRole}
                    onChange={(e) => setNewLeaderRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                  >
                    <option value="Líder de Célula">Líder de Célula</option>
                    <option value="Líder de Setor">Líder de Setor</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Pastor">Pastor</option>
                    <option value="Líder em Treinamento">Líder em Treinamento</option>
                    <option value="Membro">Membro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={newLeaderPhone}
                    onChange={(e) => setNewLeaderPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  value={newLeaderEmail}
                  onChange={(e) => setNewLeaderEmail(e.target.value)}
                  placeholder="lider@exemplo.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddLeaderModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingLeader}
                  className="px-5 py-2.5 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-2 cursor-pointer disabled:opacity-75"
                >
                  {isSavingLeader ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Salvar e Selecionar Líder</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vincular Líderes a uma Unidade Organizacional Existente */}
      {isBindLeaderModalOpen && unitToBindLeaders && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <UserPlus size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-200 px-2 py-0.5 rounded">
                      {activeLevel.name}
                    </span>
                    <span className="text-xs text-slate-300">•</span>
                    <span className="text-xs text-slate-300">{effectiveChurchName}</span>
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                    Vincular Líderes: {unitToBindLeaders.name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsBindLeaderModalOpen(false);
                  setUnitToBindLeaders(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {bindLeaderError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{bindLeaderError}</span>
                </div>
              )}

              {/* Informação & Quick Add Leader */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-sky-50/70 border border-sky-100 p-3 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-sky-950">
                    Selecione um ou mais líderes
                  </p>
                  <p className="text-[11px] text-sky-800">
                    Permite liderança individual, em dupla ou equipe de co-líderes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLeaderAddError('');
                    setIsAddLeaderModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer shrink-0"
                >
                  <Plus size={13} />
                  <span>Novo Líder</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={bindLeaderSearchTerm}
                  onChange={(e) => setBindLeaderSearchTerm(e.target.value)}
                  placeholder="Buscar membro por nome, cargo ou telefone..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              {/* Contador & Selecionados */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Membros da Igreja ({modalFilteredMembers.length}):
                </span>
                <span className="font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                  {bindLeaderSelectedIds.length}{' '}
                  {bindLeaderSelectedIds.length === 1 ? 'selecionado' : 'selecionados'}
                </span>
              </div>

              {/* Chips dos selecionados */}
              {bindLeaderSelectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                  {bindLeaderSelectedIds.map((id) => {
                    const mem = churchMembers.find((m) => m.id === id);
                    if (!mem) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-sky-300 rounded-lg text-xs font-bold text-sky-950 shadow-2xs"
                      >
                        <UserCheck size={12} className="text-sky-700" />
                        <span>{mem.name}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleBindLeader(id)}
                          className="ml-1 text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Lista de Membros */}
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl p-1.5 bg-slate-50/50 space-y-1">
                {modalFilteredMembers.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <p className="text-xs text-slate-500 font-medium">
                      Nenhum membro encontrado com os critérios de busca.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLeaderAddError('');
                        setIsAddLeaderModalOpen(true);
                      }}
                      className="text-xs font-bold text-sky-800 hover:text-sky-950 inline-flex items-center gap-1.5 underline cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Cadastrar novo líder para esta igreja</span>
                    </button>
                  </div>
                ) : (
                  modalFilteredMembers.map((member) => {
                    const isSelected = bindLeaderSelectedIds.includes(member.id);
                    return (
                      <div
                        key={member.id}
                        onClick={() => handleToggleBindLeader(member.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition select-none ${
                          isSelected
                            ? 'bg-sky-50 border border-sky-300 text-sky-950 font-bold shadow-2xs'
                            : 'hover:bg-white text-slate-700 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 transition ${
                              isSelected
                                ? 'bg-[#052447] text-white border-[#052447]'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-slate-800 truncate">
                              {member.name}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-normal">
                              {member.phone && <span>{member.phone}</span>}
                              {member.cellName && (
                                <span className="truncate">• {member.cellName}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-600 font-medium px-2 py-0.5 rounded-md bg-slate-100 shrink-0">
                          {member.role || 'Membro'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {bindLeaderSelectedIds.length === 0
                  ? 'Nenhum líder selecionado'
                  : `${bindLeaderSelectedIds.length} líder(es) selecionado(s)`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBindLeaderModalOpen(false);
                    setUnitToBindLeaders(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isBindingLeaders}
                  onClick={handleSaveUnitLeaders}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-75"
                >
                  {isBindingLeaders ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Salvar Líderes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
