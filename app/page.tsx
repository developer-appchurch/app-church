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

export default function Home() {
  // Requirement 1: Tela inicial do aplicativo sempre será Login
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Requirement 2: Após o login, a tela Home é o Feed de Notícias
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
    await AppChurchService.saveLeadershipProgress(memberId, progress);
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

  // Current active cell
  const currentCell: CellGroup =
    cells.find((c) => c.id === selectedCellId) ||
    cells[0] || {
      id: 'cell-default',
      churchId: user?.churchId || 'church-sobral',
      name: 'Adonai',
      leaderName: user?.name || 'Líder',
      sectorName: user?.sector || 'Setor Adonai',
      address: 'Rua Sumaré, 245 - Junco',
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
            onOpenLeadershipTrack={(member) => setSelectedMemberForTrack(member)}
            onAddMember={handleAddMember}
            onUpdateAttendance={handleUpdateAttendance}
          />
        )}

        {activeScreen === 'leadership_track' && (
          <LeadershipOverviewView
            members={members}
            currentCell={currentCell}
            onOpenMemberTrack={(member) => setSelectedMemberForTrack(member)}
          />
        )}

        {activeScreen === 'meetings' && (
          <MeetingsCalendarView currentCell={currentCell} />
        )}

        {activeScreen === 'reports' && (
          <WeeklyReportView currentCell={currentCell} members={members} />
        )}
      </main>

      {/* Modal: Trilho de Liderança do Membro */}
      {selectedMemberForTrack && (
        <LeadershipTrackModal
          member={selectedMemberForTrack}
          cellName={currentCell.name}
          onClose={() => setSelectedMemberForTrack(null)}
          onSaveProgress={handleSaveLeadershipProgress}
        />
      )}

      {/* Sinalizador de Conexão com o Banco de Dados no canto inferior direito */}
      <ConnectionBadge />
    </div>
  );
}
