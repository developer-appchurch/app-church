'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Check,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Search,
  X,
  Loader2,
  Building2,
  MapPin,
  Calendar,
  Clock,
  Users,
  User,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { CellGroup, CellMember, UserProfile, ActiveScreen, UserRole } from '../types';
import { AppChurchService } from '../lib/supabase';

interface MultiplyCellViewProps {
  currentUser: UserProfile;
  cells: CellGroup[];
  currentCell?: CellGroup;
  onNavigate: (screen: ActiveScreen) => void;
  onRefreshCells?: () => void;
  onSelectCell?: (cellId: string) => void;
}

const PASTEL_PALETTES = [
  { bg: 'bg-sky-100', text: 'text-sky-800' },
  { bg: 'bg-amber-100', text: 'text-amber-800' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  { bg: 'bg-violet-100', text: 'text-violet-800' },
  { bg: 'bg-rose-100', text: 'text-rose-800' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { bg: 'bg-teal-100', text: 'text-teal-800' },
  { bg: 'bg-orange-100', text: 'text-orange-800' },
];

function getMemberInitials(name: string): string {
  if (!name) return 'MB';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getMemberPastelColor(id: string, name: string) {
  let hash = 0;
  const str = id + name;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PASTEL_PALETTES.length;
  return PASTEL_PALETTES[index];
}

const DAYS_OF_WEEK = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

export const MultiplyCellView: React.FC<MultiplyCellViewProps> = ({
  currentUser,
  cells = [],
  currentCell,
  onNavigate,
  onRefreshCells,
  onSelectCell,
}) => {
  // 1. Estado da Célula de Origem e Destino
  const initialOriginId = useMemo(() => {
    if (currentCell && cells.some((c) => c.id === currentCell.id)) {
      return currentCell.id;
    }
    return cells.length > 0 ? cells[0].id : '';
  }, [currentCell, cells]);

  const [originCellId, setOriginCellId] = useState<string>(initialOriginId);
  const [destCellId, setDestCellId] = useState<string>('');

  // 2. Modais e Seletores
  const [isSelectOriginModalOpen, setIsSelectOriginModalOpen] = useState<boolean>(false);
  const [isSelectDestModalOpen, setIsSelectDestModalOpen] = useState<boolean>(false);
  const [isCreateCellModalOpen, setIsCreateCellModalOpen] = useState<boolean>(false);
  const [originSearchTerm, setOriginSearchTerm] = useState<string>('');
  const [destSearchTerm, setDestSearchTerm] = useState<string>('');

  // 3. Formulário de Criação de Nova Célula
  const [newCellName, setNewCellName] = useState<string>('');
  const [newMeetingDay, setNewMeetingDay] = useState<string>('Quarta-feira');
  const [newMeetingTime, setNewMeetingTime] = useState<string>('19:30');
  const [newNeighborhood, setNewNeighborhood] = useState<string>('Centro');
  const [newAddress, setNewAddress] = useState<string>('');
  const [isCreatingCell, setIsCreatingCell] = useState<boolean>(false);
  const [createCellError, setCreateCellError] = useState<string>('');

  // 4. Membros da Célula de Origem & IDs Transferidos
  const [originMembers, setOriginMembers] = useState<CellMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false);
  const [membersFetchError, setMembersFetchError] = useState<string>('');
  const [transferredMemberIds, setTransferredMemberIds] = useState<string[]>([]);

  // 5. Passo 4: Liderança da Nova Célula
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedAuxiliarId, setSelectedAuxiliarId] = useState<string | null>(null);

  // 6. Estado de Submissão e Feedbacks
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Célula de Origem Selecionada
  const originCell = useMemo(() => {
    return cells.find((c) => c.id === originCellId) || null;
  }, [cells, originCellId]);

  // Célula de Destino Selecionada
  const destCell = useMemo(() => {
    return cells.find((c) => c.id === destCellId) || null;
  }, [cells, destCellId]);

  // Carregar Membros da Célula de Origem
  const loadOriginMembers = useCallback(async (cellId: string) => {
    if (!cellId) {
      setOriginMembers([]);
      return;
    }
    setIsLoadingMembers(true);
    setMembersFetchError('');
    try {
      const mems = await AppChurchService.getMembers(currentUser.churchId, cellId, true);
      setOriginMembers(mems || []);
      // Resetar membros transferidos ao trocar célula de origem
      setTransferredMemberIds([]);
      setSelectedLeaderId(null);
      setSelectedAuxiliarId(null);
    } catch (err: any) {
      console.error('Erro ao carregar membros da célula de origem:', err);
      setMembersFetchError('Não foi possível carregar os membros desta célula.');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [currentUser.churchId]);

  useEffect(() => {
    if (originCellId) {
      loadOriginMembers(originCellId);
    }
  }, [originCellId, loadOriginMembers]);

  // Lista de Membros que continuam na Origem vs Membros que vão para o Destino
  const remainingMembers = useMemo(() => {
    return originMembers.filter((m) => !transferredMemberIds.includes(m.id));
  }, [originMembers, transferredMemberIds]);

  const transferredMembers = useMemo(() => {
    return originMembers.filter((m) => transferredMemberIds.includes(m.id));
  }, [originMembers, transferredMemberIds]);

  // Handler para mover um membro para a nova célula
  const handleSendMember = (memberId: string) => {
    setTransferredMemberIds((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]));
  };

  // Handler para devolver um membro para a origem
  const handleReturnMember = (memberId: string) => {
    setTransferredMemberIds((prev) => prev.filter((id) => id !== memberId));
    if (selectedLeaderId === memberId) setSelectedLeaderId(null);
    if (selectedAuxiliarId === memberId) setSelectedAuxiliarId(null);
  };

  // Enviar todos os membros
  const handleSendAll = () => {
    const allIds = originMembers.map((m) => m.id);
    setTransferredMemberIds(allIds);
  };

  // Devolver todos os membros
  const handleReturnAll = () => {
    setTransferredMemberIds([]);
    setSelectedLeaderId(null);
    setSelectedAuxiliarId(null);
  };

  // Ciclo de seleção de Líderes do Passo 4
  const handleMemberRoleClick = (memberId: string) => {
    if (selectedLeaderId === memberId) {
      // Já é Líder -> passa a ser Auxiliar
      setSelectedLeaderId(null);
      setSelectedAuxiliarId(memberId);
    } else if (selectedAuxiliarId === memberId) {
      // Já é Auxiliar -> remove a seleção (fica "Escolher")
      setSelectedAuxiliarId(null);
    } else {
      // Não selecionado -> define como Líder
      setSelectedLeaderId(memberId);
      if (selectedAuxiliarId === memberId) {
        setSelectedAuxiliarId(null);
      }
    }
  };

  // Criar nova célula via Bottom Sheet
  const handleCreateNewCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCellName.trim()) {
      setCreateCellError('Informe o nome da nova célula.');
      return;
    }

    setIsCreatingCell(true);
    setCreateCellError('');

    try {
      const created = await AppChurchService.createCell({
        churchId: currentUser.churchId,
        name: newCellName.trim(),
        leaderName: currentUser.name || 'A Definir',
        sectorName: originCell?.sectorName || currentUser.sector || 'Geral',
        neighborhood: newNeighborhood.trim() || 'Centro',
        address: newAddress.trim() || `Bairro ${newNeighborhood.trim()}`,
        meetingDay: newMeetingDay,
        meetingTime: newMeetingTime,
        parentUnitId: originCell?.parentUnitId || null,
      });

      if (created && created.id) {
        onRefreshCells?.();
        setDestCellId(created.id);
        setIsCreateCellModalOpen(false);
        setNewCellName('');
        setNewAddress('');
      } else {
        throw new Error('Não foi possível registrar a nova célula.');
      }
    } catch (err: any) {
      console.error('Erro ao criar nova célula:', err);
      setCreateCellError(err?.message || 'Erro ao criar nova célula. Verifique os dados.');
    } finally {
      setIsCreatingCell(false);
    }
  };

  // Validações de confirmação
  const leaderMember = useMemo(() => {
    return transferredMembers.find((m) => m.id === selectedLeaderId) || null;
  }, [transferredMembers, selectedLeaderId]);

  const canMultiply = useMemo(() => {
    if (!originCellId || !destCellId) return false;
    if (originCellId === destCellId) return false;
    if (transferredMembers.length < 1) return false;
    if (!selectedLeaderId) return false;
    if (remainingMembers.length < 1) return false;
    return true;
  }, [originCellId, destCellId, transferredMembers, selectedLeaderId, remainingMembers]);

  // Executar Multiplicação
  const handleConfirmMultiply = async () => {
    if (!canMultiply || isSubmitting) return;

    if (remainingMembers.length < 1) {
      setSubmitError('A célula de origem precisa continuar com pelo menos 1 membro.');
      return;
    }

    if (!selectedLeaderId) {
      setSubmitError('Defina o Líder da nova célula no Passo 4 antes de continuar.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Mover todos os membros transferidos para a unidade de destino
      for (const member of transferredMembers) {
        const isLeader = member.id === selectedLeaderId;
        const isAuxiliar = member.id === selectedAuxiliarId;

        const roleUpdates: { role?: UserRole; roleId?: string; cellId: string } = {
          cellId: destCellId,
        };

        if (isLeader) {
          roleUpdates.role = 'Líder de Célula';
        } else if (isAuxiliar) {
          roleUpdates.role = 'Líder em Treinamento';
        }

        await AppChurchService.updateMember(member.id, roleUpdates, {
          forceRoleOverride: isLeader || isAuxiliar,
        });
      }

      // 2. Atualizar líderes da unidade de destino em 'unidade_lideres'
      const leadersToBind = [selectedLeaderId];
      if (selectedAuxiliarId && selectedAuxiliarId !== selectedLeaderId) {
        leadersToBind.push(selectedAuxiliarId);
      }

      await AppChurchService.updateUnitLeaders(
        destCellId,
        currentUser.churchId,
        leadersToBind
      );

      // 3. Atualizar relacionamento com a célula mãe se suportado
      if (originCellId) {
        try {
          await AppChurchService.updateCell({
            cellId: destCellId,
            churchId: currentUser.churchId,
            name: destCell?.name || 'Célula Multiplicada',
          });
        } catch (linkErr) {
          console.warn('Atualização da célula multiplicada:', linkErr);
        }
      }

      // 4. Feedback de Sucesso e Navegação
      setSuccessToast(`Célula "${destCell?.name || 'Nova Célula'}" multiplicada com sucesso!`);
      onRefreshCells?.();

      setTimeout(() => {
        onSelectCell?.(destCellId);
        onNavigate('our_cells');
      }, 1500);
    } catch (err: any) {
      console.error('Erro ao multiplicar célula:', err);
      setSubmitError(err?.message || 'Falha ao concluir a multiplicação de célula. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  // Células disponíveis para Destino (exclui a de origem)
  const availableDestCells = useMemo(() => {
    return cells.filter((c) => c.id !== originCellId);
  }, [cells, originCellId]);

  return (
    <div className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pt-3 sm:pt-4 space-y-3">
        {/* Toast de Sucesso */}
        {successToast && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-sm">{successToast}</p>
              <p className="text-xs text-emerald-700 mt-0.5">Redirecionando para a lista de células...</p>
            </div>
          </div>
        )}

        {/* Erro de Submissão */}
        {submitError && (
          <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle size={18} className="text-rose-600 shrink-0" />
              <p className="text-xs font-bold">{submitError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-xs font-bold text-rose-700 hover:text-rose-900 px-2 py-1 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Banner Superior da Tela (Padrão App Church) */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#052447] flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-sky-300" size={26} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-[#052447] mt-0.5 truncate">
                  Multiplicar Célula
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Multiplique uma célula em poucos passos
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Passo 1 — Célula de origem */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
          {/* Cabeçalho do Passo 1 */}
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-[#052447] text-white text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-[#052447] leading-tight truncate">
                Célula de origem
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Qual célula vai multiplicar?
              </p>
            </div>
          </div>

          {/* Seletor da Célula de Origem */}
          {originCell ? (
            <div className="bg-slate-50 border border-sky-300 rounded-xl p-3 flex items-center justify-between gap-2 transition">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-[#052447] truncate">
                  {originCell.name}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                  Setor {originCell.sectorName || 'Geral'} • {originCell.meetingDay || 'Quarta-feira'} {originCell.meetingTime || '19:30'} • {originMembers.length} membros
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectOriginModalOpen(true)}
                className="text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline cursor-pointer shrink-0 ml-2"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">Nenhuma célula selecionada.</p>
              <button
                type="button"
                onClick={() => setIsSelectOriginModalOpen(true)}
                className="mt-1 text-xs font-bold text-sky-700 hover:underline cursor-pointer"
              >
                Selecionar Célula
              </button>
            </div>
          )}

          {/* Botão Criar Nova Célula */}
          <button
            type="button"
            onClick={() => {
              setCreateCellError('');
              setIsCreateCellModalOpen(true);
            }}
            className="w-full bg-[#052447] hover:bg-[#073366] active:scale-[0.99] text-white text-xs font-bold rounded-xl py-2.5 px-3 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <span>＋ Criar nova célula</span>
          </button>
        </div>

        {/* Passos 2 e 3 — Dois quadros lado a lado (2 colunas iguais) */}
        <div className="grid grid-cols-2 gap-2.5 items-stretch">
          {/* Quadro 2: Membros da Célula de Origem */}
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col h-[385px]">
            {/* Cabeçalho do Quadro 2 */}
            <div className="flex items-start gap-1.5 pb-2 border-b border-slate-100 shrink-0">
              <span className="w-5 h-5 rounded-full bg-[#052447] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-extrabold text-[#052447] leading-tight truncate">
                  Membros da {originCell?.name || 'Origem'}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight mt-0.5 truncate">
                  Toque em → para enviar
                </p>
              </div>
            </div>

            {/* Linha com Chip e Ação Enviar Todos */}
            <div className="flex items-center justify-between gap-1 py-2 shrink-0">
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap">
                {remainingMembers.length} continuam
              </span>
              {remainingMembers.length > 0 && (
                <button
                  type="button"
                  onClick={handleSendAll}
                  disabled={!destCellId}
                  className="text-xs font-bold text-sky-700 hover:text-sky-800 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Enviar todos →
                </button>
              )}
            </div>

            {/* Lista com Rolagem Interna */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
              {isLoadingMembers ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 size={18} className="animate-spin text-sky-600" />
                  <span className="text-[10px] font-semibold">Carregando membros...</span>
                </div>
              ) : remainingMembers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-2 text-slate-400">
                  <Users size={22} className="mb-1 opacity-60" />
                  <p className="text-[11px] font-medium leading-tight">
                    {originMembers.length === 0
                      ? 'Nenhum membro cadastrado nesta célula.'
                      : 'Todos os membros foram enviados para a nova célula.'}
                  </p>
                </div>
              ) : (
                remainingMembers.map((member) => (
                  <div
                    key={member.id}
                    className="bg-white border border-slate-200/90 rounded-xl p-2 flex items-center justify-between gap-1.5 shadow-2xs hover:border-sky-300 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-extrabold text-[#052447] truncate">
                        {member.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 truncate">
                        {member.role || 'Membro'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendMember(member.id)}
                      disabled={!destCellId}
                      className="w-6 h-6 rounded-full bg-[#052447] hover:bg-[#073366] active:scale-90 text-white flex items-center justify-center shrink-0 shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-transform"
                      title={!destCellId ? 'Selecione ou crie uma célula de destino' : `Enviar ${member.name}`}
                    >
                      <ArrowRight size={12} strokeWidth={2.6} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé informativo */}
            {remainingMembers.length > 4 && (
              <div className="pt-1.5 border-t border-slate-100 text-center shrink-0">
                <span className="text-[10px] font-semibold text-slate-400">
                  + {remainingMembers.length} membros — role para ver
                </span>
              </div>
            )}
          </div>

          {/* Quadro 3: Nova Célula (Destino) */}
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col h-[385px]">
            {/* Cabeçalho do Quadro 3 */}
            <div className="flex items-start gap-1.5 pb-2 border-b border-slate-100 shrink-0">
              <span className="w-5 h-5 rounded-full bg-[#052447] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-extrabold text-[#052447] leading-tight truncate">
                  Nova célula
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight mt-0.5 truncate">
                  Visualize os membros
                </p>
              </div>
            </div>

            {/* Seletor da Célula de Destino */}
            <div className="pt-2 pb-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsSelectDestModalOpen(true)}
                className={`w-full text-left bg-slate-50 border ${
                  destCell ? 'border-sky-300 text-[#052447]' : 'border-slate-200 text-slate-400'
                } rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-1 transition cursor-pointer`}
              >
                <span className="text-xs font-bold truncate">
                  {destCell ? destCell.name : 'Selecionar célula...'}
                </span>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Linha com Chip e Ação Devolver Todos */}
            <div className="flex items-center justify-between gap-1 py-1.5 shrink-0">
              <span className="bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap">
                {transferredMembers.length} vão
              </span>
              {transferredMembers.length > 0 && (
                <button
                  type="button"
                  onClick={handleReturnAll}
                  className="text-xs font-bold text-slate-500 hover:text-[#052447] hover:underline cursor-pointer whitespace-nowrap"
                >
                  ← Devolver todos
                </button>
              )}
            </div>

            {/* Lista de Membros Enviados */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
              {transferredMembers.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-2 text-slate-400">
                  <Users size={22} className="mb-1 opacity-60" />
                  <p className="text-[11px] font-medium leading-tight">
                    Nenhum membro enviado ainda. Toque em → no quadro ao lado.
                  </p>
                </div>
              ) : (
                transferredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="bg-sky-50/70 border border-sky-200 rounded-xl p-2 flex items-center justify-between gap-1.5 shadow-2xs transition"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-extrabold text-[#052447] truncate">
                        {member.name}
                      </h4>
                      <p className="text-[10px] text-sky-800 font-medium truncate">
                        {member.id === selectedLeaderId
                          ? '⭐ Líder'
                          : member.id === selectedAuxiliarId
                          ? '🔹 Auxiliar'
                          : member.role || 'Membro'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReturnMember(member.id)}
                      className="w-6 h-6 rounded-full bg-white hover:bg-slate-100 active:scale-90 text-[#052447] border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs cursor-pointer transition-transform"
                      title={`Devolver ${member.name}`}
                    >
                      <ArrowLeft size={12} strokeWidth={2.6} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé informativo */}
            {transferredMembers.length > 4 && (
              <div className="pt-1.5 border-t border-slate-100 text-center shrink-0">
                <span className="text-[10px] font-semibold text-slate-400">
                  + {transferredMembers.length} membros na nova célula
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Passo 4 — Líderes da nova célula */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
          {/* Cabeçalho do Passo 4 */}
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-[#052447] text-white text-xs font-bold flex items-center justify-center shrink-0">
              4
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-[#052447] leading-tight truncate">
                Líderes da nova célula
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Toque no membro para escolher
              </p>
            </div>
          </div>

          {/* Lista de Membros Enviados com Seleção de Líder / Auxiliar */}
          {transferredMembers.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500">
                Envie membros no passo anterior para definir a liderança da nova célula.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transferredMembers.map((member) => {
                const isLeader = member.id === selectedLeaderId;
                const isAuxiliar = member.id === selectedAuxiliarId;
                const isUnselected = !isLeader && !isAuxiliar;
                const pastel = getMemberPastelColor(member.id, member.name);

                return (
                  <div
                    key={member.id}
                    onClick={() => handleMemberRoleClick(member.id)}
                    className={`rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-2.5 transition cursor-pointer select-none ${
                      isLeader
                        ? 'bg-sky-50 border-2 border-sky-600 shadow-xs'
                        : isAuxiliar
                        ? 'bg-amber-50 border-2 border-amber-500 shadow-xs'
                        : 'bg-white border border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {/* Avatar e Nome */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-full ${pastel.bg} ${pastel.text} font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-white shadow-2xs`}
                      >
                        {getMemberInitials(member.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#052447] truncate">
                          {member.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate">
                          {member.neighborhood || 'Membro'}
                        </p>
                      </div>
                    </div>

                    {/* Estado à Direita */}
                    <div className="shrink-0">
                      {isLeader && (
                        <span className="bg-sky-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-2xs">
                          Líder
                        </span>
                      )}
                      {isAuxiliar && (
                        <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-2xs">
                          Auxiliar
                        </span>
                      )}
                      {isUnselected && (
                        <span className="text-xs font-semibold text-slate-400 px-2.5 py-1">
                          Escolher
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumo e confirmação (card final) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
          {/* Título e Resumo */}
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#052447] truncate">
              {originCell ? originCell.name : 'Origem'} → {destCell ? destCell.name : 'Destino'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-0.5 truncate">
              {remainingMembers.length} continuam • {transferredMembers.length} vão • Líder: {leaderMember ? leaderMember.name : 'Não definido'}
            </p>
          </div>

          {/* Avisos de Validação se houver pendências */}
          {!canMultiply && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 font-medium">
              {!destCellId && <p>• Escolha ou crie uma célula de destino no Passo 3.</p>}
              {transferredMembers.length === 0 && <p>• Envie ao menos 1 membro para a nova célula.</p>}
              {!selectedLeaderId && <p>• Escolha o Líder da nova célula no Passo 4.</p>}
              {remainingMembers.length === 0 && originMembers.length > 0 && (
                <p className="font-bold text-rose-700">• A célula de origem não pode ficar sem membros.</p>
              )}
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('our_cells')}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 text-xs sm:text-sm font-bold rounded-xl py-2.5 px-4 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canMultiply || isSubmitting}
              onClick={handleConfirmMultiply}
              className={`flex-1 text-xs sm:text-sm font-extrabold rounded-xl py-2.5 px-4 text-white flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer ${
                canMultiply && !isSubmitting
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]'
                  : 'bg-emerald-600/50 text-white/70 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Multiplicando...</span>
                </>
              ) : (
                <span>✓ Multiplicar célula</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL / BOTTOM SHEET: TROCAR CÉLULA DE ORIGEM
      ========================================================================= */}
      {isSelectOriginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl p-4 sm:p-5 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-extrabold text-[#052447] text-base">
                Selecionar Célula de Origem
              </h3>
              <button
                type="button"
                onClick={() => setIsSelectOriginModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={originSearchTerm}
                  onChange={(e) => setOriginSearchTerm(e.target.value)}
                  placeholder="Buscar célula por nome ou setor..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {cells
                .filter(
                  (c) =>
                    !originSearchTerm ||
                    c.name.toLowerCase().includes(originSearchTerm.toLowerCase()) ||
                    (c.sectorName && c.sectorName.toLowerCase().includes(originSearchTerm.toLowerCase()))
                )
                .map((cell) => {
                  const isSelected = cell.id === originCellId;
                  return (
                    <div
                      key={cell.id}
                      onClick={() => {
                        setOriginCellId(cell.id);
                        setIsSelectOriginModalOpen(false);
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-50 border-sky-600 shadow-2xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#052447] truncate">{cell.name}</h4>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Setor {cell.sectorName || 'Geral'} • {cell.meetingDay || 'Quarta'} {cell.meetingTime || '19:30'}
                        </p>
                      </div>
                      {isSelected && <Check size={16} className="text-sky-600 shrink-0" />}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL / BOTTOM SHEET: SELECIONAR CÉLULA DE DESTINO
      ========================================================================= */}
      {isSelectDestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl p-4 sm:p-5 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-extrabold text-[#052447] text-base">
                Selecionar Célula de Destino
              </h3>
              <button
                type="button"
                onClick={() => setIsSelectDestModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={destSearchTerm}
                  onChange={(e) => setDestSearchTerm(e.target.value)}
                  placeholder="Buscar célula por nome..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {availableDestCells
                .filter(
                  (c) =>
                    !destSearchTerm ||
                    c.name.toLowerCase().includes(destSearchTerm.toLowerCase()) ||
                    (c.sectorName && c.sectorName.toLowerCase().includes(destSearchTerm.toLowerCase()))
                )
                .map((cell) => {
                  const isSelected = cell.id === destCellId;
                  return (
                    <div
                      key={cell.id}
                      onClick={() => {
                        setDestCellId(cell.id);
                        setIsSelectDestModalOpen(false);
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-50 border-sky-600 shadow-2xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#052447] truncate">{cell.name}</h4>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Setor {cell.sectorName || 'Geral'} • {cell.meetingDay || 'Quarta'} {cell.meetingTime || '19:30'}
                        </p>
                      </div>
                      {isSelected && <Check size={16} className="text-sky-600 shrink-0" />}
                    </div>
                  );
                })}

              <button
                type="button"
                onClick={() => {
                  setIsSelectDestModalOpen(false);
                  setIsCreateCellModalOpen(true);
                }}
                className="w-full p-3 rounded-xl border border-dashed border-sky-600 text-sky-700 bg-sky-50 hover:bg-sky-100 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <span>＋ Criar nova célula agora</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL / BOTTOM SHEET: CRIAR NOVA CÉLULA
      ========================================================================= */}
      {isCreateCellModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#052447] text-white flex items-center justify-center shadow-xs">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#052447] text-base">
                    Criar Nova Célula
                  </h3>
                  <p className="text-xs text-slate-500">
                    A nova célula será selecionada no Passo 3
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCellModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {createCellError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{createCellError}</span>
              </div>
            )}

            <form onSubmit={handleCreateNewCell} className="mt-4 space-y-3.5">
              {/* Nome da Célula */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Nova Célula <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCellName}
                  onChange={(e) => setNewCellName(e.target.value)}
                  placeholder="Ex: Célula Emanuel, Célula Shalon..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                />
              </div>

              {/* Dia da Semana e Horário */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dia da Semana
                  </label>
                  <select
                    value={newMeetingDay}
                    onChange={(e) => setNewMeetingDay(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600 cursor-pointer"
                  >
                    {DAYS_OF_WEEK.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Horário
                  </label>
                  <input
                    type="text"
                    value={newMeetingTime}
                    onChange={(e) => setNewMeetingTime(e.target.value)}
                    placeholder="19:30"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              {/* Bairro e Endereço */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bairro / Região
                  </label>
                  <input
                    type="text"
                    value={newNeighborhood}
                    onChange={(e) => setNewNeighborhood(e.target.value)}
                    placeholder="Centro, Dom Expedito..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Local / Endereço
                  </label>
                  <input
                    type="text"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Rua, número ou ponto de referência"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateCellModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCell || !newCellName.trim()}
                  className="px-5 py-2 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCreatingCell ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Célula</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
