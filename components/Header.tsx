'use client';

import React from 'react';
import { Menu, RotateCw } from 'lucide-react';
import { UserProfile, CellGroup } from '../types';
import { AppChurchLogo } from './AppChurchLogo';

interface HeaderProps {
  user: UserProfile;
  cells?: CellGroup[];
  selectedCellId?: string;
  onSelectCell?: (cellId: string) => void;
  onToggleSidebar: () => void;
  /** Desktop com menu fixo: o botão de menu some (o menu já está visível). */
  hideMenuButton?: boolean;
  /** Desktop com menu fixo: o cabeçalho começa depois do menu (18rem) e o conteúdo é posicionado pela tela inteira. */
  pinned?: boolean;
  /** Desktop: logo do AppChurch centralizada na barra (no celular/tablet ela fica no menu lateral). */
  showCenterLogo?: boolean;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onToggleSidebar,
  hideMenuButton = false,
  pinned = false,
  showCenterLogo = false,
  onRefreshData,
  isRefreshing = false,
}) => {
  return (
    <header className="bg-[#04213d] text-white shadow-md sticky top-0 z-30 select-none">
      <div className={`${showCenterLogo ? '' : 'max-w-7xl mx-auto px-3 sm:px-6 '}py-3 relative`}>
        {/* Desktop: botão de menu fixo no canto esquerdo (só aparece com o menu recolhido) */}
        {showCenterLogo && !hideMenuButton && (
          <button
            id="btn-sidebar-toggle"
            type="button"
            onClick={onToggleSidebar}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none cursor-pointer"
            aria-label="Abrir Menu Lateral"
            title="Menu Principal"
          >
            <Menu size={26} className="stroke-[2.2]" />
          </button>
        )}
        <div
          className={`relative flex items-center justify-between gap-2 sm:gap-4 ${showCenterLogo ? '' : ''}`}
          style={
            showCenterLogo
              ? {
                  // Bloco centralizado na tela inteira (não no espaço ao lado do menu): não se move ao abrir/fechar o menu.
                  width: 'min(850px, calc(100vw - 36rem))',
                  marginLeft: 'calc((100vw - min(850px, calc(100vw - 36rem))) / 2)',
                }
              : undefined
          }
        >
          {showCenterLogo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
              <AppChurchLogo variant="light" className="h-8 w-24" />
            </div>
          )}
          {/* Left section: Hamburger + User Info */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {!hideMenuButton && !showCenterLogo && (
              <button
                id="btn-sidebar-toggle"
                type="button"
                onClick={onToggleSidebar}
                className="p-1.5 sm:p-2 text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none cursor-pointer shrink-0"
                aria-label="Abrir Menu Lateral"
                title="Menu Principal"
              >
                <Menu size={26} className="stroke-[2.2]" />
              </button>
            )}

            <div
              className="flex flex-col min-w-0"
              style={showCenterLogo ? { transform: 'translateX(calc(-1 * clamp(0px, calc((100vw - 1280px) / 2), 5rem)))' } : undefined}
            >
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate max-w-[220px] sm:max-w-none">
                {user.name}
              </h1>
              <div className="text-[10px] sm:text-xs text-sky-200/90 font-medium leading-snug truncate">
                <span className="truncate">{user.role}</span>
              </div>
            </div>
          </div>

          {/* Botão de recarregar (só no desktop; no celular, puxar a tela para baixo faz o mesmo) */}
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg text-sky-200 hover:text-white bg-sky-500/20 hover:bg-sky-600/30 active:scale-95 border border-sky-400/30 transition-all cursor-pointer shadow-xs shrink-0 disabled:opacity-60"
              title="Recarregar os dados desta tela"
              aria-label="Recarregar os dados desta tela"
            >
              <RotateCw size={16} className={isRefreshing ? 'animate-spin text-sky-300' : ''} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
