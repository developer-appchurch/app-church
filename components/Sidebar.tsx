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
} from 'lucide-react';
import {
  optimizeImageToWebP,
  validateImageFile,
  validateImageForDatabase,
  IMAGE_PRESETS,
  formatFileSize,
} from '../lib/imageOptimizer';
import { ActiveScreen, UserProfile, CellGroup } from '../types';
import { AppChurchLogo } from './AppChurchLogo';
import { AppChurchService } from '../lib/supabase';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useQueryClient } from '@tanstack/react-query';

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
          return res.json();
        },
        staleTime: 1000 * 60 * 3,
      }).catch(() => {});
    }
  };

  const [isPushHelpModalOpen, setIsPushHelpModalOpen] = useState(false);
  const [pushFeedbackMessage, setPushFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleReactivateNotifications = async () => {
    if (!user) return;
    setPushFeedbackMessage(null);

    // 1. Remove qualquer flag de dismiss e denied do localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('appchurch_push_dismissed');
      localStorage.removeItem('appchurch_push_denied');
      window.dispatchEvent(new Event('appchurch:reset-push-banner'));
    }

    refreshPushPermission();

    // 2. Verifica a permissão atual em tempo real
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setIsPushHelpModalOpen(true);
      return;
    }

    // 3. Se for 'default' ou 'granted', dispara o fluxo de inscrição
    const success = await subscribeToPush(user.id);
    if (success) {
      setPushFeedbackMessage({
        type: 'success',
        text: 'Notificações ativadas com sucesso! Você receberá alertas de relatórios pendentes.',
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('appchurch:reset-push-banner'));
      }
      setTimeout(() => setPushFeedbackMessage(null), 4000);
    } else {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setIsPushHelpModalOpen(true);
      }
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
        ]
      : []),
    {
      id: 'our_cells' as ActiveScreen,
      label: 'Nossas Células',
      sublabel: 'Galeria & busca de todas as células',
      icon: Compass,
    },
    ...(canAccessLeadershipFeatures
      ? [
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
                onClick={async () => {
                  await handleReactivateNotifications();
                }}
                disabled={isPushLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] active:scale-95 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isPushLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : isPushSubscribed ? (
                  <>
                    <RefreshCw size={14} />
                    <span>Sincronizar Permissão</span>
                  </>
                ) : pushPermission === 'denied' ? (
                  <>
                    <RefreshCw size={14} />
                    <span>Já liberei, ativar agora</span>
                  </>
                ) : (
                  <>
                    <Bell size={14} />
                    <span>Liberar Notificações</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
