'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CelulaCardItem, UserProfile, CellGroup, OrganizationalUnit } from '@/types';
import { getCelulasByIgreja } from '@/lib/celulasService';
import { AppChurchService } from '@/lib/supabase';
import { validateImageFile, formatFileSize } from '@/lib/imageOptimizer';
import { uploadUnitPhoto, deleteUnitPhoto, isUnitStorageUrl } from '@/lib/unitPhotoStorage';
import { CelulaCard } from './CelulaCard';
import { CelulaSearchInput } from './CelulaSearchInput';
import {
  AlertCircle,
  RotateCcw,
  Users,
  Search,
  Sparkles,
  Loader2,
  Building,
  X,
  MapPin,
  Calendar,
  Clock,
  Edit3,
  ShieldCheck,
  Eye,
  Camera,
  Upload,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface NossasCelulasViewProps {
  currentUser?: UserProfile | null;
  churchName?: string;
  cells?: CellGroup[];
  initialCelulas?: CelulaCardItem[];
  initialTotal?: number;
  onSelectCell?: (cellId: string) => void;
  onUpdateCell?: (updatedCell: CellGroup) => void | Promise<void>;
}

const DIAS_OPTIONS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

const PRESET_HORARIOS = ['19:00', '19:30', '20:00'];

function mapCellGroupToCardItem(c: CellGroup): CelulaCardItem {
  const count = typeof c.quantidade_membros === 'number' ? c.quantidade_membros : (c.memberCount || 0);
  return {
    id: c.id,
    unidadeId: c.id,
    churchId: c.churchId,
    nome: c.name,
    bairro: c.bairro || 'Centro',
    endereco: c.address || '',
    diaSemana: c.meetingDay || 'Quarta-feira',
    horario: c.meetingTime || '19:30',
    fotoUrl: c.fotoUrl,
    memberCount: count,
    quantidade_membros: count,
    leaderNames: c.leaderNames || (c.leaderName ? [c.leaderName] : []),
    leaderMemberIds: c.leaderMemberIds || [],
    sectorName: c.sectorName,
    areaName: c.areaName,
  };
}

export const NossasCelulasView: React.FC<NossasCelulasViewProps> = ({
  currentUser,
  churchName,
  cells,
  initialCelulas,
  onSelectCell,
  onUpdateCell,
}) => {
  const queryClient = useQueryClient();
  const churchId = currentUser?.churchId || 'church-sobral';
  const displayChurchName = churchName || currentUser?.churchName || 'Nossa Igreja';

  // 1. Unidades hierárquicas para verificação estrita de cobertura (compartilhado via React Query)
  const { data: cachedUnits } = useQuery({
    queryKey: ['churchUnits', churchId],
    queryFn: () => AppChurchService.getUnits(churchId),
    enabled: Boolean(churchId),
    staleTime: 1000 * 60 * 15,
  });
  const units = cachedUnits || [];

  // Se recebemos cells via props do App principal (já em memória e cacheadas), convertemos instantaneamente
  const propCardCelulas = useMemo(() => {
    if (cells && cells.length > 0) {
      return cells.map(mapCellGroupToCardItem);
    }
    return undefined;
  }, [cells]);

  const hasPropData = Boolean(propCardCelulas && propCardCelulas.length > 0);

  // 2. React Query: Células da congregação em cache persistente de alta performance (15 min)
  const {
    data: queriedCelulas,
    isLoading: isQueryLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['celulas-gallery', churchId],
    queryFn: async () => {
      if (!churchId) return [];
      const res = await getCelulasByIgreja({
        churchId,
        page: 1,
        pageSize: 1000, // Carrega todas as células da congregação em lote único
      });
      return res.celulas;
    },
    // Se já recebemos cells do app via prop, NÃO disparamos requisição redundante pela rede!
    // Isso economiza 100% das chamadas/Log Queries no Supabase e abre a tela em 0ms
    enabled: Boolean(churchId) && !hasPropData,
    initialData: propCardCelulas || (initialCelulas && initialCelulas.length > 0 ? initialCelulas : undefined),
    staleTime: 1000 * 60 * 15,
  });

  // Lista de células direta: prioriza prop instantânea / cache do React Query
  const allCelulas: CelulaCardItem[] = useMemo(() => {
    if (propCardCelulas && propCardCelulas.length > 0) {
      return propCardCelulas;
    }
    if (queriedCelulas && queriedCelulas.length > 0) {
      return queriedCelulas;
    }
    if (initialCelulas && initialCelulas.length > 0) {
      return initialCelulas;
    }
    return [];
  }, [propCardCelulas, queriedCelulas, initialCelulas]);

  // 3. Estados de Filtros Rápidos (Em Memória / Instantâneo)
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDia, setSelectedDia] = useState<string>('todos');
  const [isPending, startTransition] = useTransition();

  // Filtragem 100% em memória (0ms latency, sem consultas adicionais ao banco ao trocar o dia)
  const filteredCelulas = useMemo(() => {
    let list = allCelulas;

    // Filtro por dia da semana
    if (selectedDia && selectedDia !== 'todos') {
      const targetDia = selectedDia.toLowerCase().replace(/-feira/g, '').trim();
      list = list.filter((c) => {
        const cellDia = (c.diaSemana || '').toLowerCase().replace(/-feira/g, '').trim();
        return cellDia.includes(targetDia) || targetDia.includes(cellDia);
      });
    }

    // Filtro por termo de busca (nome, bairro, endereço, líderes)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((c) => {
        const nameMatch = c.nome?.toLowerCase().includes(q);
        const bairroMatch = c.bairro?.toLowerCase().includes(q);
        const enderecoMatch = c.endereco?.toLowerCase().includes(q);
        const leaderMatch = c.leaderNames?.some((n) => n.toLowerCase().includes(q));
        const dayMatch = c.diaSemana?.toLowerCase().includes(q);
        return nameMatch || bairroMatch || enderecoMatch || leaderMatch || dayMatch;
      });
    }

    return list;
  }, [allCelulas, selectedDia, searchTerm]);

  // 4. Nível de Hierarquia do Usuário Logado
  const userHierarchyLevel = useMemo(() => {
    if (!currentUser) return 1;
    if (currentUser.isSystemAdmin || currentUser.role === 'Administrador') {
      return 999;
    }
    const roleLower = (currentUser.role || '').toLowerCase();
    if (roleLower.includes('pastor')) return 7;
    if (roleLower.includes('distrito')) return 6;
    if (roleLower.includes('rede')) return 5;
    if (roleLower.includes('área') || roleLower.includes('area')) return 4;
    if (roleLower.includes('setor')) return 3;
    if (roleLower.includes('célula') || roleLower.includes('celula') || roleLower.includes('lider')) return 2;
    return 1;
  }, [currentUser]);

  // 5. Verificação de Permissão de Edição da Célula (Regra Estrita de Cobertura Hierárquica)
  const canEditCell = useCallback(
    (targetCell: CelulaCardItem | null): boolean => {
      if (!targetCell || !currentUser) return false;

      // Usuário nível 1 (Membro/Apoio) NUNCA edita células
      if (userHierarchyLevel <= 1) return false;

      // Pastores e administradores possuem cobertura integral de todas as células da congregação
      const isPastorOrAdmin =
        currentUser.isSystemAdmin ||
        currentUser.role === 'Administrador' ||
        currentUser.role === 'Pastor Titular' ||
        currentUser.role === 'Pastor' ||
        currentUser.role === 'Pastor(a)' ||
        userHierarchyLevel >= 7;

      if (isPastorOrAdmin) return true;

      const targetCellUnitId = targetCell.unidadeId || targetCell.id;

      // 1. Líder direto da célula: só pode editar a célula à qual está vinculado como líder
      const isDirectCellLeader =
        (targetCell.leaderMemberIds && targetCell.leaderMemberIds.includes(currentUser.id)) ||
        (targetCell.leaderNames &&
          targetCell.leaderNames.some(
            (n) => n.toLowerCase() === currentUser.name?.toLowerCase()
          )) ||
        currentUser.currentCellId === targetCell.id ||
        currentUser.currentCellId === targetCell.unidadeId;

      if (userHierarchyLevel === 2) {
        // Líder de célula só edita se for o líder direto desta célula específica
        return isDirectCellLeader;
      }

      // Se for líder direto de nível superior, permite
      if (isDirectCellLeader) return true;

      // 2. Líderes Superiores (Setor, Área, Rede, Distrito):
      // Podem editar se a célula estiver dentro da sua subárvore de unidades
      if (units && units.length > 0) {
        const currentUnit = units.find((u) => u.id === targetCellUnitId);
        if (currentUnit) {
          // Verifica ancestrais na árvore
          let currentParentId: string | null | undefined = currentUnit.parentId;
          while (currentParentId) {
            const parentUnit = units.find((u) => u.id === currentParentId);
            if (!parentUnit) break;

            // Se o usuário é líder desta unidade ancestral (ex: líder do setor pai)
            const isLeaderOfParent = parentUnit.leaders?.some(
              (l) => l.id === currentUser.id || l.name?.toLowerCase() === currentUser.name?.toLowerCase()
            );
            if (isLeaderOfParent) {
              return true;
            }

            currentParentId = parentUnit.parentId;
          }
        }
      }

      return false;
    },
    [currentUser, userHierarchyLevel, units]
  );

  // =========================================================================
  // MODAL DE DETALHES & EDIÇÃO DA CÉLULA
  // =========================================================================
  const [selectedCell, setSelectedCell] = useState<CelulaCardItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Estados dos campos de edição
  const [editName, setEditName] = useState<string>('');
  const [editMeetingDay, setEditMeetingDay] = useState<string>('Quarta-feira');
  const [editMeetingTime, setEditMeetingTime] = useState<string>('19:30');
  const [editNeighborhood, setEditNeighborhood] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editFotoUrl, setEditFotoUrl] = useState<string>('');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Estados de upload de foto
  const [isOptimizingPhoto, setIsOptimizingPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoStats, setPhotoStats] = useState<{ size: string; reduction: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Foto já enviada ao Storage nesta edição mas ainda não salva na célula
  // (apagada se o usuário trocar de novo ou fechar sem salvar).
  const pendingUploadedPhotoRef = useRef<string | null>(null);
  const photoOwnerId = currentUser?.id || currentUser?.login || '';

  const discardPendingPhoto = () => {
    if (pendingUploadedPhotoRef.current) {
      deleteUnitPhoto(pendingUploadedPhotoRef.current, photoOwnerId);
      pendingUploadedPhotoRef.current = null;
    }
  };

  const handleOpenDetails = (cellItem: CelulaCardItem) => {
    discardPendingPhoto();
    setSelectedCell(cellItem);
    setEditName(cellItem.nome || '');
    setEditMeetingDay(cellItem.diaSemana || 'Quarta-feira');
    setEditMeetingTime(cellItem.horario || '19:30');
    setEditNeighborhood(cellItem.bairro || '');
    setEditAddress(cellItem.endereco || '');
    setEditFotoUrl(cellItem.fotoUrl || '');
    setPhotoStats(null);
    setPhotoError(null);
    setSaveError(null);
    setSaveSuccess(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    discardPendingPhoto();
    setIsModalOpen(false);
    setSelectedCell(null);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setPhotoError(null);

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setPhotoError(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    setIsOptimizingPhoto(true);
    try {
      // Converte para WebP (ou JPEG leve, se o navegador não codificar WebP),
      // reduz até ficar leve e envia direto ao Storage (bucket "units").
      // Só a URL pública vai para unidades.foto_url — nunca o base64.
      const result = await uploadUnitPhoto(file, photoOwnerId);
      discardPendingPhoto();
      pendingUploadedPhotoRef.current = result.publicUrl;
      setEditFotoUrl(result.publicUrl);
      setPhotoStats({
        size: formatFileSize(result.optimizedSize),
        reduction: result.reductionLabel,
      });
      setPhotoError(null);
    } catch (err: any) {
      console.error('Falha ao processar/enviar foto da célula:', err);
      setPhotoError(err?.message || 'Não foi possível enviar a foto. Tente novamente com outra imagem.');
    } finally {
      setIsOptimizingPhoto(false);
    }
  };

  const handleSaveCell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell) return;
    setSaveError(null);

    if (!editName.trim()) {
      setSaveError('Por favor, informe o nome da célula.');
      return;
    }

    if (!editMeetingTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(editMeetingTime.trim())) {
      setSaveError('Por favor, selecione um horário válido de reunião (HH:mm).');
      return;
    }

    if (isOptimizingPhoto) {
      setSaveError('Aguarde o envio da foto terminar antes de salvar.');
      return;
    }

    if (editFotoUrl.trim().startsWith('data:')) {
      setSaveError('A foto precisa ser enviada novamente. Selecione a imagem outra vez.');
      return;
    }

    const previousFotoUrl = selectedCell.fotoUrl || '';

    setIsSaving(true);
    try {
      const updated = await AppChurchService.updateCell({
        cellId: selectedCell.unidadeId || selectedCell.id,
        churchId: selectedCell.churchId || churchId,
        name: editName.trim(),
        meetingDay: editMeetingDay.trim(),
        meetingTime: editMeetingTime.trim(),
        neighborhood: editNeighborhood.trim(),
        address: editAddress.trim(),
        // '' limpa a foto; URL do Storage substitui a anterior
        fotoUrl: editFotoUrl.trim(),
        userMemberId: currentUser?.id,
      });

      // Salvo: a foto enviada deixa de ser "pendente" e a antiga (se era do Storage) é removida
      pendingUploadedPhotoRef.current = null;
      if (previousFotoUrl && previousFotoUrl !== editFotoUrl.trim() && isUnitStorageUrl(previousFotoUrl)) {
        deleteUnitPhoto(previousFotoUrl, photoOwnerId);
      }

      // 1. Atualização seletiva e instantânea no estado local (sem recarregar o banco)
      const updatedCardItem: CelulaCardItem = {
        ...selectedCell,
        nome: updated.name,
        bairro: updated.bairro || editNeighborhood.trim() || 'Centro',
        endereco: updated.address || editAddress.trim(),
        diaSemana: updated.meetingDay || editMeetingDay.trim(),
        horario: updated.meetingTime || editMeetingTime.trim(),
        fotoUrl: updated.fotoUrl || editFotoUrl.trim() || undefined,
        memberCount: updated.memberCount ?? selectedCell.memberCount,
        leaderNames: updated.leaderNames || selectedCell.leaderNames,
        leaderMemberIds: updated.leaderMemberIds || selectedCell.leaderMemberIds,
      };

      // 1. Atualização otimista e instantânea no cache do React Query
      queryClient.setQueryData(['celulas-gallery', churchId], (old: CelulaCardItem[] | undefined) => {
        if (!old) return [updatedCardItem];
        return old.map((c) =>
          c.id === selectedCell.id || c.unidadeId === selectedCell.unidadeId ? updatedCardItem : c
        );
      });

      // 2. Notifica callback externo
      if (onUpdateCell) {
        await onUpdateCell(updated);
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsModalOpen(false);
        setSelectedCell(null);
      }, 700);
    } catch (err: any) {
      console.error('Erro ao salvar dados da célula:', err);
      setSaveError(err?.message || 'Erro ao salvar alterações da célula.');
    } finally {
      setIsSaving(false);
    }
  };

  const isEditable = canEditCell(selectedCell);

  const isLoading = isQueryLoading && allCelulas.length === 0;
  const hasError = queryError && allCelulas.length === 0;

  return (
    <div id="screen-nossas-celulas" className="bg-[#e9eff6] min-h-screen pb-20 font-sans w-full overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-2 w-full">
        {/* Input de Busca com Debounce & Filtro de Dia (Filtro instantâneo em memória) */}
        <div className="mb-5">
          <CelulaSearchInput
            onSearchChange={setSearchTerm}
            onDiaSemanaChange={setSelectedDia}
            selectedDiaSemana={selectedDia}
            totalCount={filteredCelulas.length}
            isPending={isPending}
          />
        </div>

        {/* 1. ESTADO DE ERRO */}
        {hasError && (
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl text-center my-6 space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-base text-rose-900">Erro ao carregar células</h3>
              <p className="text-xs sm:text-sm text-rose-700 mt-1 max-w-md mx-auto">
                Não foi possível consultar as células da congregação.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <RotateCcw size={14} />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {/* 2. ESTADO DE CARREGAMENTO INICIAL */}
        {isLoading && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-2xs"
              >
                <div className="w-full aspect-[16/10] bg-slate-200" />
                <div className="p-2.5 sm:p-4 space-y-2.5 sm:space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="h-4 sm:h-5 bg-slate-200 rounded-md w-3/4" />
                    <div className="h-3 sm:h-3.5 bg-slate-100 rounded-md w-1/2" />
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-slate-100 flex items-center gap-1.5 sm:gap-2">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-slate-200 rounded-md shrink-0" />
                    <div className="h-2.5 sm:h-3 bg-slate-200 rounded-md w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. ESTADO LISTA VAZIA (Sem células cadastradas na congregação) */}
        {!isLoading && !hasError && allCelulas.length === 0 && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center my-6 space-y-4 shadow-2xs">
            <div className="w-16 h-16 bg-sky-50 text-sky-700 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Building size={32} />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-[#04213d]">Nenhuma célula cadastrada</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                A congregação <strong className="text-slate-800">{displayChurchName}</strong> ainda não possui células
                registradas na estrutura organizacional.
              </p>
            </div>
          </div>
        )}

        {/* 4. ESTADO NENHUM RESULTADO PARA O FILTRO */}
        {!isLoading && !hasError && allCelulas.length > 0 && filteredCelulas.length === 0 && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center my-6 space-y-4 shadow-2xs">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Search size={30} />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-[#04213d]">Nenhum resultado encontrado</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Não encontramos nenhuma célula correspondente a{' '}
                {searchTerm && <span className="font-semibold text-slate-800">&ldquo;{searchTerm}&rdquo;</span>}
                {selectedDia !== 'todos' && (
                  <span>
                    {' '}no dia <span className="font-semibold text-slate-800">{selectedDia}</span>
                  </span>
                )}
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedDia('todos');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <RotateCcw size={13} />
              <span>Limpar Filtros</span>
            </button>
          </div>
        )}

        {/* 5. GALERIA DE CARDS (Clique abre o modal de detalhes) */}
        {!isLoading && !hasError && filteredCelulas.length > 0 && (
          <div className="space-y-6 pb-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
              {filteredCelulas.map((c) => (
                <CelulaCard
                  key={c.id || c.unidadeId}
                  celula={c}
                  onSelect={(item) => handleOpenDetails(item)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE DETALHES & EDIÇÃO DA CÉLULA */}
      {/* ========================================================================= */}
      {isModalOpen && selectedCell && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cell-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 border border-slate-100 my-auto flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 bg-[#04213d] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-300">
                  {isEditable ? <Edit3 size={16} /> : <Eye size={16} />}
                </div>
                <div>
                  <h3 id="cell-modal-title" className="font-bold text-sm sm:text-base leading-tight">
                    {selectedCell.nome}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isEditable ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <ShieldCheck size={11} />
                        Liderança com permissão de edição
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-200 bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-500/30">
                        <Eye size={11} />
                        Modo de Visualização
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSaveCell} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>Informações da célula atualizadas com sucesso!</span>
                </div>
              )}

              {saveError && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Informação para usuários sem permissão de edição */}
              {!isEditable && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-xs flex items-start gap-2">
                  <Info size={16} className="text-sky-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Detalhes da Célula:</span> As informações abaixo são informativas. A edição de dados é exclusiva para os líderes vinculados ou supervisores deste grupo.
                  </div>
                </div>
              )}

              {/* Foto da Célula */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Foto da Célula:</label>
                <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  {editFotoUrl ? (
                    <Image
                      src={editFotoUrl}
                      alt={`Foto da célula ${editName}`}
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 gap-1.5">
                      <Building size={32} />
                      <span className="text-xs">Sem foto cadastrada</span>
                    </div>
                  )}

                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isOptimizingPhoto}
                      className="absolute bottom-2 right-2 px-2.5 py-1.5 bg-black/75 hover:bg-black/90 text-white text-xs font-semibold rounded-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer shadow-md transition"
                    >
                      {isOptimizingPhoto ? (
                        <Loader2 size={13} className="animate-spin text-sky-400" />
                      ) : (
                        <Camera size={13} />
                      )}
                      <span>Alterar Foto</span>
                    </button>
                  )}
                </div>

                {isEditable && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelected}
                    />

                    {photoStats && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                        <Sparkles size={12} className="text-emerald-600" />
                        <span>Foto otimizada e enviada: {photoStats.size} ({photoStats.reduction})</span>
                      </div>
                    )}

                    {photoError && (
                      <div className="p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold">
                        {photoError}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Nome da Célula */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Célula:</label>
                {isEditable ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: Célula Betel"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 font-semibold"
                    required
                  />
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-[#04213d]">
                    {selectedCell.nome}
                  </div>
                )}
              </div>

              {/* Líderes Vinculados */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Líderes do Grupo:</label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCell.leaderNames && selectedCell.leaderNames.length > 0 ? (
                    selectedCell.leaderNames.map((name, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 text-sky-950 border border-sky-200 text-xs font-bold rounded-lg"
                      >
                        <Users size={12} className="text-sky-700" />
                        <span>{name}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">Liderança a designar</span>
                  )}
                </div>
              </div>

              {/* Grid: Dia & Horário (Lado a lado em 2 colunas) */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 truncate">
                    <Calendar size={13} className="text-sky-600 shrink-0" />
                    <span>Dia da Reunião:</span>
                  </label>
                  {isEditable ? (
                    <select
                      value={editMeetingDay}
                      onChange={(e) => setEditMeetingDay(e.target.value)}
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 bg-white font-medium cursor-pointer truncate"
                    >
                      {DIAS_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                      <Calendar size={14} className="text-sky-600 shrink-0" />
                      <span className="truncate">{selectedCell.diaSemana || 'Dia a definir'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 truncate">
                    <Clock size={13} className="text-sky-600 shrink-0" />
                    <span>Horário da Reunião:</span>
                  </label>
                  {isEditable ? (
                    <div className="space-y-1.5">
                      <input
                        type="time"
                        value={editMeetingTime}
                        onChange={(e) => setEditMeetingTime(e.target.value)}
                        className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 bg-white font-medium"
                        required
                      />
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                        {PRESET_HORARIOS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setEditMeetingTime(preset)}
                            className={`text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-md transition cursor-pointer shrink-0 ${
                              editMeetingTime === preset
                                ? 'bg-[#052447] text-white font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                      <Clock size={14} className="text-sky-600 shrink-0" />
                      <span className="truncate">{selectedCell.horario || 'Horário a definir'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Grid: Bairro & Endereço */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <MapPin size={13} className="text-rose-500" />
                    <span>Bairro:</span>
                  </label>
                  {isEditable ? (
                    <input
                      type="text"
                      value={editNeighborhood}
                      onChange={(e) => setEditNeighborhood(e.target.value)}
                      placeholder="Ex: Centro, Junco, Cohab"
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                    />
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-1">
                      <MapPin size={13} className="text-rose-500 shrink-0" />
                      <span className="truncate">{selectedCell.bairro || 'Bairro Central'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço Completo:
                  </label>
                  {isEditable ? (
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Ex: Rua Sumaré, 245"
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                    />
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 truncate">
                      {selectedCell.endereco || 'Endereço não informado'}
                    </div>
                  )}
                </div>
              </div>

              {/* Quantidade de Membros */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center">
                    <Users size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Total de Membros</span>
                    <span className="text-[11px] text-slate-500">Membros vinculados a esta célula</span>
                  </div>
                </div>
                <span className="text-sm font-extrabold text-[#04213d] bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {selectedCell.memberCount || 0}
                </span>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  {isEditable ? 'Cancelar' : 'Fechar'}
                </button>

                {isEditable && (
                  <button
                    type="submit"
                    disabled={isSaving || isOptimizingPhoto}
                    className="px-5 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Salvar Alterações</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
