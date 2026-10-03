'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppChurchService } from '../lib/supabase';
import { CellGroup, CellMember, UserProfile, WeeklyReport } from '../types';
import {
  FileText,
  Plus,
  Calendar,
  Users,
  Check,
  X,
  UserCheck,
  DollarSign,
  Baby,
  ShieldCheck,
  ShieldX,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Eye,
  History,
  Clock,
  Trash2,
} from 'lucide-react';

interface WeeklyReportViewProps {
  currentCell: CellGroup;
  members: CellMember[];
  cells?: CellGroup[];
  onSelectCell?: (cellId: string) => void;
  currentUser?: UserProfile;
  autoOpenModal?: boolean;
  initialReportDate?: string;
}

export const WeeklyReportView: React.FC<WeeklyReportViewProps> = ({
  currentCell,
  members,
  cells = [],
  onSelectCell,
  currentUser,
  autoOpenModal = false,
  initialReportDate,
}) => {
  // Modal de Lançamento / Edição de Relatório (abre diretamente se acionado via deep link)
  const [isModalOpen, setIsModalOpen] = useState(() => Boolean(autoOpenModal));
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // Modal de Detalhes do Relatório
  const [selectedReportForDetail, setSelectedReportForDetail] = useState<WeeklyReport | null>(null);

  const queryClient = useQueryClient();

  // Filtra apenas membros pertencentes à célula selecionada
  const currentCellId = currentCell?.id;

  // React Query para Relatórios Recentes (3 minutos de cache ativo, instantâneo ao trocar de tela)
  const {
    data: reportsPayload,
    isLoading: isLoadingReportsQuery,
    isFetching: isFetchingReports,
    error: reportsErrorObj,
    refetch: refetchRecentReports,
  } = useQuery({
    queryKey: ['weekly-reports', currentCellId, currentCell?.churchId],
    queryFn: async () => {
      if (!currentCellId) return { reports: [], hasOlderReports: false, olderReportsCount: 0 };
      const url = `/api/reports?cellId=${encodeURIComponent(currentCellId)}${
        currentCell?.churchId ? `&churchId=${encodeURIComponent(currentCell.churchId)}` : ''
      }&mode=recent`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao carregar relatórios');
      }
      return json;
    },
    enabled: Boolean(currentCellId),
    staleTime: 1000 * 60 * 3, // 3 minutos de cache persistente em memória
    gcTime: 1000 * 60 * 15,
  });

  // Estado para relatórios mais antigos paginados sob demanda
  const [olderReports, setOlderReports] = useState<WeeklyReport[]>([]);
  const [olderOffset, setOlderOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadedOlderCount, setLoadedOlderCount] = useState(0);

  // Limpa relatórios antigos ao alternar de célula
  useEffect(() => {
    setOlderReports([]);
    setOlderOffset(0);
    setLoadedOlderCount(0);
  }, [currentCellId]);

  const baseReports: WeeklyReport[] = useMemo(() => reportsPayload?.reports || [], [reportsPayload]);

  const reports: WeeklyReport[] = useMemo(() => {
    if (olderReports.length === 0) return baseReports;
    const existingIds = new Set(baseReports.map((r) => r.id));
    const filteredOlder = olderReports.filter((r) => !existingIds.has(r.id));
    return [...baseReports, ...filteredOlder];
  }, [baseReports, olderReports]);

  const olderReportsCount = Number(reportsPayload?.olderReportsCount || 0);
  const hasMoreOlder = useMemo(() => {
    if (!reportsPayload?.hasOlderReports) return false;
    return olderOffset + olderReports.length < olderReportsCount;
  }, [reportsPayload?.hasOlderReports, olderOffset, olderReports.length, olderReportsCount]);

  const isLoadingReports = isLoadingReportsQuery && !reportsPayload;
  const reportsError = reportsErrorObj ? (reportsErrorObj as Error).message : null;

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estados para exclusão de relatório
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<WeeklyReport | null>(null);

  // Duplicate report warning modal state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingReport: {
      id: string;
      data_relatorio: string;
      ano_iso: number;
      numero_semana: number;
      lancado_por_nome: string;
      qtd_membros: number;
      qtd_convidados: number;
      qtd_criancas: number;
      valor_pix: number;
      valor_especie: number;
      supervisao: boolean;
      observacao?: string;
      criado_em?: string;
    };
  } | null>(null);

  // Form states inside modal
  const [reportDate, setReportDate] = useState(() => {
    if (initialReportDate) return initialReportDate;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [supervisaoPresente, setSupervisaoPresente] = useState(false);
  const [presentMemberIds, setPresentMemberIds] = useState<string[]>([]);
  const [valorPix, setValorPix] = useState('0,00');
  const [valorEspecie, setValorEspecie] = useState('0,00');
  const [convidadosCount, setConvidadosCount] = useState('0');
  const [childrenCount, setChildrenCount] = useState('0');
  const [observacao, setObservacao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Busca os membros da célula selecionada sob demanda (compartilha cache com Minha Célula sem teto de 250)
  const { data: directMembers } = useQuery({
    queryKey: ['cell-members', currentCellId],
    queryFn: async () => {
      if (!currentCellId) return [];
      return AppChurchService.getMembers(currentUser?.churchId || currentCell.churchId, currentCellId);
    },
    enabled: Boolean(currentCellId),
    staleTime: 1000 * 60 * 3, // 3 minutos
  });

  const cellMembers = useMemo(() => {
    if (!currentCellId) return [];
    if (directMembers && directMembers.length > 0) return directMembers;
    return members.filter((m) => m.cellId === currentCellId);
  }, [directMembers, members, currentCellId]);

  // Busca as células sob cobertura hierárquica do usuário
  const { data: coveredCellsData } = useQuery({
    queryKey: ['user-covered-cells', currentUser?.id, currentUser?.churchId],
    queryFn: async () => {
      if (!currentUser?.id || !currentUser?.churchId) return null;
      const res = await fetch(
        `/api/hierarchy/user-covered-cells?userId=${encodeURIComponent(currentUser.id)}&churchId=${encodeURIComponent(currentUser.churchId)}`
      );
      if (!res.ok) return null;
      return res.json().catch(() => null);
    },
    enabled: Boolean(currentUser?.id && currentUser?.churchId),
    staleTime: 1000 * 60 * 5,
  });

  // Filtra estritamente as células que o usuário tem autorização para lançar relatório
  const allowedCells = useMemo(() => {
    if (!currentUser) return cells;

    const userRoleNorm = (currentUser.role || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isSystemAdmin =
      currentUser.isSystemAdmin === true ||
      currentUser.role === 'Administrador' ||
      currentUser.login === 'admin' ||
      currentUser.email === 'developer.appchurch@gmail.com';
    const isPastor = userRoleNorm.includes('pastor');

    // 1. Pastores e Administradores possuem acesso total a todas as células da igreja
    if (isSystemAdmin || isPastor) {
      return cells;
    }

    // 2. Se a API de cobertura hierárquica retornou IDs específicos
    if (coveredCellsData) {
      if (coveredCellsData.isAllCells) return cells;
      if (Array.isArray(coveredCellsData.cellIds) && coveredCellsData.cellIds.length > 0) {
        const allowedSet = new Set(coveredCellsData.cellIds);
        const filtered = cells.filter((c) => allowedSet.has(c.id));
        if (filtered.length > 0) return filtered;
      }
    }

    // 3. Fallback inteligente de cobertura baseado na hierarquia (Setor, Área, Célula)
    const userCellId = currentUser.currentCellId || currentUser.cellId;
    const isLeaderSector = userRoleNorm.includes('setor') || userRoleNorm.includes('supervisor');
    const isLeaderArea = userRoleNorm.includes('area');

    if (isLeaderSector && currentUser.sector) {
      const sectorNorm = currentUser.sector.toLowerCase().trim();
      const sectorCells = cells.filter(
        (c) =>
          (c.sectorName && c.sectorName.toLowerCase().trim() === sectorNorm) ||
          (c.parentName && c.parentName.toLowerCase().trim() === sectorNorm) ||
          c.id === userCellId ||
          c.leaderMemberIds?.includes(currentUser.id)
      );
      if (sectorCells.length > 0) return sectorCells;
    }

    if (isLeaderArea) {
      const areaCells = cells.filter(
        (c) =>
          (c.areaName && c.areaName.toLowerCase().trim() === (currentUser.sector || '').toLowerCase().trim()) ||
          c.id === userCellId ||
          c.leaderMemberIds?.includes(currentUser.id)
      );
      if (areaCells.length > 0) return areaCells;
    }

    // 4. Para Líder de Célula e membros comuns: APENAS a célula vinculada e células onde é líder
    const directCells = cells.filter((c) => {
      const isHomeCell = Boolean(userCellId && c.id === userCellId);
      const isDirectLeader = Boolean(
        currentUser.id &&
        (c.leaderMemberIds?.includes(currentUser.id) ||
         c.leaderNames?.some((n) => n.toLowerCase() === currentUser.name.toLowerCase()))
      );
      return isHomeCell || isDirectLeader;
    });

    if (directCells.length > 0) return directCells;

    // Se nenhuma outra for encontrada, mantém apenas a célula atual vinculada
    if (currentCell) return [currentCell];
    return cells;
  }, [cells, coveredCellsData, currentUser, currentCell]);

  // Permissão para excluir relatório: Líder da célula ou liderança superior (setor, área, pastor, admin)
  const canDeleteReport = useMemo(() => {
    if (!currentUser) return false;
    const userRoleNorm = (currentUser.role || '').toLowerCase().trim();
    const isSystemAdmin =
      userRoleNorm.includes('admin') ||
      userRoleNorm.includes('super') ||
      currentUser.role === 'admin';
    const isPastor = userRoleNorm.includes('pastor');
    const isSectorOrArea =
      userRoleNorm.includes('setor') ||
      userRoleNorm.includes('area') ||
      userRoleNorm.includes('área') ||
      userRoleNorm.includes('supervisor') ||
      userRoleNorm.includes('discipulador') ||
      userRoleNorm.includes('coordenador') ||
      userRoleNorm.includes('diretoria');

    const isCellLeader = Boolean(
      userRoleNorm.includes('lider') ||
      userRoleNorm.includes('líder') ||
      (currentUser.id &&
        (currentCell.leaderMemberIds?.includes(currentUser.id) ||
         currentCell.leaderNames?.some((n) => n.toLowerCase() === currentUser.name.toLowerCase())))
    );

    return isSystemAdmin || isPastor || isSectorOrArea || isCellLeader;
  }, [currentUser, currentCell]);

  // Células autorizadas ordenadas alfabeticamente para o seletor
  const sortedCells = useMemo(() => {
    return [...allowedCells].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allowedCells]);

  // Regra de negócio: Sempre vir selecionada a célula vinculada do usuário e impedir seleção de células não autorizadas
  useEffect(() => {
    if (sortedCells.length > 0 && onSelectCell) {
      const userCellId = currentUser?.currentCellId || currentUser?.cellId;
      const isCurrentAllowed = sortedCells.some((c) => c.id === currentCell?.id);

      if (!isCurrentAllowed) {
        // Se a célula atualmente selecionada no estado global não é permitida para este usuário,
        // força a seleção para a célula vinculada do usuário ou para a primeira célula autorizada
        const target =
          userCellId && sortedCells.some((c) => c.id === userCellId)
            ? userCellId
            : sortedCells[0].id;

        if (target && target !== currentCell?.id) {
          onSelectCell(target);
        }
      }
    }
  }, [sortedCells, currentCell?.id, currentUser?.currentCellId, currentUser?.cellId, onSelectCell]);

  // Função para formatar input de moeda (PIX / Espécie)
  const handleCurrencyChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const numericOnly = value.replace(/\D/g, '');
    if (!numericOnly) {
      setter('0,00');
      return;
    }
    const cents = parseInt(numericOnly, 10);
    const floatVal = cents / 100;
    setter(
      floatVal.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  // Previne digitação de caracteres inválidos nos campos numéricos
  const handleKeyDownOnlyNumbers = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      [
        'Backspace',
        'Delete',
        'Tab',
        'Escape',
        'Enter',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(e.key) ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // Formata valor numérico para exibição de moeda
  const formatMoney = (val: string | number | undefined | null) => {
    if (val === undefined || val === null || val === '') return 'R$ 0,00';
    const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  // Formata valor numérico para input sem símbolo R$
  const formatMoneyInput = (val: string | number | undefined | null) => {
    if (val === undefined || val === null || val === '') return '0,00';
    const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Limpa observação caso venha algum resíduo antigo ou JSON
  const cleanObservationText = (val: any): string => {
    if (!val || typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const text = parsed.observacao || parsed.texto_livre || parsed.observacoes_extras || '';
        return typeof text === 'string' ? text.trim() : '';
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  };

  // Reset modal form
  const resetForm = useCallback(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setReportDate(`${yyyy}-${mm}-${dd}`);

    // Marca por padrão todos os membros da célula presentes
    setPresentMemberIds(cellMembers.map((m) => m.id));
    setValorPix('0,00');
    setValorEspecie('0,00');
    setConvidadosCount('0');
    setChildrenCount('0');
    setObservacao('');
    setSupervisaoPresente(false);
    setEditingReportId(null);
  }, [cellMembers]);

  // Carrega mais relatórios antigos de forma paginada (lotes de 10)
  const fetchMoreOlderReports = useCallback(async () => {
    if (!currentCellId || isLoadingMore || !hasMoreOlder) return;
    setIsLoadingMore(true);

    try {
      const url = `/api/reports?cellId=${encodeURIComponent(currentCellId)}${
        currentCell?.churchId ? `&churchId=${encodeURIComponent(currentCell.churchId)}` : ''
      }&mode=older&offset=${olderOffset}&limit=10`;

      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao carregar relatórios anteriores');
      }

      const newOlderReports: WeeklyReport[] = json.reports || [];

      setOlderReports((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const filteredNew = newOlderReports.filter((r) => !existingIds.has(r.id));
        return [...prev, ...filteredNew];
      });

      setOlderOffset(Number(json.nextOffset || olderOffset + newOlderReports.length));
      setLoadedOlderCount((prev) => prev + newOlderReports.length);
    } catch (err: any) {
      console.error('[WeeklyReportView] Erro ao carregar mais relatórios:', err);
      alert(`Não foi possível carregar mais relatórios: ${err.message || 'Erro de conexão'}`);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentCellId, currentCell?.churchId, olderOffset, isLoadingMore, hasMoreOlder]);

  const handleResetToRecent = useCallback(() => {
    setOlderReports([]);
    setOlderOffset(0);
    setLoadedOlderCount(0);
  }, []);

  const togglePresence = (id: string) => {
    setPresentMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const handleOpenNewModal = () => {
    resetForm();
    setDuplicateWarning(null);
    setIsModalOpen(true);
  };

  // Abre formulário populado para edição a partir de um relatório existente
  const handleOpenEditModal = (rep: WeeklyReport) => {
    if (rep.tesouraria_recebido) {
      setToastMessage('Este relatório já foi validado pela tesouraria e não pode ser editado.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    setEditingReportId(rep.id);
    setReportDate(rep.data_relatorio);
    setSupervisaoPresente(Boolean(rep.supervisao));
    setValorPix(formatMoneyInput(rep.valor_pix));
    setValorEspecie(formatMoneyInput(rep.valor_especie));
    setConvidadosCount(String(rep.qtd_convidados ?? 0));
    setChildrenCount(String(rep.qtd_criancas ?? 0));
    setObservacao(cleanObservationText(rep.observacao_texto || rep.observacao || ''));
    setPresentMemberIds(rep.presentes_ids || []);
    setDuplicateWarning(null);
    setSelectedReportForDetail(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingReportId(null);
    setDuplicateWarning(null);
  };

  // Exclui relatório semanal caso não tenha sido validado pela tesouraria
  const handleDeleteReport = async (rep: WeeklyReport) => {
    if (rep.tesouraria_recebido) {
      setToastMessage('Este relatório já foi validado pela tesouraria e não pode ser excluído.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    if (!canDeleteReport) {
      setToastMessage('Apenas líderes de célula ou lideranças superiores podem excluir relatórios.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    setIsDeletingReport(true);
    try {
      const res = await fetch(
        `/api/reports?id=${encodeURIComponent(rep.id)}&cellId=${encodeURIComponent(currentCell.id)}`,
        {
          method: 'DELETE',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao excluir relatório');
      }

      // 1. Remove o relatório excluído instantaneamente do cache do React Query
      queryClient.setQueriesData(
        { queryKey: ['weekly-reports', currentCell.id] },
        (old: any) => {
          if (!old) return old;
          const oldReports: WeeklyReport[] = old.reports || [];
          return {
            ...old,
            reports: oldReports.filter((r) => r.id !== rep.id),
          };
        }
      );

      // 2. Remove também de relatórios antigos carregados sob demanda
      setOlderReports((prev) => prev.filter((r) => r.id !== rep.id));

      // 3. Fecha os modais e exibe o feedback
      setSelectedReportForDetail(null);
      setReportToDelete(null);

      setToastMessage('Relatório excluído com sucesso!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('[WeeklyReportView] Erro ao excluir relatório:', err);
      alert(`Não foi possível excluir o relatório: ${err.message || 'Erro inesperado'}`);
    } finally {
      setIsDeletingReport(false);
    }
  };

  const executeSaveReport = async (allowOverwrite: boolean) => {
    if (!currentCell?.id) return;

    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingReportId);
      const targetReportId = editingReportId || duplicateWarning?.existingReport?.id;

      const payload = {
        churchId: currentCell.churchId || currentUser?.churchId,
        cellId: currentCell.id,
        memberId: currentUser?.id,
        authorName: currentUser?.name || 'Líder Responsável',
        reportDate,
        membersCount: presentMemberIds.length,
        valorPix: valorPix.trim() || '0,00',
        valorEspecie: valorEspecie.trim() || '0,00',
        convidadosCount: parseInt(convidadosCount, 10) || 0,
        childrenCount: parseInt(childrenCount, 10) || 0,
        observacao: observacao.trim(),
        supervisao: supervisaoPresente,
        presentMemberIds,
        allowOverwrite: allowOverwrite || isEditing,
        reportId: targetReportId,
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao salvar relatório');
      }

      // Se foi detectado um relatório duplicado e o usuário ainda não confirmou substituição
      if (json.duplicate && !allowOverwrite && !isEditing) {
        setDuplicateWarning({
          message: json.message,
          existingReport: json.existingReport,
        });
        setIsSubmitting(false);
        return;
      }

      // Atualiza imediatamente o cache do React Query
      if (json.report && currentCell?.id) {
        queryClient.setQueryData(
          ['weekly-reports', currentCell.id, currentCell.churchId],
          (old: any) => {
            if (!old) return { reports: [json.report], hasOlderReports: false, olderReportsCount: 0 };
            const oldReports: WeeklyReport[] = old.reports || [];
            const exists = oldReports.some((r) => r.id === json.report.id);
            const updatedReports = exists
              ? oldReports.map((r) => (r.id === json.report.id ? json.report : r))
              : [json.report, ...oldReports];
            return {
              ...old,
              reports: updatedReports,
            };
          }
        );
        if (selectedReportForDetail && selectedReportForDetail.id === json.report.id) {
          setSelectedReportForDetail(json.report);
        }
      }

      // Revalida em segundo plano com o banco de dados
      if (currentCell?.id) {
        queryClient.invalidateQueries({ queryKey: ['weekly-reports', currentCell.id] });
      }

      setDuplicateWarning(null);
      setIsModalOpen(false);
      setEditingReportId(null);
      setToastMessage(
        allowOverwrite || isEditing
          ? 'Relatório atualizado com sucesso!'
          : 'Relatório lançado com sucesso!'
      );
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('[WeeklyReportView] Erro ao enviar relatório:', err);
      alert(`Erro ao salvar relatório: ${err.message || 'Verifique sua conexão.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSaveReport(Boolean(editingReportId));
  };

  // Formata data ISO (YYYY-MM-DD) para formato compacto dd/MM
  const formatDateShort = (isoDate: string) => {
    if (!isoDate) return '--/--';
    try {
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    } catch {
      return isoDate;
    }
  };

  // Formata data ISO (YYYY-MM-DD) para formato legível completo no Brasil
  const formatDateBR = (isoDate: string) => {
    if (!isoDate) return '';
    try {
      const parts = isoDate.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
      }
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      return d.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-[calc(100vh-64px)] pb-12">
      {/* Toast de notificação */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#052447] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-5 border border-sky-400/30">
          <Check size={18} className="text-emerald-400" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 space-y-4">
        {/* Cabeçalho no Tom de Azul do App com Informações em Branco e Seletor de Célula */}
        <div className="bg-[#052447] text-white p-4 sm:p-5 rounded-2xl border border-[#052447] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight">
                Relatório Semanal
              </h3>
              {isFetchingReports && !isLoadingReports && (
                <span title="Sincronizando em segundo plano...">
                  <RefreshCw size={13} className="animate-spin text-sky-300" />
                </span>
              )}
            </div>
            <p className="text-xs text-sky-200 mt-0.5 truncate">
              Histórico semanal dos relatórios
            </p>
          </div>

          {/* Seletor de Célula (Estilo My Cell) & Botão Lançar Relatório Lado a Lado */}
          <div className="flex flex-row items-center gap-2 justify-start md:justify-end shrink-0 w-full md:w-auto">
            {/* Seletor de Célula em Ordem Alfabética (A-Z) para células sob cobertura */}
            {sortedCells.length > 1 && onSelectCell ? (
              <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl pl-2 pr-2.5 sm:px-2.5 py-2 min-w-0 shadow-2xs transition flex-1 sm:flex-initial">
                <span className="text-[10px] sm:text-xs font-bold text-sky-200 shrink-0 hidden sm:inline">
                  Célula:
                </span>
                <select
                  id="select-active-cell-report"
                  value={currentCell.id}
                  onChange={(e) => onSelectCell(e.target.value)}
                  className="text-[14px] sm:text-xs font-bold text-white bg-transparent focus:outline-none cursor-pointer w-full sm:w-auto sm:max-w-[180px] md:max-w-[200px] truncate [&>option]:text-slate-900 [&>option]:bg-white"
                  title="Selecionar célula (Ordem A-Z)"
                >
                  {sortedCells.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : sortedCells.length === 1 ? (
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-2.5 py-2 min-w-0 shadow-2xs">
                <span className="text-[10px] sm:text-xs font-bold text-sky-200 shrink-0 hidden sm:inline">
                  Célula:
                </span>
                <span className="text-xs font-bold text-white truncate max-w-[160px]" title={sortedCells[0].name}>
                  {sortedCells[0].name}
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleOpenNewModal}
              className="flex items-center gap-2 bg-white hover:bg-slate-100 text-[#052447] px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 shrink-0"
            >
              <Plus size={16} className="text-[#052447]" />
              <span>Lançar Relatório</span>
            </button>
          </div>
        </div>

        {/* LISTAGEM DOS RELATÓRIOS SEMANAIS */}
        <div className="space-y-2">
          {isLoadingReports ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs">
              <Loader2 size={32} className="animate-spin text-sky-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">Carregando relatórios...</p>
            </div>
          ) : reportsError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-800">
              <p className="text-xs font-bold">{reportsError}</p>
              <button
                type="button"
                onClick={() => refetchRecentReports()}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition"
              >
                Tentar novamente
              </button>
            </div>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-800 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <FileText size={28} />
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">Nenhum relatório lançado</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                Ainda não há relatórios semanais registrados para a célula{' '}
                <strong>{currentCell.name}</strong>.
              </p>
              <button
                type="button"
                onClick={handleOpenNewModal}
                className="inline-flex items-center gap-1.5 bg-[#052447] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#073366] transition cursor-pointer shadow-xs active:scale-95"
              >
                <Plus size={15} className="text-sky-300" />
                <span>Lançar Primeiro Relatório</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {/* LEGENDA / CABEÇALHO DA TABELA (Estilo My Cell) */}
              <div className="bg-slate-100/90 border-b border-slate-200/90 px-3 sm:px-4 py-2.5 grid grid-cols-12 gap-1.5 sm:gap-2 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider items-center select-none">
                <div className="col-span-1 sm:col-span-1 text-center" title="Supervisão Presente">
                  Sup.
                </div>
                <div className="col-span-2 sm:col-span-2 text-left">Data</div>
                <div className="col-span-2 sm:col-span-2 text-center sm:text-left">
                  <span className="sm:hidden">Pessoas</span>
                  <span className="hidden sm:inline">Presentes</span>
                </div>
                {/* Mobile: Coluna Oferta (Soma PIX + Espécie) */}
                <div className="col-span-3 sm:hidden text-right">Oferta</div>
                {/* Desktop: Colunas PIX e Espécie separadas */}
                <div className="hidden sm:block sm:col-span-2 text-right">PIX</div>
                <div className="hidden sm:block sm:col-span-2 text-right">Espécie</div>
                <div className="col-span-2 sm:col-span-2 text-right">Ação</div>
                <div className="col-span-2 sm:col-span-1 text-center" title="Status de Validação da Tesouraria">
                  Status
                </div>
              </div>

              {/* LINHAS COMPACTAS DOS RELATÓRIOS */}
              <div className="divide-y divide-slate-100">
                {reports.map((rep) => {
                  const formattedDateShort = formatDateShort(rep.data_relatorio);
                  const totalPresentes =
                    (rep.qtd_membros || 0) + (rep.qtd_convidados || 0) + (rep.qtd_criancas || 0);

                  return (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedReportForDetail(rep)}
                      className="px-3 sm:px-4 py-2.5 grid grid-cols-12 gap-1.5 sm:gap-2 items-center hover:bg-sky-50/50 transition cursor-pointer text-xs group"
                    >
                      {/* 1. Supervisão (Ícone Verde ou Vermelho) */}
                      <div className="col-span-1 sm:col-span-1 flex justify-center">
                        <div
                          title={
                            rep.supervisao ? 'Supervisão presente (Sim)' : 'Sem supervisão (Não)'
                          }
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border shadow-2xs ${
                            rep.supervisao
                              ? 'bg-emerald-100 text-emerald-600 border-emerald-300'
                              : 'bg-rose-100 text-rose-600 border-rose-300'
                          }`}
                        >
                          {rep.supervisao ? <ShieldCheck size={14} /> : <ShieldX size={14} />}
                        </div>
                      </div>

                      {/* 2. Data (dd/MM) */}
                      <div className="col-span-2 sm:col-span-2 flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400 hidden sm:inline shrink-0" />
                        <span className="font-semibold text-slate-700 text-xs sm:text-sm tracking-tight">
                          {formattedDateShort}
                        </span>
                      </div>

                      {/* 3. Total Presentes */}
                      <div className="col-span-2 sm:col-span-2 flex items-center justify-center sm:justify-start">
                        <span className="inline-flex items-center gap-1 font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80 text-xs sm:text-sm">
                          <Users size={13} className="text-sky-700 shrink-0" />
                          <span>{totalPresentes}</span>
                        </span>
                      </div>

                      {/* 4. Oferta no Mobile (Soma PIX + Espécie) */}
                      <div className="col-span-3 sm:hidden text-right">
                        <span className="font-bold text-emerald-900 text-xs truncate">
                          {formatMoney(
                            Number(rep.valor_pix || 0) + Number(rep.valor_especie || 0)
                          )}
                        </span>
                      </div>

                      {/* 5. PIX no Desktop */}
                      <div className="hidden sm:block sm:col-span-2 text-right">
                        <span className="font-bold text-slate-800 text-xs">
                          {formatMoney(rep.valor_pix)}
                        </span>
                      </div>

                      {/* 6. Espécie no Desktop */}
                      <div className="hidden sm:block sm:col-span-2 text-right">
                        <span className="font-bold text-slate-800 text-xs">
                          {formatMoney(rep.valor_especie)}
                        </span>
                      </div>

                      {/* 7. Ação / Ver detalhes */}
                      <div className="col-span-2 sm:col-span-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReportForDetail(rep);
                          }}
                          className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition cursor-pointer shadow-2xs group-hover:bg-[#052447] group-hover:text-white group-hover:border-[#052447] flex items-center gap-1 shrink-0"
                          title="Ver detalhes"
                        >
                          <Eye size={14} />
                          <span className="hidden sm:inline">Ver detalhes</span>
                        </button>
                      </div>

                      {/* 8. Status da Tesouraria (Ícone Verde se validado pela tesouraria) */}
                      <div className="col-span-2 sm:col-span-1 flex justify-center">
                        {rep.tesouraria_recebido ? (
                          <div
                            title="Relatório validado pela Tesouraria"
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-600 border border-emerald-300 shadow-2xs"
                          >
                            <Check size={14} className="stroke-[2.5]" />
                          </div>
                        ) : (
                          <div
                            title="Aguardando validação da Tesouraria"
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-slate-100 text-slate-400 border border-slate-200"
                          >
                            <Clock size={12} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé da Tabela: Controle de Período e Carregamento Sob Demanda */}
              <div className="bg-slate-50 border-t border-slate-200/90 px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock size={14} className="text-sky-700 shrink-0" />
                  <span className="font-semibold text-[11px] sm:text-xs text-slate-700">
                    {loadedOlderCount > 0
                      ? `Últimos 2 meses + ${loadedOlderCount} anteriores`
                      : 'Últimos 2 meses'}
                  </span>
                  <span className="text-[10px] bg-sky-100 text-sky-900 font-bold px-2 py-0.5 rounded-md">
                    {reports.length} {reports.length === 1 ? 'relatório' : 'relatórios'}
                  </span>
                </div>

                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* Botão Carregar Mais Relatórios Antigos (Lote de 10) */}
                  {hasMoreOlder && (
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={fetchMoreOlderReports}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#052447] hover:bg-[#073366] text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {isLoadingMore ? (
                        <Loader2 size={13} className="animate-spin text-sky-300" />
                      ) : (
                        <History size={13} className="text-sky-300" />
                      )}
                      <span>
                        {isLoadingMore
                          ? 'Carregando...'
                          : `Carregar mais (${Math.max(0, olderReportsCount - loadedOlderCount)} restantes)`}
                      </span>
                    </button>
                  )}

                  {/* Indicador de histórico completo carregado */}
                  {!hasMoreOlder && loadedOlderCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                      <Check size={12} className="text-emerald-600" />
                      <span>Todo o histórico carregado</span>
                    </span>
                  )}

                  {/* Opção para redefinir aos últimos 2 meses */}
                  {loadedOlderCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetToRecent}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer shadow-2xs"
                      title="Redefinir visualização rápida"
                    >
                      <Clock size={12} className="text-slate-500" />
                      <span>Ver apenas 2 meses</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL PRÓPRIO: DETALHES DO RELATÓRIO COM BOTÃO EDITAR */}
        {selectedReportForDetail && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95 duration-150">
              {/* Cabeçalho do Modal de Detalhes */}
              <div className="bg-[#052447] text-white p-4 sm:px-5 sm:py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-sky-300" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                      Detalhes do Relatório Semanal
                    </h3>
                    <p className="text-[11px] text-sky-200/80">
                      {currentCell.name}{' '}
                      {selectedReportForDetail.numero_semana
                        ? `• Semana ${selectedReportForDetail.numero_semana}`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReportForDetail(null)}
                  className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Corpo do Modal com Todas as Informações */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
                {/* Cartão de Data e Status da Supervisão */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">
                      Data da Reunião
                    </span>
                    <span className="font-extrabold text-[#052447] text-sm capitalize">
                      {formatDateBR(selectedReportForDetail.data_relatorio)}
                    </span>
                    {selectedReportForDetail.lancado_por_nome && (
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Lançado por:{' '}
                        <strong className="text-slate-700">
                          {selectedReportForDetail.lancado_por_nome}
                        </strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div
                      className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center gap-1.5 shrink-0 ${
                        selectedReportForDetail.supervisao
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {selectedReportForDetail.supervisao ? (
                        <ShieldCheck size={14} className="text-emerald-600" />
                      ) : (
                        <ShieldX size={14} className="text-rose-600" />
                      )}
                      <span>
                        {selectedReportForDetail.supervisao
                          ? 'Supervisão Presente'
                          : 'Sem Supervisão'}
                      </span>
                    </div>

                    {selectedReportForDetail.tesouraria_recebido && (
                      <div className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-100 text-emerald-900 font-bold text-xs flex items-center gap-1.5 shrink-0">
                        <Check size={13} className="text-emerald-700 stroke-[2.5]" />
                        <span>Validado pela Tesouraria</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumo de Participantes */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Participantes da Reunião
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] text-sky-800 font-bold uppercase block">Membros</span>
                      <span className="text-base font-extrabold text-sky-950">
                        {selectedReportForDetail.qtd_membros ?? 0}
                      </span>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] text-emerald-800 font-bold uppercase block">
                        Convidados
                      </span>
                      <span className="text-base font-extrabold text-emerald-950">
                        {selectedReportForDetail.qtd_convidados ?? 0}
                      </span>
                    </div>

                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 text-center">
                      <span className="text-[10px] text-amber-800 font-bold uppercase block">
                        Crianças
                      </span>
                      <span className="text-base font-extrabold text-amber-950">
                        {selectedReportForDetail.qtd_criancas ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Resumo Financeiro - Linha única: PIX: Valor | Espécie: Valor | Total: Valor Somado */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Ofertas Arrecadadas
                  </span>
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 sm:px-4 flex items-center justify-between text-[11px] sm:text-xs shadow-2xs">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 font-semibold">PIX:</span>
                      <span className="font-extrabold text-slate-900">
                        {formatMoney(selectedReportForDetail.valor_pix)}
                      </span>
                    </div>

                    <span className="text-slate-300 font-medium select-none px-1">|</span>

                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 font-semibold">Espécie:</span>
                      <span className="font-extrabold text-slate-900">
                        {formatMoney(selectedReportForDetail.valor_especie)}
                      </span>
                    </div>

                    <span className="text-slate-300 font-medium select-none px-1">|</span>

                    <div className="flex items-center gap-1">
                      <span className="text-emerald-800 font-bold">Total:</span>
                      <span className="font-extrabold text-emerald-950">
                        {formatMoney(
                          Number(selectedReportForDetail.valor_pix || 0) +
                            Number(selectedReportForDetail.valor_especie || 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Membros Presentes */}
                {selectedReportForDetail.presentes_ids &&
                  selectedReportForDetail.presentes_ids.length > 0 && (
                    <div className="bg-sky-50/50 rounded-xl p-2.5 sm:p-3 border border-sky-200/80">
                      <div className="text-[10px] sm:text-[11px] font-bold text-sky-900 uppercase mb-1.5 flex items-center justify-between">
                        <span>
                          Membros Presentes ({selectedReportForDetail.presentes_ids.length})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedReportForDetail.presentes_ids.map((mId) => {
                          const memberName =
                            selectedReportForDetail.presentes_nomes?.[mId] ||
                            selectedReportForDetail.presentes_membros?.find((x) => x.id === mId)?.nome ||
                            cellMembers.find((x) => x.id === mId)?.name ||
                            directMembers?.find((x) => x.id === mId)?.name ||
                            members.find((x) => x.id === mId)?.name ||
                            'Membro';

                          return (
                            <span
                              key={mId}
                              className="bg-white border border-sky-200 text-slate-800 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-2xs flex items-center gap-1 leading-tight"
                            >
                              <Check size={10} className="text-emerald-600 shrink-0 stroke-[2.5]" />
                              <span className="truncate max-w-[140px] sm:max-w-none">{memberName}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Observação sobre a Reunião */}
                {Boolean(
                  cleanObservationText(
                    selectedReportForDetail.observacao_texto || selectedReportForDetail.observacao
                  )
                ) && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                    <div className="text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Observação sobre a Reunião
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-line font-medium">
                      {cleanObservationText(
                        selectedReportForDetail.observacao_texto ||
                          selectedReportForDetail.observacao
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Rodapé com Botões de Fechar, Excluir e Editar (oculta Excluir/Editar se validado pela tesouraria) */}
              <div className="bg-slate-50 border-t border-slate-200 p-3 sm:px-5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedReportForDetail(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Fechar
                </button>

                <div className="flex items-center gap-2">
                  {!selectedReportForDetail.tesouraria_recebido && canDeleteReport && (
                    <button
                      type="button"
                      onClick={() => setReportToDelete(selectedReportForDetail)}
                      disabled={isDeletingReport}
                      className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Excluir Relatório Semanal"
                    >
                      <Trash2 size={14} className="text-rose-600 shrink-0" />
                      <span className="hidden sm:inline">Excluir Relatório</span>
                      <span className="sm:hidden">Excluir</span>
                    </button>
                  )}

                  {!selectedReportForDetail.tesouraria_recebido && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(selectedReportForDetail)}
                      className="px-4 py-2 rounded-xl bg-[#052447] hover:bg-[#073366] text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pencil size={14} className="text-sky-300 shrink-0" />
                      <span>Editar Relatório</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
        {reportToDelete && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-800 text-center mb-1">
                Excluir Relatório Semanal?
              </h3>
              <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
                Tem certeza que deseja excluir o relatório de{' '}
                <strong>{formatDateBR(reportToDelete.data_relatorio)}</strong> da célula{' '}
                <strong>{currentCell.name}</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportToDelete(null)}
                  disabled={isDeletingReport}
                  className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteReport(reportToDelete)}
                  disabled={isDeletingReport}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingReport ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  <span>{isDeletingReport ? 'Excluindo...' : 'Sim, Excluir'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE FORMULÁRIO: LANÇAR OU EDITAR RELATÓRIO */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 my-auto animate-in zoom-in-95 duration-150">
              {/* Cabeçalho do Modal */}
              <div className="bg-[#052447] text-white p-4 sm:px-6 sm:py-4.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    {editingReportId ? (
                      <Pencil size={20} className="text-sky-300" />
                    ) : (
                      <FileText size={20} className="text-sky-300" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                      {editingReportId ? 'Editar Relatório Semanal' : 'Lançar Relatório Semanal'}
                    </h3>
                    <p className="text-xs text-sky-200/80">
                      Célula {currentCell.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Formulário do Modal */}
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
                  {/* Bloco 1: Data Célula e Supervisão presente? */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Data Célula (lado esquerdo) */}
                    <div>
                      <label
                        htmlFor="modal-report-date"
                        className="text-[11px] font-bold text-slate-700 block mb-0.5"
                      >
                        Data Célula
                      </label>
                      <input
                        id="modal-report-date"
                        type="date"
                        required
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 shadow-2xs"
                      />
                    </div>

                    {/* Supervisão presente? (lado direito) */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block mb-0.5 truncate">
                        Supervisão presente?
                      </span>
                      <div className="flex items-center h-[34px] bg-slate-100 border border-slate-200 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setSupervisaoPresente(false)}
                          className={`flex-1 h-full rounded-md text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                            !supervisaoPresente
                              ? 'bg-sky-100 text-sky-900 border border-sky-200 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Não
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupervisaoPresente(true)}
                          className={`flex-1 h-full rounded-md text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                            supervisaoPresente
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Sim
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Membros Presentes */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 mb-2">
                      <h4 className="text-xs font-bold text-[#052447] flex items-center gap-1.5">
                        <Users size={14} className="text-emerald-700" />
                        <span>Membros Presentes</span>
                      </h4>
                      <span className="text-[10px] sm:text-[11px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                        {presentMemberIds.length} de {cellMembers.length} presentes
                      </span>
                    </div>

                    {cellMembers.length === 0 ? (
                      <p className="text-[11px] text-slate-500 text-center py-2">
                        Nenhum membro cadastrado nesta célula ainda.
                      </p>
                    ) : (
                      <div
                        className={`grid grid-cols-2 gap-1.5 ${
                          cellMembers.length > 20 ? 'max-h-[300px] overflow-y-auto pr-1' : ''
                        }`}
                      >
                        {cellMembers.map((member) => {
                          const isPresent = presentMemberIds.includes(member.id);
                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => togglePresence(member.id)}
                              className={`flex items-center justify-between p-2 px-2.5 rounded-lg border text-left transition cursor-pointer text-xs ${
                                isPresent
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate pr-1 font-semibold">{member.name}</span>
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                  isPresent
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isPresent && <Check size={11} strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bloco 3: Ofertas (PIX e Espécie) */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Oferta PIX */}
                    <div>
                      <label
                        htmlFor="modal-valor-pix"
                        className="text-[11px] font-bold text-slate-700 block mb-0.5"
                      >
                        Oferta PIX (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          id="modal-valor-pix"
                          type="text"
                          inputMode="numeric"
                          value={valorPix}
                          onKeyDown={handleKeyDownOnlyNumbers}
                          onChange={(e) => handleCurrencyChange(e.target.value, setValorPix)}
                          className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Oferta Espécie */}
                    <div>
                      <label
                        htmlFor="modal-valor-especie"
                        className="text-[11px] font-bold text-slate-700 block mb-0.5"
                      >
                        Oferta Espécie (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          id="modal-valor-especie"
                          type="text"
                          inputMode="numeric"
                          value={valorEspecie}
                          onKeyDown={handleKeyDownOnlyNumbers}
                          onChange={(e) => handleCurrencyChange(e.target.value, setValorEspecie)}
                          className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloco 4: Convidados e Crianças */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Convidados */}
                    <div>
                      <label
                        htmlFor="modal-convidados"
                        className="text-[11px] font-bold text-slate-700 block mb-0.5"
                      >
                        Convidados
                      </label>
                      <input
                        id="modal-convidados"
                        type="number"
                        min="0"
                        value={convidadosCount}
                        onChange={(e) => setConvidadosCount(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 shadow-2xs"
                      />
                    </div>

                    {/* Crianças */}
                    <div>
                      <label
                        htmlFor="modal-children"
                        className="text-[11px] font-bold text-slate-700 block mb-0.5"
                      >
                        Crianças
                      </label>
                      <input
                        id="modal-children"
                        type="number"
                        min="0"
                        value={childrenCount}
                        onChange={(e) => setChildrenCount(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Bloco 5: Observações da Reunião */}
                  <div>
                    <label
                      htmlFor="modal-observacao"
                      className="text-[11px] font-bold text-slate-700 block mb-0.5"
                    >
                      Observações da Reunião (opcional)
                    </label>
                    <textarea
                      id="modal-observacao"
                      rows={2}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Algum acontecimento especial, testemunho ou detalhe da reunião..."
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 resize-none shadow-2xs"
                    />
                  </div>
                </div>

                {/* Rodapé do Modal com Botões */}
                <div className="bg-slate-50 border-t border-slate-200 p-3 sm:px-6 sm:py-3.5 flex items-center justify-end gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-[#052447] hover:bg-[#073366] text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin text-sky-300" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Check size={15} className="text-sky-300" />
                        <span>
                          {editingReportId ? 'Salvar Alterações' : 'Salvar Relatório'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Substituição de Relatório Duplicado */}
        {duplicateWarning && (
          <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-200 animate-in zoom-in-95 duration-150 flex flex-col">
              {/* Cabeçalho do Alerta */}
              <div className="bg-amber-500/10 border-b border-amber-200/80 p-4 sm:p-5 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                  <AlertTriangle size={22} className="text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    Relatório já Existente Nesta Semana
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Já existe um relatório registrado para a{' '}
                    <span className="font-bold text-slate-900">{currentCell.name}</span> na{' '}
                    <span className="font-bold text-amber-900">
                      Semana {duplicateWarning.existingReport.numero_semana} de{' '}
                      {duplicateWarning.existingReport.ano_iso}
                    </span>
                    .
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  disabled={isSubmitting}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Informações do Relatório Atual no Sistema */}
              <div className="p-4 sm:p-5 space-y-3.5">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Dados do Relatório Atual no Sistema
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="text-[10px] text-slate-500 block font-medium">Data Lançada</span>
                      <span className="font-bold text-slate-800">
                        {formatDateBR(duplicateWarning.existingReport.data_relatorio)}
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="text-[10px] text-slate-500 block font-medium">Lançado Por</span>
                      <span className="font-bold text-slate-800 truncate block">
                        {duplicateWarning.existingReport.lancado_por_nome || 'Líder'}
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="text-[10px] text-slate-500 block font-medium">Pessoas</span>
                      <span className="font-bold text-slate-800">
                        {duplicateWarning.existingReport.qtd_membros} membros •{' '}
                        {duplicateWarning.existingReport.qtd_convidados} conv.
                      </span>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="text-[10px] text-slate-500 block font-medium">Ofertas</span>
                      <span className="font-bold text-emerald-800">
                        {formatMoney(
                          (duplicateWarning.existingReport.valor_pix || 0) +
                            (duplicateWarning.existingReport.valor_especie || 0)
                        )}
                      </span>
                    </div>
                  </div>

                  {Boolean(
                    cleanObservationText(duplicateWarning.existingReport.observacao)
                  ) && (
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70 text-xs">
                      <span className="text-[10px] text-slate-500 block font-medium mb-0.5">
                        Observação
                      </span>
                      <p className="text-slate-700 italic line-clamp-2">
                        &ldquo;
                        {cleanObservationText(duplicateWarning.existingReport.observacao)}
                        &rdquo;
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-3 text-xs text-amber-950 font-medium">
                  <strong>Deseja substituir as informações existentes?</strong>
                  <p className="text-amber-900/90 text-[11px] mt-0.5">
                    Ao confirmar, os dados preenchidos no formulário (valores, presenças dos membros e observações) irão atualizar o relatório desta semana.
                  </p>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="bg-slate-50 border-t border-slate-200 p-3 sm:px-5 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Manter Original / Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => executeSaveReport(true)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-amber-200" />
                      <span>Substituindo...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} className="text-amber-200" />
                      <span>Sim, Substituir Informações</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
