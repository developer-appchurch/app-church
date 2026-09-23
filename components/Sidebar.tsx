'use client';

import React from 'react';
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
} from 'lucide-react';
import { ActiveScreen, UserProfile, CellGroup } from '../types';
import { AppChurchLogo } from './AppChurchLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  user: UserProfile;
  currentCell?: CellGroup;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeScreen,
  onNavigate,
  user,
  currentCell,
  onLogout,
}) => {
  const isSystemAdmin =
    user?.isSystemAdmin === true ||
    user?.role === 'Administrador' ||
    user?.login === 'admin';

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
      badge: 'Principal',
    },
    {
      id: 'leadership_track' as ActiveScreen,
      label: 'Trilho de Liderança',
      sublabel: 'Visão Geral do Discipulado',
      icon: Award,
    },
    {
      id: 'meetings' as ActiveScreen,
      label: 'Encontros & Reuniões',
      sublabel: 'Datas, Horários & Local',
      icon: Calendar,
    },
    {
      id: 'reports' as ActiveScreen,
      label: 'Relatório Semanal',
      sublabel: 'Lançar presença e secretaria',
      icon: FileText,
    },
    {
      id: 'hierarchy_units' as ActiveScreen,
      label: 'Níveis Organizacionais',
      sublabel: 'Cadastro por nível (Área, Setor, Célula)',
      icon: Layers,
      badge: 'Estrutura',
    },
    {
      id: 'member_pool' as ActiveScreen,
      label: 'Pool de Membros',
      sublabel: 'Banco geral & vínculo de membros',
      icon: Users,
    },
    {
      id: 'church_overview' as ActiveScreen,
      label: 'Visão Geral da Igreja',
      sublabel: 'Organograma & árvore hierárquica',
      icon: Network,
    },
    ...(isSystemAdmin
      ? [
          {
            id: 'register_church' as ActiveScreen,
            label: 'Cadastrar Igreja',
            sublabel: 'Nova congregação & hierarquia',
            icon: Building2,
            badge: 'Admin',
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
              <AppChurchLogo variant="light" className="h-10 sm:h-11 w-24 sm:w-28" />
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
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-sky-400 overflow-hidden bg-slate-700 shrink-0 relative">
              <Image
                src={
                  user.avatarUrl ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                }
                alt={user.name}
                width={48}
                height={48}
                className="w-full h-full object-cover"
                unoptimized
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white text-sm sm:text-base truncate">{user.name}</h3>
              <p className="text-xs text-sky-200 font-medium truncate">{user.role}</p>
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
                    {item.badge && !isActive && (
                      <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
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

        {/* Fixed Bottom Actions: High-visibility Logout button returning strictly to Login screen */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-slate-200 bg-slate-50 space-y-2">
          <button
            type="button"
            id="btn-sidebar-logout"
            onClick={handleLogoutClick}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-bold text-red-700 bg-red-50/80 hover:bg-red-100 hover:text-red-800 transition border border-red-200 shadow-2xs active:scale-[0.99] cursor-pointer group"
            title="Deslogar do App e voltar para a tela de login"
          >
            <LogOut size={18} className="text-red-600 group-hover:-translate-x-0.5 transition-transform" />
            <div className="text-left">
              <div className="text-xs sm:text-sm font-bold leading-tight text-red-700">
                Deslogar do App
              </div>
              <div className="text-[10px] font-normal text-red-500 leading-tight">
                Volta para a tela de login
              </div>
            </div>
          </button>
          <div className="text-center text-[10px] sm:text-[11px] text-slate-400 pt-0.5">
            AppChurch Mobile • Versão 332.0
          </div>
        </div>
      </aside>
    </>
  );
};
