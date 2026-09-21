'use client';

import React, { useState } from 'react';
import { Menu, RotateCw, ChevronDown, Check } from 'lucide-react';
import { UserProfile, CellGroup } from '../types';

interface HeaderProps {
  user: UserProfile;
  cells: CellGroup[];
  selectedCellId: string;
  onSelectCell: (cellId: string) => void;
  onToggleSidebar: () => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  cells,
  selectedCellId,
  onSelectCell,
  onToggleSidebar,
  onRefreshData,
  isRefreshing = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const currentCell = cells.find((c) => c.id === selectedCellId) || cells[0];

  return (
    <header className="bg-[#04213d] text-white shadow-md sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left section: Hamburger + User Info matching user's screenshot */}
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
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white leading-tight truncate max-w-[125px] xs:max-w-[180px] sm:max-w-none">
                {user.name}
              </h1>
              <div className="text-[10px] sm:text-xs text-sky-200/90 font-medium leading-snug truncate">
                <span className="truncate">{user.role}</span>
                <span className="block text-sky-300 font-semibold truncate">{user.sector}</span>
              </div>
            </div>
          </div>

          {/* Right section: Selecione a Célula dropdown + Refresh button */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[11px] sm:text-xs text-sky-200 font-medium hidden xs:inline-block pr-1 mb-0.5">
                Selecione a Célula
              </span>

              {/* Dropdown container */}
              <div className="relative">
                <button
                  id="btn-select-cell"
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="bg-white text-slate-900 px-2.5 sm:px-3 py-1.5 rounded text-xs sm:text-sm font-semibold flex items-center justify-between gap-1.5 sm:gap-3 shadow-xs hover:bg-slate-50 transition border border-slate-300 min-w-[100px] max-w-[140px] sm:min-w-[150px] sm:max-w-none cursor-pointer"
                >
                  <span className="truncate">{currentCell?.name || 'Selecione'}</span>
                  <ChevronDown size={16} className="text-slate-500 shrink-0" />
                </button>

                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-56 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                        <span>Células ({user.churchName})</span>
                      </div>
                      {cells.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">
                          Nenhuma célula cadastrada nesta igreja.
                        </div>
                      ) : (
                        cells.map((cell) => {
                          const isSelected = cell.id === selectedCellId;
                          return (
                            <button
                              key={cell.id}
                              type="button"
                              onClick={() => {
                                onSelectCell(cell.id);
                                setDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between hover:bg-sky-50 transition cursor-pointer ${
                                isSelected ? 'bg-sky-50 text-[#04213d] font-bold' : 'text-slate-700'
                              }`}
                            >
                              <div>
                                <div className="font-semibold">{cell.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  {cell.sectorName} • Líder: {cell.leaderName}
                                </div>
                              </div>
                              {isSelected && <Check size={16} className="text-sky-700" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Circular Refresh Arrow Button */}
            <button
              id="btn-header-refresh"
              type="button"
              onClick={onRefreshData}
              disabled={isRefreshing}
              className="p-2 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95 ml-1 cursor-pointer"
              title="Sincronizar dados do Supabase"
              aria-label="Atualizar"
            >
              <RotateCw
                size={26}
                className={`stroke-[2.2] transition-transform ${
                  isRefreshing ? 'animate-spin text-sky-300' : 'hover:rotate-45'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
