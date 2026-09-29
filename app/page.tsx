'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ActiveScreen,
  AttendanceStatus,
  CellGroup,
  CellMember,
  FeedPost,
  ChurchAnnouncement,
  LeadershipTrackProgress,
  UserProfile,
} from '../types';
import { AppChurchService } from '../lib/supabase';
import { AppChurchLogo } from '../components/AppChurchLogo';
import { LoginScreen } from '../components/LoginScreen';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { PullToRefresh } from '../components/PullToRefresh';
import { Plus, AlertCircle, Layers, X, CheckCircle2, Loader2 } from 'lucide-react';

const ViewLoading = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-8 text-gray-500">
    <Loader2 className="w-8 h-8 text-[#1a365d] animate-spin mb-3" />
    <span className="text-sm font-medium">Carregando visualização...</span>
  </div>
);

// Dynamic imports to code-split heavy views and prevent initial chunk timeout
const MyCellView = dynamic(
  () => import('../components/MyCellView').then((m) => m.MyCellView),
  { loading: ViewLoading, ssr: false }
);

const FeedView = dynamic(
  () => import('../components/FeedView').then((m) => m.FeedView),
  { loading: ViewLoading, ssr: false }
);

const LeadershipOverviewView = dynamic(
  () => import('../components/LeadershipOverviewView').then((m) => m.LeadershipOverviewView),
  { loading: ViewLoading, ssr: false }
);

const WeeklyReportView = dynamic(
  () => import('../components/WeeklyReportView').then((m) => m.WeeklyReportView),
  { loading: ViewLoading, ssr: false }
);

const LeadershipTrackModal = dynamic(
  () => import('../components/LeadershipTrackModal').then((m) => m.LeadershipTrackModal),
  { ssr: false }
);

const RegisterChurchView = dynamic(
  () => import('../components/RegisterChurchView').then((m) => m.RegisterChurchView),
  { loading: ViewLoading, ssr: false }
);

const HierarchicalUnitsView = dynamic(
  () => import('../components/HierarchicalUnitsView').then((m) => m.HierarchicalUnitsView),
  { loading: ViewLoading, ssr: false }
);

const MemberPoolView = dynamic(
  () => import('../components/MemberPoolView').then((m) => m.MemberPoolView),
  { loading: ViewLoading, ssr: false }
);

const ChurchHierarchyOverviewView = dynamic(
  () => import('../components/ChurchHierarchyOverviewView').then((m) => m.ChurchHierarchyOverviewView),
  { loading: ViewLoading, ssr: false }
);

const NossasCelulasView = dynamic(
  () => import('../components/NossasCelulasView').then((m) => m.NossasCelulasView),
  { loading: ViewLoading, ssr: false }
);

const MultiplyCellView = dynamic(
  () => import('../components/MultiplyCellView').then((m) => m.MultiplyCellView),
  { loading: ViewLoading, ssr: false }
);

