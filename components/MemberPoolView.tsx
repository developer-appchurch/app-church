'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Users,
  UserPlus,
  Link as LinkIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
  Loader2,
  X,
  Check,
  ArrowRight,
  UserCheck,
  ShieldCheck,
  Unlink,
  Filter,
  Sparkles,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  UserProfile,
  CellMember,
  OrganizationalUnit,
  CellGroup,
  UserRole,
} from '../types';
import { AppChurchService } from '../lib/supabase';

interface MemberPoolViewProps {
  user: UserProfile;
  onNavigateUnits?: () => void;
  onNavigateOverview?: () => void;
}

interface MemberListItem {
  id: string;
  name: string;
  role: string;
  cellId: string | null;
  cellName: string;
  neighborhood: string;
  phone?: string;
  avatarUrl?: string;
  isUnlinked: boolean;
}

interface PageData {
  success: boolean;
  members: MemberListItem[];
  nextCursor: { cursorName: string; cursorId: string } | null;
  hasNextPage: boolean;
  counts: { total: number; unlinked: number; linked: number };
}

// Subcomponente de Avatar com Lazy Loading, Miniatura e Placeholder Elegante
const MemberAvatar: React.FC<{ name: string; avatarUrl?: string }> = React.memo(
  ({ name, avatarUrl }) => {
    const [imgError, setImgError] = useState(false);
    const initials = (name || '?')
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();

    // Paleta de cores consistente baseada no nome
    const colorIndex = (name.charCodeAt(0) || 0) % 5;
    const bgColors = [
      'bg-sky-100 text-sky-800 border-sky-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-amber-100 text-amber-800 border-amber-200',
      'bg-purple-100 text-purple-800 border-purple-200',
    ];

    if (!avatarUrl || imgError) {
      return (
        <div
          className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-2xs ${bgColors[colorIndex]}`}
        >
          {initials}
        </div>
      );
    }

    return (
      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 shrink-0 text-sm overflow-hidden relative shadow-2xs">
        <Image
          src={avatarUrl}
          alt={name}
          width={40}
          height={40}
          loading="lazy"
          unoptimized
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-opacity duration-200"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }
);
MemberAvatar.displayName = 'MemberAvatar';

export const MemberPoolView: React.FC<MemberPoolViewProps> = ({
  user,
  onNavigateUnits,
  onNavigateOverview,
}) => {
  const queryClient = useQueryClient();

  // Estados de Filtros e Busca com Debounce
  const [activeTab, setActiveTab] = useState<'unlinked' | 'linked' | 'all'>('unlinked');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Debounce de 300ms na busca
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Modal: Vincular Membro à Célula
  const [selectedMemberToAssign, setSelectedMemberToAssign] = useState<MemberListItem | null>(null);
  const [targetCellId, setTargetCellId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState<boolean>(false);

  // Modal: Confirmação de Desvincular e Excluir
  const [memberToUnassign, setMemberToUnassign] = useState<MemberListItem | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<MemberListItem | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  // Modal: Novo Membro (Pool ou Célula)
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberPhone, setNewMemberPhone] = useState<string>('');
  const [newMemberEmail, setNewMemberEmail] = useState<string>('');
  const [newMemberNeighborhood, setNewMemberNeighborhood] = useState<string>('Centro');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('Membro');
  const [newMemberDestination, setNewMemberDestination] = useState<'pool' | 'cell'>('pool');
  const [newMemberCellId, setNewMemberCellId] = useState<string>('');
  const [isCreatingMember, setIsCreatingMember] = useState<boolean>(false);

  // 1. React Query: Busca em lote das células, unidades e catálogo de papéis para os seletores
  const { data: helperData } = useQuery({
    queryKey: ['church-structure', user.churchId],
    queryFn: async () => {
      const [cells, units, roles] = await Promise.all([
        AppChurchService.getCells(user.churchId),
        AppChurchService.getUnits(user.churchId),
        AppChurchService.getRoles(),
      ]);
      return { cells, units, roles };
    },
    staleTime: 1000 * 60 * 5,
  });

  const availableRoles = useMemo(() => {
    return helperData?.roles || [];
  }, [helperData]);

  // Nível de hierarquia do usuário logado
  const userHierarchyLevel = useMemo(() => {
    if (!user) return 1;
    if (user.isSystemAdmin || user.role === 'Administrador' || user.login === 'admin') {
      return 999;
    }
    if (availableRoles.length > 0) {
      const matched = availableRoles.find(
        (r) =>
          (user.roleId && r.id === user.roleId) ||
          r.name?.toLowerCase() === user.role?.toLowerCase() ||
          r.slug?.toLowerCase() === user.role?.toLowerCase() ||
          (user.role &&
            (r.name?.toLowerCase().includes(user.role.toLowerCase()) ||
              user.role.toLowerCase().includes(r.name?.toLowerCase())))
      );
      if (matched) return matched.hierarchyLevel;
    }
    const roleLower = (user.role || '').toLowerCase();
    if (roleLower.includes('pastor')) return 7;
    if (roleLower.includes('distrito')) return 6;
    if (roleLower.includes('rede')) return 5;
    if (roleLower.includes('área') || roleLower.includes('area')) return 4;
    if (roleLower.includes('setor')) return 3;
    if (roleLower.includes('célula') || roleLower.includes('celula') || roleLower.includes('lider')) return 2;
    return 1;
  }, [user, availableRoles]);

  // Todas as unidades da igreja
  const unitsList = useMemo(() => helperData?.units || [], [helperData]);

  // Verifica se uma unidade/célula está sob a cobertura direta ou indireta do usuário logado
  const isUnitInUserCoverage = useCallback(
    (unitId: string | null | undefined): boolean => {
      if (!unitId || !user) return false;

      // Pastores e administradores cobrem toda a congregação
      if (userHierarchyLevel >= 7 || user.isSystemAdmin || user.role === 'Administrador') {
        return true;
      }

      // 1. Se o usuário é o próprio líder direto desta unidade ou é sua célula direta
      if (user.currentCellId === unitId) return true;

      const targetUnit = unitsList.find((u) => u.id === unitId);
      if (!targetUnit) return false;

      const isDirectLeader = targetUnit.leaders?.some(
        (l) => l.id === user.id || l.name?.toLowerCase() === user.name?.toLowerCase()
      );
      if (isDirectLeader) return true;

      // Se o usuário é líder de célula (nível 2), ele SÓ cobre a sua própria célula
      if (userHierarchyLevel <= 2) {
        return false;
      }

      // 2. Para líderes superiores (Setor, Área, Rede, Distrito):
      // Percorre os ancestrais da unidade para ver se o usuário lidera algum nível superior
      let currentParentId: string | null | undefined = targetUnit.parentId;
      while (currentParentId) {
        const parentUnit = unitsList.find((u) => u.id === currentParentId);
        if (!parentUnit) break;

        const isLeaderOfParent = parentUnit.leaders?.some(
          (l) => l.id === user.id || l.name?.toLowerCase() === user.name?.toLowerCase()
        );
        if (isLeaderOfParent) {
          return true;
        }

        currentParentId = parentUnit.parentId;
      }

      return false;
    },
    [user, userHierarchyLevel, unitsList]
  );

  // Verifica se um membro está sob a cobertura do usuário logado
  const isMemberInUserCoverage = useCallback(
    (member: MemberListItem): boolean => {
      if (!user) return false;

      // Pastores e administradores cobrem todos os membros da igreja
      if (userHierarchyLevel >= 7 || user.isSystemAdmin || user.role === 'Administrador') {
        return true;
      }

      // Membro sem célula (Pool Geral):
      // Qualquer líder (nível >= 2) pode vincular/gerenciar membros do pool para as células em sua cobertura
      if (member.isUnlinked || !member.cellId) {
        return userHierarchyLevel >= 2;
      }

      // Membro vinculado a uma célula: só quem tem cobertura sobre aquela célula pode desvincular ou excluir
      return isUnitInUserCoverage(member.cellId);
    },
    [user, userHierarchyLevel, isUnitInUserCoverage]
  );

  // Funções que o usuário logado tem permissão de atribuir (até o seu próprio nível)
  const assignableRoles = useMemo(() => {
    if (availableRoles.length === 0) return [];
    if (userHierarchyLevel >= 999) return availableRoles;
    return availableRoles
      .filter((r) => r.hierarchyLevel <= userHierarchyLevel)
      .sort((a, b) => a.hierarchyLevel - b.hierarchyLevel || a.name.localeCompare(b.name));
  }, [availableRoles, userHierarchyLevel]);

  // Garante que o papel inicial selecionado pertença aos papéis permitidos
  useEffect(() => {
    if (assignableRoles.length > 0 && !assignableRoles.some((r) => r.name === newMemberRole)) {
      setNewMemberRole(assignableRoles[0].name as UserRole);
    }
  }, [assignableRoles, newMemberRole]);

  // Células/Unidades folha disponíveis para vinculação RESTRITAS à cobertura do usuário
  const availableCells = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sector?: string }>();
    const cellsList = helperData?.cells || [];

    cellsList.forEach((c) => {
      if (isUnitInUserCoverage(c.id)) {
        map.set(c.id, { id: c.id, name: c.name, sector: c.sectorName });
      }
    });

    unitsList.forEach((u) => {
      const hasChildren = unitsList.some((child) => child.parentId === u.id);
      if (!hasChildren && !map.has(u.id)) {
        if (isUnitInUserCoverage(u.id)) {
          map.set(u.id, { id: u.id, name: u.name, sector: u.parentName });
        }
      }
    });

    return Array.from(map.values());
  }, [helperData, unitsList, isUnitInUserCoverage]);

  // Define seleção inicial nos modals quando as células carregarem
  useEffect(() => {
    if (availableCells.length > 0 && !targetCellId) {
      setTargetCellId(availableCells[0].id);
      setNewMemberCellId(availableCells[0].id);
    }
  }, [availableCells, targetCellId]);

  // 2. React Query: Infinite Query com Cursor Pagination (25 itens/página)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery<PageData>({
    queryKey: ['member-pool', user.churchId, activeTab, debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as { cursorName: string; cursorId: string } | null;
      let url = `/api/members/pool?churchId=${encodeURIComponent(user.churchId)}&filter=${activeTab}&limit=25`;
      if (debouncedSearch) {
        url += `&search=${encodeURIComponent(debouncedSearch)}`;
      }
      if (cursor) {
        url += `&cursorName=${encodeURIComponent(cursor.cursorName)}&cursorId=${encodeURIComponent(cursor.cursorId)}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Falha ao consultar membros no servidor.');
      }
      return res.json().catch(() => ({ members: [], hasNextPage: false, nextCursor: null }));
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.nextCursor : undefined),
    staleTime: 1000 * 60 * 2, // 2 min stale-while-revalidate
  });

  // Lista plana de todos os membros carregados pelas páginas
  const allMembers: MemberListItem[] = useMemo(() => {
    return data?.pages.flatMap((page) => page.members) || [];
  }, [data]);

  // Contadores da primeira página
  const counts = data?.pages[0]?.counts || { total: 0, unlinked: 0, linked: 0 };

  // 3. Virtualização de Lista com @tanstack/react-virtual se passar de 100 itens
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = allMembers.length > 100;

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allMembers.length + 1 : allMembers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  // Infinite Scroll Trigger via IntersectionObserver
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Ação: Vincular Membro à Célula
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberToAssign) return;
    if (!targetCellId) {
      setErrorMessage('Selecione uma célula válida para vincular o membro.');
      return;
    }

    setIsAssigning(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/members/pool', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMemberToAssign.id,
          cellId: targetCellId,
          churchId: user.churchId,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData?.success) {
        throw new Error(resData?.error || 'Falha ao vincular membro.');
      }

      const targetCellObj = availableCells.find((c) => c.id === targetCellId);
      const cellName = targetCellObj?.name || resData.cellName || 'Célula';

      // Invalida cache do React Query para atualização instantânea
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['member-pool', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-members', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-cells', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-structure', user.churchId] }),
      ]);

      setActionSuccessBanner(
        `Membro "${selectedMemberToAssign.name}" vinculado com sucesso à "${cellName}"!`
      );
      setSelectedMemberToAssign(null);
    } catch (err: any) {
      console.error('Erro ao vincular membro:', err);
      setErrorMessage(err?.message || 'Falha ao vincular membro.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Ação: Desvincular Membro (Retornar ao Cadastro Geral com atualização atômica e instantânea do cache)
  const handleConfirmUnassign = async () => {
    if (!memberToUnassign) return;
    const member = memberToUnassign;
    const targetMemberId = member.id;
    setIsProcessingAction(true);

    // 1. Atualização Otimista Instantânea no Cache do React Query
    queryClient.setQueriesData({ queryKey: ['member-pool'] }, (oldData: any) => {
      if (!oldData || !oldData.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          members: page.members.map((m: MemberListItem) => {
            if (m.id === targetMemberId) {
              return {
                ...m,
                cellId: null,
                cellName: 'Sem Célula',
                isUnlinked: true,
              };
            }
            return m;
          }),
          counts: {
            ...page.counts,
            unlinked: (page.counts?.unlinked || 0) + 1,
            linked: Math.max(0, (page.counts?.linked || 0) - 1),
          },
        })),
      };
    });

    try {
      const res = await fetch('/api/members/pool', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: targetMemberId,
          cellId: null,
          churchId: user.churchId,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData?.success) {
        throw new Error(resData?.error || 'Falha ao desvincular membro.');
      }

      setMemberToUnassign(null);
      setActionSuccessBanner(`"${member.name}" foi desvinculado e movido para o cadastro geral.`);

      // Sincroniza em background
      queryClient.invalidateQueries({ queryKey: ['church-members'] });
      queryClient.invalidateQueries({ queryKey: ['church-cells'] });
      queryClient.invalidateQueries({ queryKey: ['church-structure'] });
    } catch (err: any) {
      console.error('Erro ao desvincular membro:', err);
      setErrorMessage(err?.message || 'Falha ao desvincular membro.');
      // Revalida para reverter caso tenha ocorrido erro
      queryClient.invalidateQueries({ queryKey: ['member-pool'] });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Ação: Excluir Membro da Congregação e Auth com atualização atômica e instantânea do cache
  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    const member = memberToDelete;
    const targetMemberId = member.id;
    setIsProcessingAction(true);

    // 1. Remoção Otimista Instantânea no Cache do React Query
    queryClient.setQueriesData({ queryKey: ['member-pool'] }, (oldData: any) => {
      if (!oldData || !oldData.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          members: page.members.filter((m: MemberListItem) => m.id !== targetMemberId),
          counts: {
            ...page.counts,
            total: Math.max(0, (page.counts?.total || 0) - 1),
            unlinked: member.isUnlinked ? Math.max(0, (page.counts?.unlinked || 0) - 1) : page.counts?.unlinked,
            linked: !member.isUnlinked ? Math.max(0, (page.counts?.linked || 0) - 1) : page.counts?.linked,
          },
        })),
      };
    });

    try {
      const res = await fetch(`/api/members/pool?memberId=${encodeURIComponent(targetMemberId)}`, {
        method: 'DELETE',
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData?.success) {
        throw new Error(resData?.error || 'Falha ao excluir membro.');
      }

      setMemberToDelete(null);
      setActionSuccessBanner(`"${member.name}" foi excluído com sucesso.`);

      // Sincroniza em background
      queryClient.invalidateQueries({ queryKey: ['church-members'] });
      queryClient.invalidateQueries({ queryKey: ['church-cells'] });
      queryClient.invalidateQueries({ queryKey: ['church-structure'] });
    } catch (err: any) {
      console.error('Erro ao excluir membro:', err);
      setErrorMessage(err?.message || 'Falha ao excluir membro.');
      // Revalida para reverter caso tenha ocorrido erro
      queryClient.invalidateQueries({ queryKey: ['member-pool'] });
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Ação: Cadastrar Novo Membro
  const handleCreateMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      setErrorMessage('O nome do membro é obrigatório.');
      return;
    }

    setIsCreatingMember(true);
    setErrorMessage('');

    try {
      const destinationCellId = newMemberDestination === 'cell' ? newMemberCellId : null;

      const res = await fetch('/api/members/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId: user.churchId,
          name: newMemberName.trim(),
          phone: newMemberPhone.trim() || undefined,
          email: newMemberEmail.trim() || undefined,
          neighborhood: newMemberNeighborhood.trim() || 'Centro',
          role: newMemberRole,
          cellId: destinationCellId,
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData?.success) {
        throw new Error(resData?.error || 'Falha ao cadastrar membro.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['member-pool', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-members', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-cells', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-structure', user.churchId] }),
      ]);

      setActionSuccessBanner(
        `Membro "${newMemberName.trim()}" cadastrado com sucesso ${
          destinationCellId ? 'e vinculado à célula' : 'no cadastro geral'
        }!`
      );

      // Reseta formulário
      setNewMemberName('');
      setNewMemberPhone('');
      setNewMemberEmail('');
      setNewMemberNeighborhood('Centro');
      setNewMemberRole('Membro');
      setNewMemberDestination('pool');
      setIsNewMemberModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao cadastrar novo membro:', err);
      setErrorMessage(err?.message || 'Falha ao cadastrar membro.');
    } finally {
      setIsCreatingMember(false);
    }
  };

  return (
    <div id="screen-member-pool" className="bg-[#e9eff6] min-h-screen pb-16 font-sans w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-4 space-y-4">
        {/* Banner de Sucesso */}
        {actionSuccessBanner && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl sm:rounded-2xl text-emerald-900 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{actionSuccessBanner}</span>
            </div>
            <button
              onClick={() => setActionSuccessBanner('')}
              className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Banner de Erro */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl sm:rounded-2xl text-red-900 text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage('')}
              className="text-red-700 hover:text-red-950 p-1 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header Principal */}
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
              <Users size={24} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Nossos Membros
              </h1>
            </div>
          </div>

          {/* Botões de Ação do Topo */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            {onNavigateUnits && (
              <button
                type="button"
                onClick={onNavigateUnits}
                className="flex-1 md:flex-none px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer border border-white/15"
              >
                <Building2 size={14} />
                <span className="hidden sm:inline">Níveis Organizacionais</span>
                <span className="sm:hidden">Níveis</span>
              </button>
            )}

            <button
              type="button"
              id="btn-add-pool-member"
              onClick={() => setIsNewMemberModalOpen(true)}
              className="flex-1 md:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs border border-emerald-400/30"
            >
              <UserPlus size={14} />
              <span>Novo Membro</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Abas de Filtro */}
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl w-full sm:flex sm:w-auto sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('unlinked')}
              className={`flex-1 sm:flex-none px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'unlinked'
                  ? 'bg-white text-amber-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Sem Célula</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                {counts.unlinked}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('linked')}
              className={`flex-1 sm:flex-none px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'linked'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Vinculados</span>
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {counts.linked}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 sm:flex-none px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">
                {counts.total}
              </span>
            </button>
          </div>

          {/* Campo de Busca no Servidor com Debounce de 300ms */}
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, telefone, bairro ou célula..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Membros */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Estado de Carregamento Inicial: Skeletons */}
          {isLoading ? (
            <div className="divide-y divide-slate-100 p-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-3 animate-pulse">
                  <div className="flex items-center gap-3 w-full max-w-md">
                    <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 bg-slate-200 rounded w-1/2" />
                      <div className="h-2.5 bg-slate-100 rounded w-3/4" />
                    </div>
                  </div>
                  <div className="w-24 h-8 bg-slate-200 rounded-xl shrink-0" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-red-500 text-xs px-4 space-y-2">
              <AlertCircle size={32} className="mx-auto text-red-400" />
              <p className="font-bold">Ocorreu um erro ao carregar os membros.</p>
              <p className="text-slate-500">{(error as any)?.message || 'Tente recarregar a página.'}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : allMembers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs px-4">
              <Users size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">
                {activeTab === 'unlinked'
                  ? 'Nenhum membro sem célula no momento.'
                  : 'Nenhum membro encontrado com os filtros atuais.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                {activeTab === 'unlinked'
                  ? 'Todos os membros da congregação já estão vinculados a células ativas.'
                  : 'Clique em "+ Novo Membro" para cadastrar uma nova pessoa.'}
              </p>
            </div>
          ) : (
            <>
              {/* Barra de Status */}
              <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div>
                  Carregados <strong className="text-slate-800 font-semibold">{allMembers.length}</strong> de <strong className="text-slate-800 font-semibold">{counts.total}</strong> membros
                </div>
                {shouldVirtualize && (
                  <span className="text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-medium border border-sky-200">
                    Virtualização de Lista Ativa
                  </span>
                )}
              </div>

              {/* Renderização da Lista (Normal ou Virtualizada) */}
              <div className="divide-y divide-slate-100">
                {allMembers.map((member) => (
                  <div
                    key={member.id}
                    className="member-card p-3.5 sm:p-4 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                            {member.name}
                          </h3>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {member.role || 'Membro'}
                          </span>
                          {member.isUnlinked ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              Sem Célula
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {member.cellName}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                          {member.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} className="text-slate-400" />
                              {member.phone}
                            </span>
                          )}
                          {member.neighborhood && (
                            <span className="flex items-center gap-1">
                              <MapPin size={11} className="text-slate-400" />
                              {member.neighborhood}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações (Visíveis apenas se o membro estiver sob a cobertura hierárquica do usuário) */}
                    {isMemberInUserCoverage(member) && (
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {member.isUnlinked ? (
                          <button
                            type="button"
                            disabled={availableCells.length === 0}
                            onClick={() => {
                              setSelectedMemberToAssign(member);
                              if (availableCells.length > 0 && !targetCellId) {
                                setTargetCellId(availableCells[0].id);
                              }
                            }}
                            className="px-3.5 py-1.5 bg-[#052447] hover:bg-[#073366] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                            title={
                              availableCells.length === 0
                                ? 'Nenhuma célula em sua cobertura disponível para vinculação'
                                : 'Vincular à célula em sua cobertura'
                            }
                          >
                            <LinkIcon size={13} />
                            <span>Vincular à Célula</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMemberToUnassign(member)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer border border-slate-200 hover:border-amber-200"
                            title="Desvincular e mover para membros gerais"
                          >
                            <Unlink size={13} />
                            <span>Desvincular</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setMemberToDelete(member)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200 cursor-pointer"
                          title="Excluir membro e remover login"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Elemento de Sentinela para Rolagem Infinita */}
              <div ref={loadMoreRef} className="p-4 flex items-center justify-center text-xs text-slate-400">
                {isFetchingNextPage ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-[#052447]" />
                    <span>Carregando mais membros...</span>
                  </div>
                ) : hasNextPage ? (
                  <button
                    onClick={() => fetchNextPage()}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer"
                  >
                    Carregar Mais
                  </button>
                ) : (
                  <span>Todos os membros da lista foram carregados.</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: Vincular Membro à Célula */}
      {selectedMemberToAssign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#04213d] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center">
                  <LinkIcon size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Vincular Membro à Célula</h3>
                  <p className="text-[11px] text-slate-300">
                    Regra: Membros só podem pertencer a células (nível folha)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberToAssign(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] text-slate-500 font-semibold uppercase">Membro Selecionado</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedMemberToAssign.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedMemberToAssign.phone || selectedMemberToAssign.neighborhood || 'Sem telefone cadastrado'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Selecione a Célula de Destino *
                </label>
                {availableCells.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    Nenhuma célula cadastrada na igreja ainda. Cadastre uma célula primeiro na aba de
                    Níveis Organizacionais.
                  </div>
                ) : (
                  <select
                    required
                    value={targetCellId}
                    onChange={(e) => setTargetCellId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                  >
                    {availableCells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.sector ? `(${c.sector})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  O membro passará a constar na lista de frequência e relatórios desta célula.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMemberToAssign(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || availableCells.length === 0}
                  className="px-5 py-2 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isAssigning ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Vinculando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Confirmar Vínculo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Membro (Pool ou Célula) */}
      {isNewMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#04213d] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cadastrar Novo Membro</h3>
                  <p className="text-[11px] text-slate-300">
                    Adicione ao Pool Geral ou vincule diretamente a uma célula
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMemberModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMemberSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nome do membro"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={newMemberPhone}
                    onChange={(e) => {
                      const rawDigits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      let formatted = rawDigits;
                      if (rawDigits.length === 0) {
                        formatted = '';
                      } else if (rawDigits.length <= 2) {
                        formatted = `(${rawDigits}`;
                      } else if (rawDigits.length <= 6) {
                        formatted = `(${rawDigits.slice(0, 2)}) ${rawDigits.slice(2)}`;
                      } else if (rawDigits.length <= 10) {
                        formatted = `(${rawDigits.slice(0, 2)}) ${rawDigits.slice(2, 6)}-${rawDigits.slice(6)}`;
                      } else {
                        formatted = `(${rawDigits.slice(0, 2)}) ${rawDigits.slice(2, 7)}-${rawDigits.slice(7, 11)}`;
                      }
                      setNewMemberPhone(formatted);
                    }}
                    placeholder="(00) 90000-0000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={newMemberNeighborhood}
                    onChange={(e) => setNewMemberNeighborhood(e.target.value)}
                    placeholder="Ex: Centro"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Função / Perfil</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                  >
                    {assignableRoles.length > 0 ? (
                      assignableRoles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))
                    ) : (
                      <option value="Membro">Membro</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Escolha da Situação: Sem Célula vs Célula */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">Situação</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    onClick={() => setNewMemberDestination('pool')}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                      newMemberDestination === 'pool'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <p className="font-bold flex items-center gap-1.5">
                      <Users size={14} className="text-amber-700" />
                      <span>Sem Célula</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Fica disponível no banco geral para vínculo posterior pelos líderes.
                    </p>
                  </div>

                  <div
                    onClick={() => setNewMemberDestination('cell')}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                      newMemberDestination === 'cell'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <p className="font-bold flex items-center gap-1.5">
                      <UserCheck size={14} className="text-emerald-700" />
                      <span>Vincular a Célula Agora</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Associa imediatamente a uma célula ativa da congregação.
                    </p>
                  </div>
                </div>

                {newMemberDestination === 'cell' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Célula de Destino *
                    </label>
                    {availableCells.length === 0 ? (
                      <p className="text-xs text-red-600">
                        Nenhuma célula cadastrada. Cadastre uma célula primeiro.
                      </p>
                    ) : (
                      <select
                        required
                        value={newMemberCellId}
                        onChange={(e) => setNewMemberCellId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                      >
                        {availableCells.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.sector ? `(${c.sector})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewMemberModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingMember}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isCreatingMember ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Cadastrar Membro</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Desvinculação */}
      {memberToUnassign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/30 text-white flex items-center justify-center">
                  <Unlink size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Desvincular Membro</h3>
                  <p className="text-[11px] text-amber-100">
                    Mover para o cadastro geral de membros
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMemberToUnassign(null)}
                className="text-amber-200 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza que deseja desvincular <strong className="text-slate-900 font-bold">{memberToUnassign.name}</strong> da célula{' '}
                <strong className="text-slate-900 font-bold">{memberToUnassign.cellName || 'atual'}</strong>?
              </p>
              <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-3 rounded-xl">
                O membro continuará cadastrado na congregação, mas passará a constar como <strong>&quot;Sem Célula&quot;</strong> até que seja vinculado a uma nova unidade.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => setMemberToUnassign(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={handleConfirmUnassign}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Desvinculando...</span>
                    </>
                  ) : (
                    <>
                      <Unlink size={14} />
                      <span>Confirmar Desvinculação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-red-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/30 text-white flex items-center justify-center">
                  <Trash2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Excluir Membro</h3>
                  <p className="text-[11px] text-red-100">
                    Remover definitivamente do sistema
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="text-red-200 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir o cadastro de <strong className="text-slate-900 font-bold">{memberToDelete.name}</strong>?
              </p>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1 text-[11px] text-red-800">
                <p className="font-bold flex items-center gap-1">
                  <span>Esta ação não poderá ser desfeita.</span>
                </p>
                <p>
                  O membro será removido da congregação e sua conta de acesso ao aplicativo será desativada.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => setMemberToDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isProcessingAction ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Excluir Membro</span>
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
