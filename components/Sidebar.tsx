'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Home,
  Users,
  Award,
  Calendar,
  FileText,
  LogOut,
  X,
  ChevronRight,
  Building2,
  Layers,
  Network,
  Camera,
  Upload,
  Check,
  Sparkles,
  Loader2,
  AlertCircle,
  Compass,
  Bell,
  BellRing,
  BellOff,
  HelpCircle,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Settings,
  BarChart3,
  Plus,
  MapPin,
  Clock,
} from 'lucide-react';
import {
  optimizeImageToWebP,
  validateImageFile,
  validateImageForDatabase,
  IMAGE_PRESETS,
  formatFileSize,
} from '../lib/imageOptimizer';
import { ActiveScreen, UserProfile, CellGroup, ChurchHierarchicalLevel, OrganizationalUnit } from '../types';
import { AppChurchLogo } from './AppChurchLogo';
import { AppChurchService, invalidateMemoryCache } from '../lib/supabase';
import { uploadUnitPhoto, deleteUnitPhoto } from '../lib/unitPhotoStorage';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useQueryClient, useQuery } from '@tanstack/react-query';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  user: UserProfile;
  currentCell?: CellGroup;
  onLogout: () => void;
  onUpdateAvatar?: (newAvatarUrl: string) => Promise<void> | void;
}