const NotificationPermissionBanner = dynamic(
  () => import('../components/NotificationPermissionBanner').then((m) => m.NotificationPermissionBanner),
  { ssr: false }
);

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estado de verificação de sessão (Splash/Skeleton inicial para não piscar tela de login)
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Tela inicial após login direcionada para Feed de Notícias
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('feed');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Logged in user profile (contains churchId, churchName, role, sector, etc.)
  const [user, setUser] = useState<UserProfile | null>(null);

  // Church-isolated collections
  const [cells, setCells] = useState<CellGroup[]>([]);
  const [selectedCellId, setSelectedCellId] = useState<string>('');
  const [members, setMembers] = useState<CellMember[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [announcements, setAnnouncements] = useState<ChurchAnnouncement[]>([]);

  // Modal State for Member Leadership Track
  const [selectedMemberForTrack, setSelectedMemberForTrack] = useState<CellMember | null>(null);

  // Sync state & connection feedback
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    isCloud: boolean;
    message: string;
  }>({
    connected: true,
    isCloud: false,
    message: 'Supabase Database Ativo',
  });

  // Contexto da igreja selecionada para estruturação hierárquica
  const [targetChurchContext, setTargetChurchContext] = useState<{ id: string; name: string } | null>(null);
  const [hierarchyLevelIndex, setHierarchyLevelIndex] = useState<number>(0);
  const [refreshErrorBanner, setRefreshErrorBanner] = useState<string>('');
  const [refreshSuccessToast, setRefreshSuccessToast] = useState<string>('');

  // Deep link states para relatórios pendentes via push notification
  const [autoOpenReportModal, setAutoOpenReportModal] = useState<boolean>(false);
  const [targetReportWeek, setTargetReportWeek] = useState<string | undefined>(undefined);

  // Tratamento de deep link via notificação Push (?screen=reports&cellId=...&openModal=true)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const screenParam = params.get('screen');
      const cellIdParam = params.get('cellId');
      const openModalParam = params.get('openModal');
      const targetWeekParam = params.get('targetWeek');

      if (screenParam === 'reports' || screenParam === 'weekly_report') {
        queueMicrotask(() => {
          setActiveScreen('reports');
          if (cellIdParam) {
            setSelectedCellId(cellIdParam);
          }
          if (openModalParam === 'true') {
            setAutoOpenReportModal(true);
          }
          if (targetWeekParam) {
            setTargetReportWeek(targetWeekParam);
          }
        });
      } else if (screenParam === 'our_cells' || screenParam === 'celulas' || screenParam === 'nossas_celulas') {
        queueMicrotask(() => {
          setActiveScreen('our_cells');
        });
      }
    } catch (e) {
      console.warn('[Home] Erro ao ler query params para deep link:', e);
    }
  }, []);

  // 1. React Query: Consulta de Células com keepPreviousData e enabled condicionado a churchId
  const {
    data: queriedCells,
    refetch: refetchCells,
  } = useQuery({
    queryKey: ['church-cells', user?.churchId],
    queryFn: async () => {
      if (!user?.churchId) return [];
      return AppChurchService.getCells(user.churchId);
    },
    enabled: Boolean(user?.churchId),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache ativo
  });

  // Combina dados em cache/estado com dados do React Query garantindo que NUNCA zere em falhas
  const effectiveCells = (queriedCells && queriedCells.length > 0) ? queriedCells : cells;
  const effectiveMembers = members;

  // Garante que selectedCellId seja sincronizado com a célula do usuário logado assim que as células estiverem prontas
  useEffect(() => {
    if (effectiveCells.length > 0) {
      if (!selectedCellId || !effectiveCells.some((c) => c.id === selectedCellId)) {
        const preferredCellId =
          user?.currentCellId && effectiveCells.some((c) => c.id === user.currentCellId)
            ? user.currentCellId
            : effectiveCells[0].id;
        queueMicrotask(() => {
          setSelectedCellId(preferredCellId);
        });
      }
    }
  }, [effectiveCells, selectedCellId, user?.currentCellId]);

  // Load church data isolated by churchId
  const loadChurchData = useCallback(
    async (churchId: string, initialCellId?: string, currentUserId?: string) => {
      try {
        const churchCells = await AppChurchService.getCells(churchId);

        if (churchCells && churchCells.length > 0) {
          setCells(churchCells);
          const targetCellId =
            initialCellId && churchCells.some((c) => c.id === initialCellId)
              ? initialCellId
              : churchCells[0]?.id || '';
          setSelectedCellId(targetCellId);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados da igreja:', err);
      }
    },
    []
  );

  // Restauração da sessão no mount via Supabase Auth com leitura instantânea do cache local
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      // 1. Verificação instantânea (0ms) do cache local para eliminar delay percebido
      const cached = AppChurchService.getCachedUser();
      if (cached && isMounted) {
        setUser(cached);
        setIsAuthenticated(true);
        setIsCheckingSession(false);
        setActiveScreen('feed');
      }

      try {
        const sessionUser = await AppChurchService.getCurrentUser();
        if (isMounted) {
          if (sessionUser) {
            setUser(sessionUser);
            setIsAuthenticated(true);
            setActiveScreen('feed');
            // Se a igreja difere do cache inicial, invalida para buscar a nova igreja
            if (cached && cached.churchId !== sessionUser.churchId) {
              queryClient.invalidateQueries({ queryKey: ['church-cells', sessionUser.churchId] });
              queryClient.invalidateQueries({ queryKey: ['church-members', sessionUser.churchId] });
            }
          } else {
            // Se já há um usuário ativo no estado (ex: logou pelo formulário), não anula
            setUser((prev) => {
              if (prev) return prev;
              setIsAuthenticated(false);
              return null;
            });
          }
        }
      } catch (err) {
        console.warn('Erro ao restaurar sessão inicial:', err);
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [queryClient]);

  // Connection check on mount
  useEffect(() => {
    AppChurchService.checkConnection().then((status) => {
      setConnectionStatus(status);
    });
  }, []);

  // Refresh handler (sincroniza com o banco sem apagar os dados da memória, mantendo estado anterior em caso de falha)
  const handleRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    setRefreshErrorBanner('');
    setRefreshSuccessToast('');
    try {
      // 1. Invalida as queries do React Query (mantém os dados na tela graças ao keepPreviousData)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['church-cells', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['cell-members'] }),
        queryClient.invalidateQueries({ queryKey: ['member-pool', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-structure', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['feed_posts'] }),
      ]);

      // 2. Re-executa as células para atualizar seletores
      const freshCells = await AppChurchService.getCells(user.churchId, true);
      if (freshCells && freshCells.length > 0) {
        setCells(freshCells);
      }

      const status = await AppChurchService.checkConnection(true);
      setConnectionStatus(status);

      // Notificação rápida (2s no máximo) em tom de verde claro
      setRefreshSuccessToast('Dados Atualizados');
      setTimeout(() => {
        setRefreshSuccessToast('');
      }, 2000);
    } catch (err: any) {
      console.error('[handleRefresh] Erro ao sincronizar dados com o Supabase:', err);
      setRefreshErrorBanner('Não foi possível conectar ao banco de dados neste momento. Os dados anteriores foram mantidos.');
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 400);
    }
  };

  // Login handler: transição imediata para a tela principal e carregamento assíncrono em segundo plano
  const handleLoginSuccess = (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setIsAuthenticated(true);
    setIsCheckingSession(false);
    setActiveScreen('feed'); // Home is Feed

    // Carrega dados da igreja em segundo plano sem travar a interface
    loadChurchData(
      authenticatedUser.churchId,
      authenticatedUser.currentCellId,
      authenticatedUser.id
    );
  };

  // Logout handler com signOut seguro no Supabase Auth, limpeza total de cache e retorno para a tela de login
  const handleLogout = async () => {
    try {
      await AppChurchService.logout();
    } catch (e) {
      console.warn('Erro durante logout:', e);
    }

    queryClient.clear();
    setIsAuthenticated(false);
    setUser(null);
    setCells([]);
    setMembers([]);
    setPosts([]);
    setAnnouncements([]);
    setSelectedCellId('');
    setActiveScreen('feed');
    setIsSidebarOpen(false);

    router.replace('/login');
  };

  // Cell Members Management: Atualização instantânea da galeria e sincronização automática
  const handleAddMember = async (newMemberData: Omit<CellMember, 'id'>) => {
    const created = await AppChurchService.addMember(newMemberData);

    // 1. Atualização otimista imediata no cache do React Query (0ms delay na galeria)
    if (user?.churchId) {
      queryClient.setQueryData(['church-members', user.churchId], (old: CellMember[] | undefined) => {
        const list = old || [];
        return [created, ...list.filter((m) => m.id !== created.id)];
      });
    }

    // 2. Atualização imediata no estado local de membros
    setMembers((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);

    // 3. Atualização otimista da contagem da célula ativa
    if (created.cellId) {
      setCells((prev) =>
        prev.map((c) =>
          c.id === created.cellId ? { ...c, memberCount: (c.memberCount || 0) + 1 } : c
        )
      );
    }

    // 4. Revalidação em segundo plano sem necessidade de clique manual
    if (user?.churchId) {
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['church-members', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['cell-members'] }),
        queryClient.invalidateQueries({ queryKey: ['church-cells', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['member-pool', user.churchId] }),
        queryClient.invalidateQueries({ queryKey: ['church-structure', user.churchId] }),
      ]).catch((err) => console.warn('Aviso na invalidação de queries pós-cadastro:', err));
    }
  };

  const handleUpdateAttendance = async (
    memberId: string,
    newStatus: AttendanceStatus,
    newPercentage: number
  ) => {
    await AppChurchService.updateMemberAttendance(memberId, newStatus, newPercentage);
    queryClient.invalidateQueries({ queryKey: ['cell-members'] });
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, attendanceStatus: newStatus, attendancePercentage: newPercentage }
          : m
      )
    );
  };

  const handleUpdateCell = async (updatedCell: CellGroup) => {
    // 1. Atualização no estado local
    setCells((prev) =>
      prev.map((c) => (c.id === updatedCell.id ? { ...c, ...updatedCell } : c))
    );

    // 2. Atualização no cache do React Query
    if (user?.churchId) {
      queryClient.setQueryData(['church-cells', user.churchId], (old: CellGroup[] | undefined) => {
        const list = old || [];
        return list.map((c) => (c.id === updatedCell.id ? { ...c, ...updatedCell } : c));
      });
      queryClient.invalidateQueries({ queryKey: ['church-cells', user.churchId] });
      queryClient.invalidateQueries({ queryKey: ['church-structure', user.churchId] });
      queryClient.invalidateQueries({ queryKey: ['celulas-gallery'] });
    }
  };

  const handleSaveLeadershipProgress = async (
    memberId: string,
    progress: LeadershipTrackProgress
  ) => {
    const resolvedChurchId = selectedMemberForTrack?.churchId || user?.churchId;
    const resolvedCellId = selectedMemberForTrack?.cellId || undefined;
    await AppChurchService.saveLeadershipProgress(memberId, progress, resolvedChurchId, resolvedCellId);

    const completedCount = progress.steps.filter((s) => s.completed).length;
    const totalCount = progress.steps.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              trackProgress: {
                currentStepId: progress.currentStepId,
                completedStepsCount: completedCount,
                totalStepsCount: totalCount,
                percentage,
              },
            }
          : m
      )
    );
  };

  // Feed Post Actions
  const handleLikePost = async (postId: string) => {
    if (!user) return;
    const { liked, likesCount } = await AppChurchService.toggleLikePost(postId, user.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likedByCurrentUser: liked, likes: likesCount }
          : p
      )
    );
  };

  const handleAddComment = async (postId: string, commentText: string) => {
    if (!user) return;
    const newComment = await AppChurchService.addComment(postId, commentText, user);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: [...p.comments, newComment],
              commentsCount: (p.commentsCount || p.comments.length) + 1,
            }
          : p
      )
    );
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    await AppChurchService.deleteComment(postId, commentId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: p.comments.filter((c) => c.id !== commentId),
              commentsCount: Math.max(0, (p.commentsCount || p.comments.length) - 1),
            }
          : p
      )
    );
  };

  const handleCreatePost = async (
    newPostData: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ) => {
    const created = await AppChurchService.createFeedPost(newPostData);
    setPosts((prev) => [created, ...prev]);
  };

  const handleDeletePost = async (postId: string) => {
    await AppChurchService.deleteFeedPost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  // Announcement Actions
  const handleCreateAnnouncement = async (
    newAnnouncementData: Omit<
      ChurchAnnouncement,
      'id' | 'createdAt' | 'confirmedAttendeesCount' | 'isConfirmedByCurrentUser'
    >
  ) => {
    const created = await AppChurchService.createAnnouncement(newAnnouncementData);
    setAnnouncements((prev) => [created, ...prev]);
  };

  const handleToggleRSVP = async (announcementId: string) => {
    const updated = await AppChurchService.toggleAnnouncementRSVP(announcementId);
    setAnnouncements(updated.filter((a) => a.churchId === user?.churchId));
  };

  const handleUpdateAvatar = async (newAvatarUrl: string) => {
    if (!user) return;
    try {
      await AppChurchService.updateUserAvatar(user.id, newAvatarUrl);
      setUser((prev) => (prev ? { ...prev, avatarUrl: newAvatarUrl } : null));
      setMembers((prev) =>
        prev.map((m) => (m.id === user.id ? { ...m, avatarUrl: newAvatarUrl } : m))
      );
    } catch (err) {
      console.error('Erro ao atualizar avatar do usuário:', err);
    }
  };

  // Current active cell
  const currentCell: CellGroup =
    effectiveCells.find((c) => c.id === selectedCellId) ||
    effectiveCells[0] || {
      id: 'cell-pending',
      churchId: user?.churchId || 'church-default',
      name: effectiveCells.length === 0 ? 'Nenhuma Célula Cadastrada' : 'Adonai',
      leaderName: user?.name || 'Pastor Titular',
      sectorName: effectiveCells.length === 0 ? 'Pendente' : 'Setor Geral',
      address: effectiveCells.length === 0 ? 'Pendente de cadastro' : 'Rua Sumaré, 245 - Junco',
      meetingDay: 'Quinta-feira',
      meetingTime: '19:30',
      memberCount: 0,
      quantidade_membros: 0,
    };

  // 0. Splash / Skeleton durante a validação da sessão para evitar piscar a tela de login
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#041e3a] flex flex-col items-center justify-center relative overflow-hidden font-sans select-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 -right-24 w-80 h-80 bg-sky-400/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center justify-center z-10">
          <div className="animate-pulse flex flex-col items-center">
            <AppChurchLogo variant="light" className="h-[80px] mb-6" />
            <div className="w-48 h-2.5 bg-blue-900/60 rounded-full overflow-hidden relative">
              <div className="w-1/2 h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
          <p className="text-sky-200/80 text-xs mt-4 font-medium tracking-wide">
            Validando sessão segura...
          </p>
        </div>
      </div>
    );
  }

  // 1. Initial screen MUST be Login without church name, using generic platform logo
  if (!isAuthenticated || !user) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // 2. Authenticated Church Workspace
  return (
    <div className="min-h-screen bg-[#e9eff6] flex flex-col font-sans selection:bg-sky-900 selection:text-white relative">
      {/* Top Header replicating user screenshot */}
      <Header
        user={user}
        cells={effectiveCells}
        selectedCellId={selectedCellId}
        onSelectCell={setSelectedCellId}
        onToggleSidebar={() => setIsSidebarOpen(true)}
        onRefreshData={handleRefresh}
        isRefreshing={isRefreshing}
        onLogout={handleLogout}
      />

      {/* Toast Notificação Rápida de Sucesso ao Atualizar Dados (2s max, tom verde claro) */}
      {refreshSuccessToast && (
        <div className="fixed top-16 right-3 sm:right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300/90 text-emerald-900 px-3.5 py-2 rounded-xl shadow-lg shadow-emerald-950/10 text-xs sm:text-sm font-bold">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{refreshSuccessToast}</span>
          </div>
        </div>
      )}

      {refreshErrorBanner && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-800 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>{refreshErrorBanner}</span>
          </div>
          <button
            onClick={() => setRefreshErrorBanner('')}
            className="text-amber-700 hover:text-amber-900 p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Navigation Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeScreen={activeScreen}
        onNavigate={(screen) => setActiveScreen(screen)}
        user={user}
        currentCell={currentCell}
        onLogout={handleLogout}
        onUpdateAvatar={handleUpdateAvatar}
      />

      {/* Banner de Permissão Amigável para Notificações de Lembrete de Relatório */}
      {user && <NotificationPermissionBanner user={user} />}

      {/* Main Dynamic View com PullToRefresh mobile integrado */}
      <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
        <main className="flex-1">
          {activeScreen === 'feed' && (
            <FeedView
              posts={posts}
              announcements={announcements}
              currentUser={user}
              currentCell={currentCell}
              churchName={user.churchName}
              onLikePost={handleLikePost}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              onDeletePost={handleDeletePost}
              onCreatePost={handleCreatePost}
              onCreateAnnouncement={handleCreateAnnouncement}
              onToggleRSVP={handleToggleRSVP}
            />
          )}

          {activeScreen === 'my_cell' && (
            <MyCellView
              members={effectiveMembers}
              cell={currentCell}
              churchName={user.churchName}
              currentUser={user}
              cells={effectiveCells}
              onSelectCell={setSelectedCellId}
              onOpenLeadershipTrack={(member) => setSelectedMemberForTrack(member)}
              onAddMember={handleAddMember}
              onUpdateAttendance={handleUpdateAttendance}
              onUpdateCell={handleUpdateCell}
            />
          )}

          {activeScreen === 'our_cells' && (
            <NossasCelulasView
              currentUser={user}
              churchName={user.churchName}
              cells={effectiveCells}
              onUpdateCell={handleUpdateCell}
            />
          )}

          {activeScreen === 'multiply_cell' && user && (
            <MultiplyCellView
              currentUser={user}
              cells={effectiveCells}
              currentCell={currentCell}
              onNavigate={(screen) => setActiveScreen(screen)}
              onRefreshCells={() => {
                refetchCells();
                queryClient.invalidateQueries({ queryKey: ['church-cells'] });
                queryClient.invalidateQueries({ queryKey: ['churchUnits'] });
              }}
              onSelectCell={setSelectedCellId}
            />
          )}

          {activeScreen === 'leadership_track' && (
            <LeadershipOverviewView
              members={effectiveMembers}
              currentCell={currentCell}
              currentUser={user}
              cells={effectiveCells}
              onSelectCell={setSelectedCellId}
              onOpenMemberTrack={(member) => setSelectedMemberForTrack(member)}
            />
          )}

          {activeScreen === 'reports' && (
            <WeeklyReportView
              currentCell={currentCell}
              members={effectiveMembers}
              cells={effectiveCells}
              onSelectCell={setSelectedCellId}
              currentUser={user}
              autoOpenModal={autoOpenReportModal}
              initialReportDate={targetReportWeek}
            />
          )}

          {activeScreen === 'hierarchy_units' && user && (
            <HierarchicalUnitsView
              user={user}
              targetChurchId={targetChurchContext?.id || user.churchId}
              targetChurchName={targetChurchContext?.name || user.churchName}
              initialLevelIndex={hierarchyLevelIndex}
              onNavigateOverview={() => setActiveScreen('church_overview')}
              onNavigatePool={() => setActiveScreen('member_pool')}
            />
          )}

          {activeScreen === 'member_pool' && user && (
            <MemberPoolView
              user={user}
              onNavigateUnits={() => setActiveScreen('hierarchy_units')}
              onNavigateOverview={() => setActiveScreen('church_overview')}
            />
          )}

          {activeScreen === 'church_overview' && user && (
            <ChurchHierarchyOverviewView
              user={user}
              onNavigateAddUnit={(levelIdx) => {
                setHierarchyLevelIndex(levelIdx);
                setActiveScreen('hierarchy_units');
              }}
              onNavigatePool={() => setActiveScreen('member_pool')}
            />
          )}

          {activeScreen === 'register_church' &&
            (user?.isSystemAdmin || user?.role === 'Administrador' || user?.login === 'admin') && (
              <RegisterChurchView
                onBack={() => setActiveScreen('feed')}
                onSuccessLogin={handleLoginSuccess}
                isLoggedIn={true}
                onNavigateUnits={(church) => {
                  if (church) {
                    setTargetChurchContext({ id: church.churchId, name: church.churchName });
                  }
                  setHierarchyLevelIndex(0);
                  setActiveScreen('hierarchy_units');
                }}
                onNavigateOverview={(church) => {
                  if (church) {
                    setTargetChurchContext({ id: church.churchId, name: church.churchName });
                  }
                  setActiveScreen('church_overview');
                }}
              />
            )}
        </main>
      </PullToRefresh>

      {/* Modal: Trilho de Liderança do Membro */}
      {selectedMemberForTrack && (
        <LeadershipTrackModal
          key={selectedMemberForTrack.id}
          member={selectedMemberForTrack}
          churchId={selectedMemberForTrack.churchId || targetChurchContext?.id || user?.churchId}
          churchName={targetChurchContext?.name || user?.churchName}
          cellName={currentCell?.name || 'Célula'}
          currentUser={user}
          validatorName={user?.name || user?.role || 'Líder Responsável'}
          onClose={() => setSelectedMemberForTrack(null)}
          onSaveProgress={handleSaveLeadershipProgress}
        />
      )}

      {/* Sinalizador de Conexão com o Banco de Dados no canto inferior direito */}
      <ConnectionBadge />
    </div>
  );
}
