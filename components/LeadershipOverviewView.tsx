'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CellMember, CellGroup, TrackStep, UserProfile, AttendanceStatus } from '../types';
import { INITIAL_TRACK_STEPS } from '../data/initialData';
import { AppChurchService } from '../lib/supabase';
import {
  Network,
  Layers,
  Search,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  Award,
  BookOpen,
  UserCheck,
  Calendar,
  AlertCircle,
  Filter,
  CheckSquare,
  Square,
  Check,
  Loader2,
} from 'lucide-react';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';

interface LeadershipOverviewViewProps {
  members: CellMember[];
  currentCell: CellGroup;
  currentUser?: UserProfile | null;
  cells?: CellGroup[];
  onSelectCell?: (cellId: string) => void;
  onOpenMemberTrack: (member: CellMember) => void;
}

export const LeadershipOverviewView: React.FC<LeadershipOverviewViewProps> = ({
  members,
  currentCell,
  currentUser,
  cells = [],
  onSelectCell,
  onOpenMemberTrack,
}) => {
  const [stages, setStages] = useState<TrackStep[]>(INITIAL_TRACK_STEPS);
  const [selectedCellIdOverride, setSelectedCellIdOverride] = useState<string | null>(null);
  const selectedCellIdState = selectedCellIdOverride ?? (currentCell?.id || 'todas');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('todos');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStagesGuide, setShowStagesGuide] = useState(false);
  const [memberStepsStatusMap, setMemberStepsStatusMap] = useState<
    Record<string, Record<string, { completed: boolean; completedAt?: string }>>
  >({});
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);

  // Seleção e conclusão em lote de etapas
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);
  const [batchErrorMessage, setBatchErrorMessage] = useState<string | null>(null);

  const isBatchModeActive = selectedStageFilter !== 'all' && selectedStatusFilter === 'pending';

  // Carrega catálogo de etapas cadastradas para a congregação
  useEffect(() => {
    let isMounted = true;
    async function loadStages() {
      try {
        const churchId = currentUser?.churchId || currentCell?.churchId;
        const steps = await AppChurchService.getTrackSteps(churchId);
        if (isMounted && steps && steps.length > 0) {
          setStages(steps);
        }
      } catch (e) {
        console.warn('Erro ao carregar etapas do trilho:', e);
      }
    }
    loadStages();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.churchId, currentCell?.churchId]);

  // -------------------------------------------------------------
  // CONTROLE DO BLOCO DE NAVEGAÇÃO HIERÁRQUICA
  // Regra solicitada:
  // "onde os filtro só serão mostrado mediante o nível que o usuário,
  // se o usuário for apenas um líder de celula, não precisa nem mostrar
  // a menos que esteja na liderança de mais de uma célula."
  // -------------------------------------------------------------
  const isCellLeaderRole = useMemo(() => {
    if (!currentUser) return false;
    return (
      currentUser.role === 'Líder de Célula' ||
      currentUser.role === 'Líder em Treinamento' ||
      currentUser.role === 'Membro'
    );
  }, [currentUser]);

  const isSectorLeaderRole = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'Líder de Setor' && !currentUser.isSystemAdmin;
  }, [currentUser]);

  const isPrivilegedOrPastor = useMemo(() => {
    if (!currentUser) return true;
    const privilegedRoles = ['Pastor', 'Supervisor', 'Administrador'];
    return (
      privilegedRoles.includes(currentUser.role) ||
      !!currentUser.isPrivileged ||
      !!currentUser.isSystemAdmin
    );
  }, [currentUser]);

  // Identifica células lideradas pelo usuário
  const userLedCells = useMemo(() => {
    if (!cells || cells.length === 0 || !currentUser) return [];
    const userNameNorm = currentUser.name.toLowerCase().trim();
    return cells.filter((c) => {
      const leaderNorm = (c.leaderName || '').toLowerCase().trim();
      return (
        leaderNorm.includes(userNameNorm) ||
        userNameNorm.includes(leaderNorm) ||
        c.id === currentUser.currentCellId
      );
    });
  }, [cells, currentUser]);

  // Se o usuário lidera mais de uma célula
  const hasMultipleLedCells = userLedCells.length > 1;

  // Decisão se exibe ou não o bloco de navegação hierárquica
  const showHierarchicalBlock = useMemo(() => {
    if (isCellLeaderRole) {
      // Se for apenas líder de célula, não precisa nem mostrar a menos que esteja na liderança de mais de uma célula
      return hasMultipleLedCells;
    }
    if (isSectorLeaderRole) {
      return true;
    }
    if (isPrivilegedOrPastor) {
      return cells && cells.length > 1;
    }
    return false;
  }, [isCellLeaderRole, hasMultipleLedCells, isSectorLeaderRole, isPrivilegedOrPastor, cells]);

  // Setores únicos disponíveis
  const availableSectors = useMemo(() => {
    if (!cells || cells.length === 0) return [];
    const set = new Set<string>();
    cells.forEach((c) => {
      const sec = c.sectorName?.trim();
      set.add(sec || 'Geral');
    });
    return Array.from(set).sort();
  }, [cells]);

  // Células acessíveis baseadas no setor selecionado / papel do usuário
  const accessibleCells = useMemo(() => {
    if (!cells || cells.length === 0) return currentCell ? [currentCell] : [];

    // Para Líder de Célula com múltiplas células
    if (isCellLeaderRole && hasMultipleLedCells) {
      return userLedCells;
    }

    // Para Líder de Setor
    if (isSectorLeaderRole) {
      const userSector = (currentUser?.sector || '').trim().toLowerCase();
      const filtered = cells.filter((c) => {
        const sec = (c.sectorName || 'Geral').trim().toLowerCase();
        return userSector
          ? sec === userSector || sec.includes(userSector) || userSector.includes(sec)
          : true;
      });
      return filtered.length > 0 ? filtered : cells;
    }

    // Para Pastor / Supervisor / Administrador
    if (selectedSectorFilter !== 'todos') {
      const filtered = cells.filter(
        (c) => (c.sectorName || 'Geral') === selectedSectorFilter
      );
      return filtered.length > 0 ? filtered : cells;
    }

    return cells;
  }, [
    cells,
    currentCell,
    isCellLeaderRole,
    hasMultipleLedCells,
    userLedCells,
    isSectorLeaderRole,
    currentUser?.sector,
    selectedSectorFilter,
  ]);

  // Membros referentes ao nível selecionado na navegação hierárquica
  const levelMembers = useMemo(() => {
    let list = members;

    // Filtra por congregação/igreja
    if (currentUser?.churchId) {
      list = list.filter((m) => m.churchId === currentUser.churchId);
    }

    // Caso 1: Líder de Célula simples (1 célula)
    if (isCellLeaderRole && !hasMultipleLedCells) {
      const cellIdToUse = currentCell?.id || userLedCells[0]?.id;
      return list.filter((m) => m.cellId === cellIdToUse);
    }

    // Caso 2: Líder de Célula com mais de uma célula
    if (isCellLeaderRole && hasMultipleLedCells) {
      if (selectedCellIdState && selectedCellIdState !== 'todas') {
        return list.filter((m) => m.cellId === selectedCellIdState);
      }
      const ledIds = new Set(userLedCells.map((c) => c.id));
      return list.filter((m) => ledIds.has(m.cellId));
    }

    // Caso 3: Líder de Setor
    if (isSectorLeaderRole) {
      if (selectedCellIdState && selectedCellIdState !== 'todas') {
        return list.filter((m) => m.cellId === selectedCellIdState);
      }
      const sectorCellIds = new Set(accessibleCells.map((c) => c.id));
      return list.filter((m) => sectorCellIds.has(m.cellId));
    }

    // Caso 4: Pastor / Supervisor / Administrador
    if (selectedCellIdState && selectedCellIdState !== 'todas') {
      return list.filter((m) => m.cellId === selectedCellIdState);
    }
    if (selectedSectorFilter !== 'todos') {
      const sectorCellIds = new Set(
        cells
          .filter((c) => (c.sectorName || 'Geral') === selectedSectorFilter)
          .map((c) => c.id)
      );
      return list.filter((m) => sectorCellIds.has(m.cellId));
    }

    return list;
  }, [
    members,
    currentUser,
    isCellLeaderRole,
    hasMultipleLedCells,
    currentCell?.id,
    userLedCells,
    selectedCellIdState,
    isSectorLeaderRole,
    accessibleCells,
    selectedSectorFilter,
    cells,
  ]);

  // Carrega status detalhado de cada membro do nível selecionado
  useEffect(() => {
    let isMounted = true;
    async function loadMembersSteps() {
      if (levelMembers.length === 0) return;
      setIsLoadingSteps(true);
      try {
        const memberIds = levelMembers.map((m) => m.id);
        const map = await AppChurchService.getMembersTrackStatusMap(
          memberIds,
          currentUser?.churchId
        );
        if (isMounted) {
          setMemberStepsStatusMap(map);
        }
      } catch (err) {
        console.warn('Erro ao carregar mapa de etapas:', err);
      } finally {
        if (isMounted) {
          setIsLoadingSteps(false);
        }
      }
    }
    loadMembersSteps();
    return () => {
      isMounted = false;
    };
  }, [levelMembers, currentUser?.churchId]);

  // Função auxiliar para verificar se uma etapa está concluída para um membro
  const isStepCompleted = useCallback(
    (
      member: CellMember,
      stepId: string | number,
      stepNumber?: number
    ): boolean => {
      // 1. Checa no mapa carregado de member_track_steps / cache local
      const stepRecord = memberStepsStatusMap[member.id]?.[String(stepId)];
      if (stepRecord !== undefined) {
        return stepRecord.completed;
      }
      // 2. Fallback baseado no progresso consolidado do membro
      if (member.trackProgress?.currentStepId) {
        const num = stepNumber || 1;
        return num < member.trackProgress.currentStepId;
      }
      return false;
    },
    [memberStepsStatusMap]
  );

  const getStepCompletedDate = (
    member: CellMember,
    stepId: string | number
  ): string | undefined => {
    return memberStepsStatusMap[member.id]?.[String(stepId)]?.completedAt;
  };

  // -------------------------------------------------------------
  // FILTRAGEM DOS MEMBROS PELOS 2 DROPDOWNS E BUSCA
  // -------------------------------------------------------------
  const filteredMembers = useMemo(() => {
    return levelMembers.filter((member) => {
      // Filtro de busca textual
      if (searchQuery.trim()) {
        const term = searchQuery.toLowerCase().trim();
        const matchesName = member.name.toLowerCase().includes(term);
        const matchesPhone = member.phone && member.phone.includes(term);
        const matchesRole = member.role && member.role.toLowerCase().includes(term);
        if (!matchesName && !matchesPhone && !matchesRole) return false;
      }

      // Dropdown 1: Etapa do Trilho
      if (selectedStageFilter === 'all') {
        const total = stages.length || 6;
        const completedCount = stages.filter((st) =>
          isStepCompleted(member, st.id, st.stepNumber)
        ).length;

        // Dropdown 2: Status
        if (selectedStatusFilter === 'completed') {
          return completedCount === total;
        }
        if (selectedStatusFilter === 'pending') {
          return completedCount < total;
        }
        return true;
      } else {
        const stageObj = stages.find((s) => String(s.id) === selectedStageFilter);
        const completed = isStepCompleted(
          member,
          selectedStageFilter,
          stageObj?.stepNumber
        );

        // Dropdown 2: Status
        if (selectedStatusFilter === 'completed') {
          return completed;
        }
        if (selectedStatusFilter === 'pending') {
          return !completed;
        }
        return true;
      }
    });
  }, [
    levelMembers,
    searchQuery,
    selectedStageFilter,
    selectedStatusFilter,
    stages,
    isStepCompleted,
  ]);

  // Contadores para o resumo visual
  const statsCounts = useMemo(() => {
    let completed = 0;
    let pending = 0;

    levelMembers.forEach((m) => {
      if (selectedStageFilter === 'all') {
        const total = stages.length || 6;
        const cCount = stages.filter((st) =>
          isStepCompleted(m, st.id, st.stepNumber)
        ).length;
        if (cCount === total) completed++;
        else pending++;
      } else {
        const stageObj = stages.find((s) => String(s.id) === selectedStageFilter);
        const isDone = isStepCompleted(m, selectedStageFilter, stageObj?.stepNumber);
        if (isDone) completed++;
        else pending++;
      }
    });

    return {
      total: levelMembers.length,
      completed,
      pending,
    };
  }, [levelMembers, selectedStageFilter, stages, isStepCompleted]);

  // Nome da célula ativa para exibição contextual
  const currentCellName = useMemo(() => {
    if (selectedCellIdState === 'todas') {
      if (isSectorLeaderRole && currentUser?.sector) {
        return `Todas as Células • Setor ${currentUser.sector}`;
      }
      if (selectedSectorFilter !== 'todos') {
        return `Todas as Células • Setor ${selectedSectorFilter}`;
      }
      return 'Todas as Células';
    }
    const match = cells.find((c) => c.id === selectedCellIdState);
    return match ? match.name : currentCell?.name || 'Célula';
  }, [
    selectedCellIdState,
    isSectorLeaderRole,
    currentUser,
    selectedSectorFilter,
    cells,
    currentCell?.name,
  ]);

  const selectedStageObject = useMemo(() => {
    if (selectedStageFilter === 'all') return null;
    return stages.find((s) => String(s.id) === selectedStageFilter) || null;
  }, [selectedStageFilter, stages]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedMemberIds((prev) => {
      if (prev.length === filteredMembers.length && filteredMembers.length > 0) {
        return [];
      } else {
        return filteredMembers.map((m) => m.id);
      }
    });
  }, [filteredMembers]);

  const handleToggleSelectMember = useCallback((memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }, []);

  const handleCompleteBatchStep = async () => {
    if (selectedMemberIds.length === 0 || selectedStageFilter === 'all' || isBatchSaving) return;

    setIsBatchSaving(true);
    setBatchErrorMessage(null);
    try {
      const idsToComplete = [...selectedMemberIds];
      const resolvedChurchId =
        currentUser?.churchId ||
        currentCell?.churchId ||
        levelMembers[0]?.churchId;

      // Mapeia o cellId (unidade_id) exato de cada membro selecionado
      const memberCellMap: Record<string, string> = {};
      [...levelMembers, ...members].forEach((m) => {
        if (m.id && m.cellId && !memberCellMap[m.id]) {
          memberCellMap[m.id] = m.cellId;
        }
      });

      await AppChurchService.batchCompleteStep(
        idsToComplete,
        selectedStageFilter,
        resolvedChurchId,
        currentUser?.name,
        memberCellMap
      );

      // Atualiza imediatamente o mapa local de status das etapas para refletir na interface
      const todayStr = new Date().toLocaleDateString('pt-BR');
      setMemberStepsStatusMap((prev) => {
        const next = { ...prev };
        idsToComplete.forEach((mId) => {
          if (!next[mId]) next[mId] = {};
          next[mId][String(selectedStageFilter)] = {
            completed: true,
            completedAt: todayStr,
          };
        });
        return next;
      });

      const stageTitle = selectedStageObject?.title || 'Etapa selecionada';
      setBatchSuccessMessage(
        `Etapa "${stageTitle}" concluída e confirmada com sucesso no banco para ${idsToComplete.length} ${
          idsToComplete.length === 1 ? 'discípulo' : 'discípulos'
        }!`
      );
      setSelectedMemberIds([]);

      setTimeout(() => {
        setBatchSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao concluir etapa em lote:', err);
      setBatchErrorMessage(
        err?.message || 'Falha ao salvar no banco de dados. Por favor, tente novamente.'
      );
    } finally {
      setIsBatchSaving(false);
    }
  };

  const getAttendanceDot = (status: AttendanceStatus) => {
    switch (status) {
      case 'green':
        return 'bg-emerald-500';
      case 'yellow':
        return 'bg-amber-400';
      case 'red':
        return 'bg-rose-500';
      default:
        return 'bg-slate-800';
    }
  };

  return (
    <div
      id="screen-leadership-track"
      className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none w-full overflow-x-hidden"
    >
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pt-3 sm:pt-4">
        {/* Banner Superior da Tela */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#052447] flex items-center justify-center text-white shrink-0 shadow-xs">
                <LeadershipBadgeIcon className="w-7 h-7 sm:w-8 sm:h-8 text-sky-300" size={28} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                    Discipulado & Formação
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs font-semibold text-slate-600 truncate">
                    {currentUser?.churchName || 'Igreja Local'}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-extrabold text-[#052447] mt-0.5 truncate">
                  Trilho de Liderança • {currentCellName}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Acompanhe a maturidade espiritual e etapas de cada discípulo conforme o nível hierárquico.
                </p>
              </div>
            </div>

            {/* Botão Guia de Etapas do Trilho */}
            <button
              type="button"
              onClick={() => setShowStagesGuide((prev) => !prev)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer self-start sm:self-auto shrink-0"
            >
              <BookOpen size={14} className="text-sky-800" />
              <span>{showStagesGuide ? 'Ocultar Guia' : 'Ver Guia de Etapas'}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${
                  showStagesGuide ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Guia Expansível das Etapas Cadastradas */}
          {showStagesGuide && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 animate-in fade-in duration-150">
              {stages.map((st, idx) => (
                <div
                  key={st.id}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-[#052447] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {st.stepNumber || idx + 1}
                    </span>
                    <h4 className="font-bold text-[#052447] truncate">{st.title}</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{st.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------
            BLOCO DE NAVEGAÇÃO HIERÁRQUICA CONTEXTUAL
            - Se o usuário for apenas um líder de célula, não precisa nem mostrar
              a menos que esteja na liderança de mais de uma célula.
            - Se for Líder de Setor: mostra células do seu setor.
            - Se for Pastor/Supervisor/Admin: seletor de Setor + Célula.
        ------------------------------------------------------------- */}
        {showHierarchicalBlock && (
          <div className="mb-3 px-3 py-2.5 bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 w-full">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#04213d] flex items-center justify-center shrink-0">
                <Network size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-800">
                    {isCellLeaderRole
                      ? 'Suas Células sob Liderança'
                      : isSectorLeaderRole
                      ? 'Seu Setor de Células'
                      : 'Navegação Hierárquica'}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded-md">
                    {currentUser?.role || 'Liderança'}
                  </span>
                  {isSectorLeaderRole && currentUser?.sector && (
                    <span className="text-[10px] bg-sky-50 text-sky-800 font-bold px-1.5 py-0.5 rounded-md border border-sky-200/60 truncate max-w-[130px]">
                      {currentUser.sector}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                  {isCellLeaderRole
                    ? `Você lidera ${userLedCells.length} células. Selecione para alternar o trilho.`
                    : isSectorLeaderRole
                    ? `Células sob sua coordenação (${accessibleCells.length} disponíveis)`
                    : 'Filtre por setor ou célula para visualizar o trilho dos discípulos'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
              {/* Para Pastores/Supervisores/Admin: Seletor de Setor */}
              {isPrivilegedOrPastor && availableSectors.length > 1 && (
                <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 min-w-0">
                  <Layers size={13} className="text-slate-500 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 shrink-0">
                    Setor:
                  </span>
                  <select
                    value={selectedSectorFilter}
                    onChange={(e) => {
                      const newSec = e.target.value;
                      setSelectedSectorFilter(newSec);
                      const cellsInSec =
                        newSec === 'todos'
                          ? cells
                          : cells.filter((c) => (c.sectorName || 'Geral') === newSec);
                      if (cellsInSec.length > 0) {
                        setSelectedCellIdOverride(cellsInSec[0].id);
                        onSelectCell?.(cellsInSec[0].id);
                      } else {
                        setSelectedCellIdOverride('todas');
                      }
                    }}
                    className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer truncate w-full"
                  >
                    <option value="todos">Todos os Setores</option>
                    {availableSectors.map((sec) => (
                      <option key={sec} value={sec}>
                        Setor {sec}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seletor de Célula */}
              <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 shrink-0">
                  Célula:
                </span>
                <select
                  value={selectedCellIdState}
                  onChange={(e) => {
                    const picked = e.target.value;
                    setSelectedCellIdOverride(picked);
                    if (picked !== 'todas') {
                      onSelectCell?.(picked);
                    }
                  }}
                  className="text-xs font-bold text-sky-900 bg-transparent focus:outline-none cursor-pointer truncate w-full max-w-[200px]"
                >
                  {!isCellLeaderRole && <option value="todas">Todas as Células</option>}
                  {accessibleCells.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.leaderName ? `(${c.leaderName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            CONTROLES DE FILTRO DO TRILHO:
            1. Dropdown: Etapa do Trilho
            2. Dropdown: Status (Concluído ou Pendente)
            + Busca por nome
            + Resumo de contagens
        ------------------------------------------------------------- */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs mb-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* 2 Dropdowns solicitados pelo usuário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1">
              {/* Dropdown 1: Etapa do Trilho */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Award size={15} className="text-sky-800 shrink-0" />
                <div className="flex-1 min-w-0">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Etapa do Trilho
                  </label>
                  <select
                    value={selectedStageFilter}
                    onChange={(e) => {
                      setSelectedStageFilter(e.target.value);
                      setSelectedMemberIds([]);
                      setBatchSuccessMessage(null);
                      setBatchErrorMessage(null);
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer truncate"
                  >
                    <option value="all">Todas as Etapas do Trilho</option>
                    {stages.map((st, idx) => (
                      <option key={st.id} value={String(st.id)}>
                        Etapa {st.stepNumber || idx + 1}: {st.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dropdown 2: Status (Concluído ou Pendente) */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                {selectedStatusFilter === 'completed' ? (
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                ) : selectedStatusFilter === 'pending' ? (
                  <Clock size={15} className="text-amber-600 shrink-0" />
                ) : (
                  <Filter size={15} className="text-slate-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Status da Etapa
                  </label>
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => {
                      setSelectedStatusFilter(e.target.value as 'all' | 'completed' | 'pending');
                      setSelectedMemberIds([]);
                      setBatchSuccessMessage(null);
                      setBatchErrorMessage(null);
                    }}
                    className="w-full text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer truncate"
                  >
                    <option value="all">Todos os Status (Concluídos e Pendentes)</option>
                    <option value="completed">Concluído</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Campo de Busca Rápida de Discípulos */}
            <div className="relative w-full lg:w-72">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar discípulo por nome..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
              />
            </div>
          </div>

          {/* Barra de Resumo de Contagens dos Filtros */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 font-medium">Exibindo:</span>
              <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                {filteredMembers.length}{' '}
                {filteredMembers.length === 1 ? 'discípulo' : 'discípulos'}
              </span>
              {selectedStageObject && (
                <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                  {selectedStageObject.title}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                <CheckCircle2 size={12} />
                <span>{statsCounts.completed} Concluídos</span>
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                <Clock size={12} />
                <span>{statsCounts.pending} Pendentes</span>
              </span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            LISTA DE MEMBROS REFERENTE AO NÍVEL SELECIONADO DA NAVEGAÇÃO
        ------------------------------------------------------------- */}
        {/* Barra de Ação em Lote quando Filtrado por Etapa + Pendente */}
        {isBatchModeActive && (
          <>
            {filteredMembers.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-900 to-[#052447] rounded-xl sm:rounded-2xl p-3 sm:p-4 text-white shadow-md mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 border border-white/30 flex items-center justify-center text-white transition cursor-pointer shrink-0"
                    title={
                      selectedMemberIds.length === filteredMembers.length
                        ? 'Desmarcar todos'
                        : 'Selecionar todos'
                    }
                  >
                    {selectedMemberIds.length === filteredMembers.length && filteredMembers.length > 0 ? (
                      <CheckSquare size={16} className="text-emerald-300" />
                    ) : (
                      <Square size={16} className="text-white/70" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-extrabold text-white">
                        Concluir Etapa em Lote
                      </span>
                      {selectedStageObject && (
                        <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold truncate max-w-[200px]">
                          {selectedStageObject.title}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-100/80 mt-0.5">
                      {selectedMemberIds.length === 0
                        ? 'Marque os discípulos abaixo que concluíram esta etapa.'
                        : `${selectedMemberIds.length} de ${filteredMembers.length} discípulo(s) selecionado(s)`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {selectedMemberIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedMemberIds([])}
                      className="text-xs font-semibold text-emerald-200 hover:text-white px-2.5 py-1.5 transition cursor-pointer"
                    >
                      Desmarcar todos
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={selectedMemberIds.length === 0 || isBatchSaving}
                    onClick={handleCompleteBatchStep}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer ${
                      selectedMemberIds.length > 0 && !isBatchSaving
                        ? 'bg-emerald-400 hover:bg-emerald-300 text-[#052447] active:scale-95'
                        : 'bg-white/20 text-white/50 cursor-not-allowed'
                    }`}
                  >
                    {isBatchSaving ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Salvando alterações...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} className="text-[#052447]" />
                        <span>
                          Concluir Etapa {selectedMemberIds.length > 0 ? `(${selectedMemberIds.length})` : ''}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {batchSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl p-3 mb-3 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{batchSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchSuccessMessage(null)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {batchErrorMessage && (
              <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl p-3 mb-3 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{batchErrorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchErrorMessage(null)}
                  className="text-xs font-bold text-rose-700 hover:text-rose-900 px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </>
        )}

        <div className="space-y-3">
          {filteredMembers.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Nenhum discípulo encontrado com estes filtros
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {searchQuery
                    ? `Não foram encontrados membros para o termo "${searchQuery}".`
                    : selectedStatusFilter !== 'all'
                    ? `Não há membros com status "${
                        selectedStatusFilter === 'completed' ? 'Concluído' : 'Pendente'
                      }" para a etapa selecionada neste nível organizacional.`
                    : 'Não há membros cadastrados neste nível organizacional.'}
                </p>
              </div>
              {(selectedStatusFilter !== 'all' ||
                selectedStageFilter !== 'all' ||
                searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatusFilter('all');
                    setSelectedStageFilter('all');
                    setSearchQuery('');
                    setSelectedMemberIds([]);
                    setBatchSuccessMessage(null);
                    setBatchErrorMessage(null);
                  }}
                  className="px-3.5 py-1.5 bg-[#052447] text-white rounded-xl text-xs font-bold hover:bg-[#073366] transition cursor-pointer"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          ) : (
            filteredMembers.map((member) => {
              // Informações do membro na etapa selecionada
              const isDoneForSelectedStage =
                selectedStageFilter !== 'all'
                  ? isStepCompleted(
                      member,
                      selectedStageFilter,
                      selectedStageObject?.stepNumber
                    )
                  : false;

              const stageDoneDate =
                selectedStageFilter !== 'all'
                  ? getStepCompletedDate(member, selectedStageFilter)
                  : undefined;

              // Total de etapas concluídas no geral
              const completedCount = stages.filter((st) =>
                isStepCompleted(member, st.id, st.stepNumber)
              ).length;
              const totalStages = stages.length || 6;
              const progressPercentage = Math.round((completedCount / totalStages) * 100);

              // Célula do membro
              const memberCell = cells.find((c) => c.id === member.cellId);
              const isSelectedForBatch = isBatchModeActive && selectedMemberIds.includes(member.id);

              return (
                <div
                  key={member.id}
                  onClick={() => {
                    if (isBatchModeActive) {
                      handleToggleSelectMember(member.id);
                    } else {
                      onOpenMemberTrack(member);
                    }
                  }}
                  className={`rounded-xl sm:rounded-2xl border transition cursor-pointer px-3.5 py-2.5 sm:px-4 sm:py-3 group ${
                    isSelectedForBatch
                      ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-300 shadow-xs'
                      : 'bg-white border-slate-200/90 shadow-2xs hover:shadow-md hover:border-sky-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
                    {/* Discípulo & Identificação */}
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      {/* Checkbox para seleção em lote */}
                      {isBatchModeActive && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectMember(member.id);
                          }}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 cursor-pointer ${
                            isSelectedForBatch
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                              : 'border-slate-300 bg-white hover:border-emerald-500 text-transparent'
                          }`}
                          title={isSelectedForBatch ? 'Desmarcar' : 'Marcar para concluir'}
                        >
                          <Check
                            size={12}
                            strokeWidth={3}
                            className={isSelectedForBatch ? 'opacity-100' : 'opacity-0'}
                          />
                        </button>
                      )}

                      <div className="relative shrink-0">
                        {member.avatarUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#052447] text-white font-bold text-xs flex items-center justify-center">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span
                          title={`Frequência: ${member.attendanceStatus}`}
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${getAttendanceDot(
                            member.attendanceStatus
                          )}`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-extrabold text-[#052447] group-hover:text-sky-800 transition truncate">
                            {member.name}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                            {member.role || 'Membro'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          {memberCell && (
                            <span className="font-semibold text-slate-700">
                              Célula {memberCell.name}
                            </span>
                          )}
                          {member.phone && <span>• {member.phone}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Status da Etapa Selecionada ou Progresso Geral */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {selectedStageFilter !== 'all' ? (
                        <div className="flex items-center gap-2">
                          {isDoneForSelectedStage ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold shadow-2xs">
                              <CheckCircle2 size={14} className="text-emerald-600" />
                              <span>Concluído</span>
                              {stageDoneDate && (
                                <span className="text-[10px] font-normal text-emerald-600">
                                  ({stageDoneDate})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold shadow-2xs">
                              <Clock size={14} className="text-amber-600" />
                              <span>Pendente</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className="text-right">
                            <span className="text-xs font-extrabold text-[#052447] block">
                              {progressPercentage}% concluído
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {completedCount} de {totalStages} etapas
                            </span>
                          </div>
                          {/* Barra de Progresso Compacta */}
                          <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200/60">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Botão de Ação para Abrir o Trilho */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMemberTrack(member);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-50 group-hover:bg-[#052447] text-sky-800 group-hover:text-white border border-sky-200 group-hover:border-[#052447] text-xs font-bold transition shadow-2xs cursor-pointer shrink-0"
                      >
                        <span>Abrir Trilho</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