const SUGGESTED_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=250',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=250',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=250',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=250',
];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeScreen,
  onNavigate,
  user,
  currentCell,
  onLogout,
  onUpdateAvatar,
}) => {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '');
  const [isOptimizingAvatar, setIsOptimizingAvatar] = useState(false);
  const [avatarStats, setAvatarStats] = useState<{ size: string; reduction: string } | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Push Notifications state & actions
  const {
    isSupported: isPushSupported,
    permission: pushPermission,
    isSubscribed: isPushSubscribed,
    isLoading: isPushLoading,
    errorMessage: pushErrorMessage,
    subscribeToPush,
    unsubscribeFromPush,
    refreshPermission: refreshPushPermission,
  } = usePushNotifications(user?.id);

  const queryClient = useQueryClient();

  const handlePrefetchItem = (screenId: ActiveScreen) => {
    if (screenId === 'reports' && currentCell?.id) {
      // 1. Pré-carrega o chunk do componente WeeklyReportView
      import('./WeeklyReportView').catch(() => {});
      // 2. Pré-carrega a query de relatórios recentes no cache do React Query
      queryClient.prefetchQuery({
        queryKey: ['weekly-reports', currentCell.id, currentCell.churchId],
        queryFn: async () => {
          const url = `/api/reports?cellId=${encodeURIComponent(currentCell.id)}${
            currentCell.churchId ? `&churchId=${encodeURIComponent(currentCell.churchId)}` : ''
          }&mode=recent`;
          const res = await fetch(url);
          if (!res.ok) throw new Error('Falha no prefetch');
          return res.json().catch(() => ({ reports: [] }));
        },
        staleTime: 1000 * 60 * 3,
      }).catch(() => {});
    }
  };

  const [isPushHelpModalOpen, setIsPushHelpModalOpen] = useState(false);
  const [pushFeedbackMessage, setPushFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggleNotifications = async () => {
    if (!user) return;
    setPushFeedbackMessage(null);

    // Se já estiver ativo, realiza a desativação
    if (isPushSubscribed) {
      const success = await unsubscribeFromPush();
      if (success) {
        setPushFeedbackMessage({
          type: 'success',
          text: 'Notificações desativadas para este dispositivo.',
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('appchurch:reset-push-banner'));
        }
        setTimeout(() => setPushFeedbackMessage(null), 3500);
      } else {
        setPushFeedbackMessage({
          type: 'error',
          text: 'Não foi possível desativar as notificações.',
        });
      }
      return;
    }

    // Se estiver desativado, ativa
    if (typeof window !== 'undefined') {
      localStorage.removeItem('appchurch_push_dismissed');
      localStorage.removeItem('appchurch_push_denied');
      window.dispatchEvent(new Event('appchurch:reset-push-banner'));
    }

    refreshPushPermission();

    const success = await subscribeToPush(user.id);
    if (success) {
      setPushFeedbackMessage({
        type: 'success',
        text: 'Notificações ativadas com sucesso! Status atualizado para verde.',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('appchurch:reset-push-banner'));
      }
      setTimeout(() => setPushFeedbackMessage(null), 3500);
    } else {
      setPushFeedbackMessage({
        type: 'error',
        text: pushErrorMessage || 'Permissão bloqueada ou não concedida pelo navegador.',
      });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setAvatarError(null);

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setAvatarError(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    setIsOptimizingAvatar(true);
    try {
      const result = await optimizeImageToWebP(file, IMAGE_PRESETS.AVATAR);
      if (!result.dataUrl.startsWith('data:image/webp')) {
        throw new Error('A imagem não pôde ser convertida para WebP.');
      }
      setAvatarPreview(result.dataUrl);
      setAvatarStats({
        size: formatFileSize(result.optimizedSize),
        reduction: result.reductionLabel,
      });
      setAvatarError(null);
    } catch (err: any) {
      console.error('Falha ao processar e converter foto para WebP:', err);
      setAvatarError('Não foi possível converter a imagem para WebP. Por favor, envie uma foto válida (JPG, PNG ou WEBP).');
    } finally {
      setIsOptimizingAvatar(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!avatarPreview || !user) return;
    setAvatarError(null);

    const dbValidation = validateImageForDatabase(avatarPreview, 'Foto de perfil');
    if (!dbValidation.isValid) {
      setAvatarError(dbValidation.error || 'A imagem deve estar no formato WebP.');
      return;
    }

    setIsSavingAvatar(true);
    try {
      if (onUpdateAvatar) {
        await onUpdateAvatar(avatarPreview);
      } else {
        await AppChurchService.updateUserAvatar(user.id, avatarPreview);
      }
      setAvatarSuccess(true);
      setTimeout(() => {
        setAvatarSuccess(false);
        setIsAvatarModalOpen(false);
      }, 900);
    } catch (err: any) {
      console.error('Erro ao salvar foto de perfil:', err);
      setAvatarError(err?.message || 'Erro ao salvar foto de perfil. Tente novamente.');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const isSystemAdmin =
    user?.isSystemAdmin === true ||
    user?.role === 'Administrador' ||
    user?.login === 'admin';

  const userRoleNorm = (user?.role || '').toLowerCase().trim();
  const isMemberOnly = userRoleNorm === 'membro' || userRoleNorm === 'visitante' || userRoleNorm === '';
  const canAccessLeadershipFeatures = !isMemberOnly;

  // Consulta as permissões efetivas do usuário para checagem com hasPermission
  const { data: userPermissions } = useQuery({
    queryKey: ['user-effective-permissions', user?.id],
    queryFn: () => (user ? AppChurchService.getUserEffectivePermissions(user) : Promise.resolve({})),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const canManagePermissions =
    isSystemAdmin ||
    userRoleNorm.includes('pastor') ||
    AppChurchService.hasPermission(user, 'church:admin', userPermissions) ||
    AppChurchService.hasPermission(user, 'permissions:manage', userPermissions);

  const canAccessChurchSettings =
    isSystemAdmin ||
    userRoleNorm.includes('pastor') ||
    AppChurchService.hasPermission(user, 'church:admin', userPermissions) ||
    AppChurchService.hasPermission(user, 'track:manage', userPermissions) ||
    AppChurchService.hasPermission(user, 'unit:transfer_delete', userPermissions) ||
    AppChurchService.hasPermission(user, 'neighborhood:manage', userPermissions) ||
    AppChurchService.hasPermission(user, 'member:access_manage', userPermissions);

  // Restrito a Líder de Célula ou funções acima (Setor, Área, Rede, Distrito, Pastor, Supervisor, Admin) —
  // deliberadamente mais estrito que canAccessLeadershipFeatures, que também libera Discipulador/Anfitrião/etc.
  const isCellLeaderOrAbove =
    isSystemAdmin ||
    userRoleNorm.includes('pastor') ||
    userRoleNorm.includes('supervisor') ||
    userRoleNorm.includes('administrador') ||
    userRoleNorm.includes('líder de');

  // --- Criação Rápida de Célula (modal disparado direto pelo menu lateral) ---
  const [isNewCellModalOpen, setIsNewCellModalOpen] = useState(false);
  const [newCellSetorId, setNewCellSetorId] = useState('');
  const [newCellName, setNewCellName] = useState('');
  const [newCellAddress, setNewCellAddress] = useState('');
  const [newCellNeighborhood, setNewCellNeighborhood] = useState('Centro');
  const [newCellDay, setNewCellDay] = useState('Quarta-feira');
  const [newCellTime, setNewCellTime] = useState('19:30');
  const [newCellPhotoPreview, setNewCellPhotoPreview] = useState(''); // data URL local, só para exibição imediata
  const [newCellPhotoUrl, setNewCellPhotoUrl] = useState(''); // URL pública real no Storage, enviada ao backend
  const [isUploadingCellPhoto, setIsUploadingCellPhoto] = useState(false);
  const [isCreatingCell, setIsCreatingCell] = useState(false);
  const [createCellError, setCreateCellError] = useState('');
  const [createCellSuccessMessage, setCreateCellSuccessMessage] = useState('');
  const cellPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Reaproveita as mesmas chaves de cache do React Query usadas em Níveis Organizacionais
  // e Configurações da Igreja, para que a lista de Setores já venha do cache quando possível.
  const { data: churchLevelsForNewCell = [] } = useQuery({
    queryKey: ['churchLevels', user?.churchId],
    queryFn: () => AppChurchService.getChurchLevels(user!.churchId),
    enabled: !!user?.churchId && isCellLeaderOrAbove,
    staleTime: 1000 * 60 * 10,
  });

  const { data: churchUnitsForNewCell = [] } = useQuery({
    queryKey: ['churchUnits', user?.churchId],
    queryFn: () => AppChurchService.getUnits(user!.churchId, undefined, 'flat'),
    enabled: !!user?.churchId && isCellLeaderOrAbove && isNewCellModalOpen,
    staleTime: 1000 * 60 * 5,
  });

  const sortedChurchLevels = [...churchLevelsForNewCell].sort((a, b) => a.order - b.order);
  const leafLevel: ChurchHierarchicalLevel | undefined =
    sortedChurchLevels.find((l) => l.isLeaf) || sortedChurchLevels[sortedChurchLevels.length - 1];
  const leafLevelIndex = leafLevel ? sortedChurchLevels.findIndex((l) => l.id === leafLevel.id) : -1;
  const setorLevel: ChurchHierarchicalLevel | undefined =
    leafLevelIndex > 0 ? sortedChurchLevels[leafLevelIndex - 1] : undefined;
  const setorOptions: OrganizationalUnit[] = setorLevel
    ? churchUnitsForNewCell
        .filter((u: OrganizationalUnit) => u.levelTypeId === setorLevel.id && u.isActive)
        .sort((a: OrganizationalUnit, b: OrganizationalUnit) => a.name.localeCompare(b.name))
    : [];

  const canCreateQuickCell = isCellLeaderOrAbove && !!leafLevel && leafLevelIndex > 0;

  // Limpa apenas os campos de conteúdo (mantém Setor, Dia e Horário, já que
  // em geral quem usa esse modal cadastra uma célula por vez no mesmo Setor).
  const resetNewCellContentFields = () => {
    setNewCellName('');
    setNewCellAddress('');
    setNewCellNeighborhood('Centro');
    setNewCellPhotoPreview('');
    setNewCellPhotoUrl('');
    setCreateCellError('');
  };

  const handleOpenNewCellModal = () => {
    setNewCellSetorId('');
    setNewCellDay('Quarta-feira');
    setNewCellTime('19:30');
    resetNewCellContentFields();
    setCreateCellSuccessMessage('');
    setIsNewCellModalOpen(true);
  };

  const handleCellPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCreateCellError('');

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setCreateCellError(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    // Se já havia uma foto anterior enviada ao Storage para esta célula ainda não
    // salva, remove para não deixar arquivo órfão ao trocar a foto antes de confirmar.
    const previousPhotoPath = newCellPhotoUrl;

    setIsUploadingCellPhoto(true);
    try {
      // Preview local imediato (apenas em memória, nunca enviado ao banco)
      const optimized = await optimizeImageToWebP(file, IMAGE_PRESETS.UNIT_PHOTO);
      setNewCellPhotoPreview(optimized.dataUrl);

      // Upload real para o Supabase Storage (bucket "units") — só a URL pública
      // resultante é salva em unidades.foto_url, igual ao padrão usado no Feed.
      const { publicUrl } = await uploadUnitPhoto(optimized.blob, user?.id || user?.login || '');
      setNewCellPhotoUrl(publicUrl);

      if (previousPhotoPath) {
        deleteUnitPhoto(previousPhotoPath, user?.id || user?.login || '');
      }
    } catch (err: any) {
      console.error('Falha ao enviar foto da célula para o Storage:', err);
      setCreateCellError(err?.message || 'Não foi possível enviar a foto. Tente novamente.');
      setNewCellPhotoPreview('');
      setNewCellPhotoUrl('');
    } finally {
      setIsUploadingCellPhoto(false);
    }
  };

  const handleCreateQuickCell = async () => {
    if (!leafLevel || !user?.churchId) return;
    if (!newCellSetorId) {
      setCreateCellError(`Selecione o ${setorLevel?.name || 'Setor'} responsável.`);
      return;
    }
    if (!newCellName.trim()) {
      setCreateCellError(`Informe o nome do(a) ${leafLevel.name}.`);
      return;
    }
    if (isUploadingCellPhoto) {
      setCreateCellError('Aguarde o envio da foto terminar antes de salvar.');
      return;
    }

    setIsCreatingCell(true);
    setCreateCellError('');
    const createdName = newCellName.trim();
    try {
      // newCellPhotoUrl já é a URL pública real no Supabase Storage (bucket "units"),
      // nunca o base64 — só a URL é salva em unidades.foto_url.
      await AppChurchService.createUnit({
        churchId: user.churchId,
        levelTypeId: leafLevel.id,
        name: createdName,
        parentId: newCellSetorId,
        neighborhood: newCellNeighborhood.trim(),
        address: newCellAddress.trim(),
        meetingDay: newCellDay,
        meetingTime: newCellTime,
        fotoUrl: newCellPhotoUrl || undefined,
        createdByMemberId: user.id || user.login,
      });

      // Mantém tudo coerente: invalida cache em memória (lib/supabase.ts) e o
      // cache do React Query usado por Níveis Organizacionais / Config. da Igreja.
      invalidateMemoryCache('units:');
      invalidateMemoryCache(`cells:${user.churchId}`);
      queryClient.invalidateQueries({ queryKey: ['churchUnits', user.churchId] });

      // Mantém o modal aberto (ver ponto 5 da conversa): limpa só os campos de
      // conteúdo, mantém o Setor/Dia/Horário selecionados e avisa com um banner
      // que desaparece sozinho, para cadastrar a próxima célula em seguida se precisar.
      resetNewCellContentFields();
      setCreateCellSuccessMessage(`${leafLevel.name} "${createdName}" cadastrado(a) com sucesso!`);
      setTimeout(() => setCreateCellSuccessMessage(''), 4000);
    } catch (err: any) {
      setCreateCellError(err?.message || `Falha ao cadastrar o(a) ${leafLevel.name}.`);
    } finally {
      setIsCreatingCell(false);
    }
  };

  const menuItems = [
    {
      id: 'feed' as ActiveScreen,
      label: 'Feed de Notícias',
      sublabel: 'Momentos, Fotos & Avisos Gerais',
      icon: Home,
    },
    {
      id: 'my_cell' as ActiveScreen,
      label: 'Minha Célula',
      sublabel: 'Membros, Frequência & Trilho',
      icon: Users,
    },
    ...(canAccessLeadershipFeatures
      ? [
          {
            id: 'reports' as ActiveScreen,
            label: 'Relatório Semanal',
            sublabel: 'Lançar relatório de presença',
            icon: FileText,
          },
          {
            id: 'leadership_track' as ActiveScreen,
            label: 'Trilho de Liderança',
            sublabel: 'Visão Geral do Discipulado',
            icon: Award,
          },
          {
            id: 'multiply_cell' as ActiveScreen,
            label: 'Multiplicar Célula',
            sublabel: 'Multiplique em poucos passos',
            icon: Sparkles,
          },
          {
            id: 'member_pool' as ActiveScreen,
            label: 'Nossos Membros',
            sublabel: 'Gestão geral & vínculo de membros',
            icon: Users,
          },
          {
            id: 'our_cells' as ActiveScreen,
            label: 'Nossas Células',
            sublabel: 'Galeria & busca de todas as células',
            icon: Compass,
          },
          {
            id: 'church_indicators' as ActiveScreen,
            label: 'Indicadores da Igreja',
            sublabel: 'Trilho de Liderança em gráficos',
            icon: BarChart3,
          },
          {
            id: 'hierarchy_units' as ActiveScreen,
            label: 'Níveis Organizacionais',
            sublabel: 'Cadastro por nível (Área, Setor, Célula)',
            icon: Layers,
          },
          {
            id: 'church_overview' as ActiveScreen,
            label: 'Visão Geral da Igreja',
            sublabel: 'Organograma & árvore hierárquica',
            icon: Network,
          },
        ]
      : [
          {
            id: 'our_cells' as ActiveScreen,
            label: 'Nossas Células',
            sublabel: 'Galeria & busca de todas as células',
            icon: Compass,
          },
        ]),
    ...(canManagePermissions
      ? [
          {
            id: 'permissions_manage' as ActiveScreen,
            label: 'Gestão de Permissões',
            sublabel: 'Permissões especiais por membro',
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(canAccessChurchSettings
      ? [
          {
            id: 'church_settings' as ActiveScreen,
            label: 'Configurações da Igreja',
            sublabel: 'Trilho, Setores, Bairros & Logins',
            icon: Settings,
          },
        ]
      : []),
    ...(isSystemAdmin
      ? [
          {
            id: 'register_church' as ActiveScreen,
            label: 'Cadastrar Igreja',
            sublabel: 'Nova congregação & hierarquia',
            icon: Building2,
          },
        ]
      : []),
  ];

  const handleLogoutClick = () => {
    onClose();
    onLogout();
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel with responsive height, scrollable navigation, and fixed header/footer */}
      <aside
        id="app-sidebar-drawer"
        className={`fixed top-0 left-0 h-full w-80 max-w-[85vw] sm:max-w-sm bg-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegação Lateral"
      >
        {/* Fixed Header Section inside sidebar */}
        <div className="shrink-0 bg-[#04213d] text-white p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <AppChurchLogo variant="light" className="h-5 sm:h-[22px] w-14 sm:w-16" />
            </div>
            <button
              id="btn-sidebar-close"
              type="button"
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              aria-label="Fechar menu lateral"
            >
              <X size={22} />
            </button>
          </div>

          {/* User Profile Card in Drawer */}
          <div className="flex items-center gap-3 pt-1">
            <div
              id="btn-change-user-avatar"
              onClick={() => {
                setAvatarPreview(user.avatarUrl || '');
                setIsAvatarModalOpen(true);
              }}
              title="Clique para alterar sua foto de perfil"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-sky-400 hover:border-white overflow-hidden bg-slate-700 shrink-0 relative cursor-pointer group shadow-md transition-all"
            >
              <Image
                src={
                  user.avatarUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                }
                alt={user.name}
                width={48}
                height={48}
                priority
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                unoptimized
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={18} className="text-white drop-shadow-md" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white text-sm sm:text-base truncate">{user.name}</h3>
              <button
                type="button"
                onClick={() => {
                  setAvatarPreview(user.avatarUrl || '');
                  setIsAvatarModalOpen(true);
                }}
                className="text-xs text-sky-200 hover:text-white font-medium truncate flex items-center gap-1 cursor-pointer transition-colors"
                title="Alterar foto de perfil"
              >
                <span>{user.role}</span>
                <span className="text-[10px] text-sky-300 underline underline-offset-2 ml-1">
                  • Trocar foto
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Middle Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Nav Links */}
          <nav className="p-3 space-y-1">
            {canCreateQuickCell && (
              <button
                type="button"
                id="btn-sidebar-new-cell"
                onClick={() => {
                  handleOpenNewCellModal();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left transition-all cursor-pointer border-2 border-dashed border-sky-300 bg-sky-50 hover:bg-sky-100 hover:border-sky-400 mb-1.5"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Plus size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-sky-950 truncate">
                    Novo(a) {leafLevel?.name || 'Célula'}
                  </div>
                  <div className="text-[11px] text-sky-700 truncate">
                    Cadastro rápido, sem sair da tela atual
                  </div>
                </div>
              </button>
            )}
            {menuItems.map((item) => {
              const isActive = activeScreen === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  type="button"
                  onMouseEnter={() => handlePrefetchItem(item.id)}
                  onTouchStart={() => handlePrefetchItem(item.id)}
                  onFocus={() => handlePrefetchItem(item.id)}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 sm:py-3 rounded-xl text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#04213d] text-white shadow-md font-semibold'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <Icon size={19} className={`shrink-0 ${isActive ? 'text-sky-300' : 'text-slate-500'}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className={`text-[11px] truncate ${isActive ? 'text-sky-200' : 'text-slate-400'}`}>
                        {item.sublabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ChevronRight
                      size={16}
                      className={isActive ? 'text-sky-300' : 'text-slate-300'}
                    />
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Fixed Bottom Actions: Logout button + Device Notification status button */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
          <button
            type="button"
            id="btn-sidebar-logout"
            onClick={handleLogoutClick}
            className="flex-1 flex items-center justify-center gap-2.5 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm font-bold text-red-700 bg-red-50/80 hover:bg-red-100 hover:text-red-800 transition border border-red-200 shadow-2xs active:scale-[0.99] cursor-pointer group min-w-0"
            title="Deslogar do App e voltar para a tela de login"
          >
            <LogOut size={18} className="text-red-600 group-hover:-translate-x-0.5 transition-transform shrink-0" />
            <div className="text-left min-w-0">
              <div className="text-xs sm:text-sm font-bold leading-tight text-red-700 truncate">
                Deslogar do App
              </div>
              <div className="text-[10px] font-normal text-red-500 leading-tight truncate">
                Volta para a tela de login
              </div>
            </div>
          </button>

          {/* Ícone de Notificações ao lado direito do botão deslogar */}
          <button
            type="button"
            id="btn-sidebar-notification-status"
            onClick={() => setIsPushHelpModalOpen(true)}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all cursor-pointer shadow-2xs active:scale-95 ${
              isPushSubscribed
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-600 hover:text-emerald-700'
                : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-600 hover:text-rose-700'
            }`}
            title={
              isPushSubscribed
                ? 'Notificações habilitadas neste dispositivo (Toque para gerenciar)'
                : 'Notificações desabilitadas neste dispositivo (Toque para liberar acesso)'
            }
            aria-label="Status de notificações no dispositivo"
          >
            {isPushSubscribed ? (
              <BellRing size={20} className="text-emerald-600" />
            ) : (
              <BellOff size={20} className="text-rose-600" />
            )}
          </button>
        </div>
      </aside>

      {/* Modal Interativo para Alterar Foto de Perfil */}
      {isAvatarModalOpen && (
        <div
          id="modal-change-avatar"
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none text-slate-800"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <Camera size={20} className="text-sky-300" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Alterar Foto de Perfil</h3>
                  <p className="text-xs text-sky-200 truncate max-w-[200px]">{user.name}</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-avatar-modal"
                onClick={() => setIsAvatarModalOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Preview Central */}
              <div className="flex flex-col items-center justify-center gap-2 py-1">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-28 rounded-full border-4 border-sky-600 overflow-hidden bg-slate-100 shadow-md relative group cursor-pointer"
                  title="Clique para carregar uma imagem do seu aparelho"
                >
                  <Image
                    src={
                      avatarPreview ||
                      user.avatarUrl ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250'
                    }
                    alt="Pré-visualização da foto de perfil"
                    width={112}
                    height={112}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Upload size={22} />
                    <span className="text-[11px] font-semibold mt-1">Carregar Foto</span>
                  </div>
                </div>

                {/* Input nativo de arquivo oculto */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelected}
                />

                {isOptimizingAvatar && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-semibold animate-pulse mt-1">
                    <Loader2 size={14} className="animate-spin text-sky-600" />
                    <span>Otimizando para WebP leve...</span>
                  </div>
                )}

                {avatarStats && !isOptimizingAvatar && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold mt-1 shadow-2xs">
                    <Sparkles size={12} className="text-emerald-600" />
                    <span>WebP Otimizado: {avatarStats.size} ({avatarStats.reduction})</span>
                  </div>
                )}

                {avatarError && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold mt-1 text-left w-full">
                    <AlertCircle size={15} className="text-rose-600 shrink-0" />
                    <span>{avatarError}</span>
                  </div>
                )}

                <button
                  type="button"
                  id="btn-select-device-photo"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isOptimizingAvatar}
                  className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-950 border border-sky-300 text-xs font-bold rounded-xl transition cursor-pointer active:scale-95 shadow-2xs disabled:opacity-50"
                >
                  {isOptimizingAvatar ? (
                    <Loader2 size={15} className="animate-spin text-sky-700" />
                  ) : (
                    <Upload size={15} />
                  )}
                  Escolher do Computador ou Celular
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  Formatos aceitos: JPG, PNG, WEBP (fotos salvas em WebP ultraleve)
                </p>
              </div>

              {/* Sugestões de Avatares Prontos */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Ou selecione uma foto da galeria:
                </label>
                <div className="grid grid-cols-4 gap-2.5">
                  {SUGGESTED_AVATARS.map((avatar, idx) => {
                    const isSelected = avatarPreview === avatar;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setAvatarPreview(avatar);
                          setAvatarStats(null);
                        }}
                        className={`w-full aspect-square rounded-full overflow-hidden border-2 transition p-0.5 cursor-pointer relative ${
                          isSelected
                            ? 'border-sky-600 ring-2 ring-sky-300 scale-105'
                            : 'border-slate-200 hover:border-sky-400'
                        }`}
                        title={`Escolher opção ${idx + 1}`}
                      >
                        <Image
                          src={avatar}
                          alt={`Opção ${idx + 1}`}
                          width={60}
                          height={60}
                          className="w-full h-full object-cover rounded-full"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-sky-900/40 rounded-full flex items-center justify-center">
                            <Check size={18} className="text-white drop-shadow-md stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Informar URL Externa */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ou cole o link direto de uma imagem (URL):
                </label>
                <input
                  type="url"
                  value={avatarPreview}
                  onChange={(e) => setAvatarPreview(e.target.value)}
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                />
              </div>

              {avatarSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                  <Check size={18} className="text-emerald-600" />
                  Foto de perfil atualizada com sucesso!
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setAvatarPreview('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250');
                }}
                className="text-xs text-slate-500 hover:text-rose-600 font-medium cursor-pointer"
              >
                Restaurar Padrão
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  id="btn-confirm-save-avatar"
                  disabled={isSavingAvatar || !avatarPreview}
                  onClick={handleSaveAvatar}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAvatar ? 'Salvando...' : 'Salvar Nova Foto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Liberar / Gerenciar Notificações no Dispositivo */}
      {isPushHelpModalOpen && (
        <div
          id="modal-push-help"
          className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none text-slate-800"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isPushSubscribed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {isPushSubscribed ? <BellRing size={20} /> : <BellOff size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {isPushSubscribed ? 'Notificações Habilitadas' : 'Liberar Acesso a Notificações'}
                  </h3>
                  <p className="text-xs text-sky-200">
                    {isPushSubscribed
                      ? 'Este dispositivo está configurado'
                      : pushPermission === 'denied'
                      ? 'Permissão bloqueada no navegador'
                      : 'Lembretes de relatórios e comunicados'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-push-help-modal"
                onClick={() => {
                  setIsPushHelpModalOpen(false);
                  setPushFeedbackMessage(null);
                }}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto text-xs text-slate-700">
              {pushFeedbackMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
                    pushFeedbackMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {pushFeedbackMessage.type === 'success' ? (
                    <Check size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  )}
                  <span>{pushFeedbackMessage.text}</span>
                </div>
              )}

              {isPushSubscribed ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-xs">Notificações ativas neste dispositivo!</p>
                      <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                        Seu aparelho está autorizado e receberá avisos automáticos sobre relatórios pendentes da sua célula e comunicados da liderança.
                      </p>
                    </div>
                  </div>
                </div>
              ) : pushPermission === 'denied' ? (
                <>
                  <p className="font-semibold text-slate-900 leading-relaxed">
                    As notificações deste site foram marcadas como <strong>Bloqueadas</strong> nas configurações do seu navegador. O navegador não permite reabrir o pop-up automaticamente.
                  </p>

                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 space-y-2">
                    <h4 className="font-bold text-sky-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Check size={14} className="text-sky-600" />
                      Como Desbloquear no Navegador:
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 text-sky-900 font-medium pl-1">
                      <li>
                        Clique no ícone de <strong>Cadeado / Configurações do site</strong> (ao lado do link na barra de endereço do navegador).
                      </li>
                      <li>
                        Localize a opção <strong>&quot;Notificações&quot;</strong>.
                      </li>
                      <li>
                        Altere de <em>&quot;Bloquear&quot;</em> para <strong>&quot;Permitir&quot;</strong> (ou <em>&quot;Perguntar&quot;</em>).
                      </li>
                      <li>
                        Toque no botão abaixo para concluir a liberação.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 space-y-1">
                    <p className="font-bold text-[11px] uppercase tracking-wide">Usa o Navegador Brave?</p>
                    <p className="text-[11px] leading-snug">
                      No Brave, vá em <em>Configurações → Privacidade e Segurança</em> e ative a opção <strong>&quot;Usar serviços do Google para mensagens push&quot;</strong>.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-700 leading-relaxed font-medium">
                    As notificações estão desabilitadas neste dispositivo. Ao liberar, você receberá lembretes sobre preenchimento de relatórios e comunicados importantes.
                  </p>

                  <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl space-y-1 text-sky-900">
                    <p className="font-bold text-xs flex items-center gap-1.5">
                      <BellRing size={14} className="text-sky-700" />
                      Fácil e rápido
                    </p>
                    <p className="text-[11px] leading-relaxed text-sky-800">
                      Toque no botão abaixo e selecione <strong>&quot;Permitir&quot;</strong> quando o navegador solicitar a permissão.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPushHelpModalOpen(false);
                  setPushFeedbackMessage(null);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Fechar
              </button>

              <button
                type="button"
                id="btn-toggle-push-action"
                onClick={async () => {
                  await handleToggleNotifications();
                }}
                disabled={isPushLoading}
                className={`px-4 py-2 text-xs font-bold active:scale-95 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  isPushSubscribed
                    ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300'
                    : 'text-white bg-[#04213d] hover:bg-[#073366]'
                }`}
              >
                {isPushLoading ? (
                  <>
                    <Loader2 size={14} className={`animate-spin ${isPushSubscribed ? 'text-rose-600' : 'text-white'}`} />
                    <span>{isPushSubscribed ? 'Desativando...' : 'Ativando...'}</span>
                  </>
                ) : isPushSubscribed ? (
                  <>
                    <BellOff size={14} className="text-rose-600" />
                    <span>Desativar Notificações</span>
                  </>
                ) : pushPermission === 'denied' ? (
                  <>
                    <RefreshCw size={14} />
                    <span>Já liberei, ativar agora</span>
                  </>
                ) : (
                  <>
                    <BellRing size={14} />
                    <span>Ativar Notificações</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criação Rápida de Célula (ou nível folha equivalente), direto do menu lateral */}
      {isNewCellModalOpen && (
        <div
          id="modal-new-cell"
          className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none text-slate-800"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-[#04213d] text-white p-3.5 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Novo(a) {leafLevel?.name || 'Célula'}</h3>
                  <p className="text-[11px] text-sky-200">Cadastro rápido por {setorLevel?.name || 'Setor'}</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-new-cell-modal"
                onClick={() => setIsNewCellModalOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-2.5 max-h-[75vh] overflow-y-auto">
              {createCellSuccessMessage && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span>{createCellSuccessMessage}</span>
                </div>
              )}

              {createCellError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{createCellError}</span>
                </div>
              )}

              {/* Foto da Célula (compacta, opcional) */}
              <div className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div
                  onClick={() => !isUploadingCellPhoto && cellPhotoInputRef.current?.click()}
                  className="w-12 h-12 rounded-lg border-2 border-sky-300 overflow-hidden bg-white shrink-0 relative cursor-pointer flex items-center justify-center"
                  title="Clique para adicionar uma foto da célula"
                >
                  {newCellPhotoPreview ? (
                    <Image
                      src={newCellPhotoPreview}
                      alt="Foto da célula"
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Camera size={18} className="text-sky-400" />
                  )}
                  {isUploadingCellPhoto && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 size={16} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700">Foto do(a) {leafLevel?.name || 'Célula'}</p>
                  <button
                    type="button"
                    onClick={() => cellPhotoInputRef.current?.click()}
                    disabled={isUploadingCellPhoto}
                    className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold underline underline-offset-2 cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingCellPhoto ? 'Enviando...' : newCellPhotoUrl ? 'Trocar foto' : 'Adicionar foto (opcional)'}
                  </button>
                </div>
                <input
                  ref={cellPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCellPhotoSelected}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {setorLevel?.name || 'Setor'} <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={newCellSetorId}
                    onChange={(e) => setNewCellSetorId(e.target.value)}
                    disabled={isCreatingCell}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer disabled:opacity-60"
                  >
                    <option value="">Selecione...</option>
                    {setorOptions.map((setor) => (
                      <option key={setor.id} value={setor.id}>
                        {setor.name}
                      </option>
                    ))}
                  </select>
                  {setorOptions.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Nenhum {setorLevel?.name || 'Setor'} cadastrado ainda.
                    </p>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome do(a) {leafLevel?.name || 'Célula'} <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCellName}
                    onChange={(e) => setNewCellName(e.target.value)}
                    disabled={isCreatingCell}
                    placeholder="Ex: Betel, Ágape, Filadélfia"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <MapPin size={12} className="text-sky-700" />
                    <span>Endereço</span>
                  </label>
                  <input
                    type="text"
                    value={newCellAddress}
                    onChange={(e) => setNewCellAddress(e.target.value)}
                    disabled={isCreatingCell}
                    placeholder="Rua, número"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={newCellNeighborhood}
                    onChange={(e) => setNewCellNeighborhood(e.target.value)}
                    disabled={isCreatingCell}
                    placeholder="Ex: Centro"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dia da Reunião</label>
                  <select
                    value={newCellDay}
                    onChange={(e) => setNewCellDay(e.target.value)}
                    disabled={isCreatingCell}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer disabled:opacity-60"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock size={12} className="text-sky-700" />
                    <span>Horário</span>
                  </label>
                  <input
                    type="time"
                    value={newCellTime}
                    onChange={(e) => setNewCellTime(e.target.value)}
                    disabled={isCreatingCell}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 disabled:opacity-60"
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    {['19:30', '20:00'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewCellTime(preset)}
                        className={`flex-1 text-[10px] font-semibold px-1.5 py-1 rounded-md transition cursor-pointer ${
                          newCellTime === preset
                            ? 'bg-[#052447] text-white font-bold'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewCellModalOpen(false)}
                disabled={isCreatingCell}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                id="btn-confirm-create-cell"
                disabled={isCreatingCell || isUploadingCellPhoto}
                onClick={handleCreateQuickCell}
                className="px-4 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isCreatingCell ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Criando...</span>
                  </>
                ) : (
                  <span>Criar {leafLevel?.name || 'Célula'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
