'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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
import { getBrowserSupabaseClient } from '../lib/supabase/client';
import { AppChurchLogo } from '../components/AppChurchLogo';
import { LoginScreen } from '../components/LoginScreen';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { ConnectionBadge } from '../components/ConnectionBadge';
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

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Estado de verificação de sessão (Splash/Skeleton inicial para não piscar tela de login)
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Tela inicial após login direcionada para Minha Célula
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('my_cell');
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

  // Load church data isolated by churchId
  const loadChurchData = useCallback(
    async (churchId: string, initialCellId?: string, currentUserId?: string) => {
      try {
        const churchCells = await AppChurchService.getCells(churchId);
        setCells(churchCells);

        const targetCellId =
          initialCellId && churchCells.some((c) => c.id === initialCellId)
            ? initialCellId
            : churchCells[0]?.id || '';
        setSelectedCellId(targetCellId);

        const churchMembers = await AppChurchService.getMembers(churchId);
        setMembers(churchMembers);

        const churchPosts = await AppChurchService.getFeedPosts(
          churchId,
          undefined,
          currentUserId,
          10
        );
        setPosts(churchPosts);

        const churchAnnouncements = await AppChurchService.getAnnouncements(churchId);
        setAnnouncements(churchAnnouncements);
      } catch (err) {
        console.warn('Erro ao carregar dados da igreja:', err);
      }
    },
    []
  );

  // Restauração da sessão no mount via Supabase Auth (Splash/Skeleton enquanto valida)
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const sessionUser = await AppChurchService.getCurrentUser();
        if (isMounted) {
          if (sessionUser) {
            setUser(sessionUser);
            setIsAuthenticated(true);
            await loadChurchData(
              sessionUser.churchId,
              sessionUser.currentCellId,
              sessionUser.id
            );
          } else {
            setIsAuthenticated(false);
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
  }, [loadChurchData]);

  // Connection check on mount
  useEffect(() => {
    AppChurchService.checkConnection().then((status) => {
      setConnectionStatus(status);
    });
  }, []);

  // Refresh handler (re-queries Supabase / storage)
  const handleRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await loadChurchData(user.churchId, selectedCellId, user.id);
      const status = await AppChurchService.checkConnection();
      setConnectionStatus(status);
    } catch (err) {
      console.warn('Refresh error:', err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 600);
    }
  };

  // Login handler
  const handleLoginSuccess = async (authenticatedUser: UserProfile) => {
    setUser(authenticatedUser);
    setIsAuthenticated(true);
    setActiveScreen('feed'); // Home is Feed

    // Load data strictly for this user's church
    await loadChurchData(
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

  // Cell Members Management
  const handleAddMember = async (newMemberData: Omit<CellMember, 'id'>) => {
    const created = await AppChurchService.addMember(newMemberData);
    setMembers((prev) => [created, ...prev]);
  };

  const handleUpdateAttendance = async (
    memberId: string,
    newStatus: AttendanceStatus,
    newPercentage: number
  ) => {
    await AppChurchService.updateMemberAttendance(memberId, newStatus, newPercentage);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, attendanceStatus: newStatus, attendancePercentage: newPercentage }
          : m
      )
    );
  };

  const handleSaveLeadershipProgress = async (
    memberId: string,
    progress: LeadershipTrackProgress
  ) => {
    const resolvedChurchId = selectedMemberForTrack?.churchId || user?.churchId;
    const resolvedCellId = selectedMemberForTrack?.cellId || currentCell?.id;
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
    cells.find((c) => c.id === selectedCellId) ||
    cells[0] || {
      id: 'cell-pending',
      churchId: user?.churchId || 'church-default',
      name: cells.length === 0 ? 'Nenhuma Célula Cadastrada' : 'Adonai',
      leaderName: user?.name || 'Pastor Titular',
      sectorName: cells.length === 0 ? 'Pendente' : 'Setor Geral',
      address: cells.length === 0 ? 'Pendente de cadastro' : 'Rua Sumaré, 245 - Junco',
      meetingDay: 'Quinta-feira',
      meetingTime: '19:30',
      memberCount: members.length,
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
        cells={cells}
        selectedCellId={selectedCellId}
        onSelectCell={setSelectedCellId}
        onToggleSidebar={() => setIsSidebarOpen(true)}
        onRefreshData={handleRefresh}
        isRefreshing={isRefreshing}
        onLogout={handleLogout}
      />

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

      {/* Main Dynamic View */}
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
            members={members}
            cell={currentCell}
            churchName={user.churchName}
            currentUser={user}
            cells={cells}
            onSelectCell={setSelectedCellId}
            onOpenLeadershipTrack={(member) => setSelectedMemberForTrack(member)}
            onAddMember={handleAddMember}
            onUpdateAttendance={handleUpdateAttendance}
          />
        )}

        {activeScreen === 'leadership_track' && (
          <LeadershipOverviewView
            members={members}
            currentCell={currentCell}
            currentUser={user}
            cells={cells}
            onSelectCell={setSelectedCellId}
            onOpenMemberTrack={(member) => setSelectedMemberForTrack(member)}
          />
        )}

        {activeScreen === 'reports' && (
          <WeeklyReportView currentCell={currentCell} members={members} />
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
