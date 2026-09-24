'use client';

import React from 'react';
import { Menu, RotateCw } from 'lucide-react';
import { UserProfile, CellGroup } from '../types';

interface HeaderProps {
  user: UserProfile;
  cells?: CellGroup[];
  selectedCellId?: string;
  onSelectCell?: (cellId: string) => void;
  onToggleSidebar: () => void;
  onRefreshData?: () => void;
  isRefreshing?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onToggleSidebar,
  onRefreshData,
  isRefreshing = false,
}) => {
  return (
    <header className="bg-[#04213d] text-white shadow-md sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left section: Hamburger + User Info */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
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

            <div className="flex flex-col min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate max-w-[220px] sm:max-w-none">
                {user.name}
              </h1>
              <div className="text-[10px] sm:text-xs text-sky-200/90 font-medium leading-snug truncate">
                <span className="truncate">{user.role}</span>
              </div>
            </div>
          </div>

          {/* Right section: Botão de Refresh / Sincronização direta com o Banco */}
          {onRefreshData && (
            <button
              id="btn-header-logout"
              type="button"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-200 hover:text-white bg-sky-500/20 hover:bg-sky-600/30 active:scale-95 border border-sky-400/30 transition-all cursor-pointer shadow-xs shrink-0 disabled:opacity-60"
              title="Atualizar dados diretamente do banco de dados"
            >
              <RotateCw size={15} className={isRefreshing ? 'animate-spin text-sky-300' : ''} />
              <span className="hidden sm:inline">
                {isRefreshing ? 'Atualizando...' : 'Atualizar Banco'}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
