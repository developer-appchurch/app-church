'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { LoginScreen } from '../components/LoginScreen';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { MyCellView } from '../components/MyCellView';
import { FeedView } from '../components/FeedView';
import { LeadershipOverviewView } from '../components/LeadershipOverviewView';
import { MeetingsCalendarView } from '../components/MeetingsCalendarView';
import { WeeklyReportView } from '../components/WeeklyReportView';
import { LeadershipTrackModal } from '../components/LeadershipTrackModal';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { RegisterChurchView } from '../components/RegisterChurchView';
import { HierarchicalUnitsView } from '../components/HierarchicalUnitsView';
import { MemberPoolView } from '../components/MemberPoolView';
import { ChurchHierarchyOverviewView } from '../components/ChurchHierarchyOverviewView';
import { Plus, AlertCircle, Layers, X, CheckCircle2, Loader2 } from 'lucide-react';

export default function Home() {
  // Requirement 1: Tela inicial do aplicativo sempre será Login
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
  const loadChurchData = useCallback(async (churchId: string, initialCellId?: string) => {
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

      const churchPosts = await AppChurchService.getFeedPosts(churchId);
      setPosts(churchPosts);

      const churchAnnouncements = await AppChurchService.getAnnouncements(churchId);
      setAnnouncements(churchAnnouncements);
    } catch (err) {
      console.warn('Erro ao carregar dados da igreja:', err);
    }
  }, []);

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
      await loadChurchData(user.churchId, selectedCellId);
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
    await loadChurchData(authenticatedUser.churchId, authenticatedUser.currentCellId);
  };

  // Logout handler returning strictly to Login screen
  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    setCells([]);
    setMembers([]);
    setPosts([]);
    setAnnouncements([]);
    setSelectedCellId('');
    setActiveScreen('feed');
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
    const updated = await AppChurchService.toggleLikePost(postId);
    setPosts(updated.filter((p) => p.churchId === user?.churchId));
  };

  const handleAddComment = async (postId: string, commentText: string) => {
    if (!user) return;
    const updated = await AppChurchService.addComment(postId, commentText, user);
    setPosts(updated.filter((p) => p.churchId === user.churchId));
  };

  const handleCreatePost = async (
    newPostData: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ) => {
    const created = await AppChurchService.createFeedPost(newPostData);
    setPosts((prev) => [created, ...prev]);
  };

  const handleDeletePost = async (postId: string) => {
    const updated = await AppChurchService.deleteFeedPost(postId);
    setPosts(updated.filter((p) => p.churchId === user?.churchId));
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
        {/* Banner Direcionando para o Cadastro dos Níveis Organizacionais antes das Células */}
        {cells.length === 0 && (
          <div className="max-w-5xl mx-auto px-4 pt-4">
            <div className="bg-sky-50 border border-sky-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-sky-100 text-sky-950 rounded-xl shrink-0 mt-0.5">
                  <Layers size={24} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-sky-950">
                    Estruturação da Hierarquia Organizacional
                  </h3>
                  <p className="text-xs sm:text-sm text-sky-900 mt-1 max-w-2xl leading-relaxed">
                    Sua igreja ainda não possui células cadastradas. Cadastre primeiro os níveis superiores da denominação (iniciando pelo 1º nível) antes de criar as células correspondentes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHierarchyLevelIndex(0);
                  setActiveScreen('hierarchy_units');
                }}
                className="px-5 py-3 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Layers size={16} />
                <span>Cadastrar Níveis Organizacionais</span>
              </button>
            </div>
          </div>
        )}

        {activeScreen === 'feed' && (
          <FeedView
            posts={posts}
            announcements={announcements}
            currentUser={user}
            currentCell={currentCell}
            churchName={user.churchName}
            onLikePost={handleLikePost}
            onAddComment={handleAddComment}
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

        {activeScreen === 'meetings' && (
          <MeetingsCalendarView currentCell={currentCell} />
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
          churchId={selectedMemberForTrack.churchId || targetChurchContext?.id || user.churchId}
          churchName={targetChurchContext?.name || user.churchName}
          cellName={currentCell?.name || 'Célula'}
          onClose={() => setSelectedMemberForTrack(null)}
          onSaveProgress={handleSaveLeadershipProgress}
        />
      )}

      {/* Sinalizador de Conexão com o Banco de Dados no canto inferior direito */}
      <ConnectionBadge />
    </div>
  );
}
