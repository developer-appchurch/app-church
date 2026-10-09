'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Power, PowerOff, X } from 'lucide-react';
import type { InactiveCell, UserProfile } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { AppChurchService } from '@/lib/supabase';
import { markStale } from '@/lib/queryCache';

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const d = value.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};

/** Aba "Células Desativadas" em Configurações da Igreja (somente Administrador do Sistema). */
export const InactiveCellsTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const queryClient = useQueryClient();
  const [cells, setCells] = useState<InactiveCell[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmCell, setConfirmCell] = useState<InactiveCell | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let mounted = true;
    AppChurchService.getInactiveCells(churchId)
      .then((data) => mounted && setCells(data))
      .catch((err) => mounted && showToast('error', err?.message || 'Falha ao carregar as células desativadas.'))
      .finally(() => mounted && setIsLoading(false));
    return () => {
      mounted = false;
    };
  }, [churchId, showToast]);

  const handleReactivate = async () => {
    if (!confirmCell) return;
    const cell = confirmCell;
    setBusyId(cell.id);
    try {
      await AppChurchService.reactivateCell(cell.id, churchId);
      setCells((prev) => prev.filter((c) => c.id !== cell.id));
      markStale(
        queryClient,
        ['churchUnits', churchId],
        ['church-cells', churchId],
        ['church-structure', churchId],
        ['celulas-gallery', churchId],
        ['user-covered-cells']
      );
      showToast('success', `Célula "${cell.name}" reativada. Vincule os líderes e membros em Setores e Células.`);
      setConfirmCell(null);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao reativar a célula.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-5 space-y-3">
      <div>
        <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
          <PowerOff size={16} className="text-red-600" />
          Células Desativadas
        </h2>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
          Os relatórios e o histórico continuam guardados. Ao reativar, a célula volta sem membros e sem líderes.
        </p>
      </div>

      {toast && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{toast.message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : cells.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Nenhuma célula desativada.</p>
      ) : (
        <div className="space-y-2">
          {cells.map((cell) => (
            <div
              key={cell.id}
              className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{cell.name}</p>
                <p className="text-[10px] sm:text-[11px] text-slate-500 leading-snug">
                  {cell.parentName ? `Setor: ${cell.parentName}` : 'Sem setor'}
                  {!cell.parentActive && <span className="text-red-600 font-semibold"> (desativado)</span>}
                  {' · '}Desativada em {formatDate(cell.deactivatedAt)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug">
                  {cell.reportCount} relatório(s)
                  {cell.lastReportDate ? ` · último em ${formatDate(cell.lastReportDate)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmCell(cell)}
                disabled={busyId === cell.id}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] sm:text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="Reativar esta célula"
              >
                <Power size={13} />
                <span className="hidden sm:inline">Reativar</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmação de reativação */}
      {confirmCell && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#04213d] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Power size={16} className="text-emerald-300" />
                Reativar Célula
              </h3>
              <button
                type="button"
                onClick={() => setConfirmCell(null)}
                className="p-1 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                aria-label="Fechar"
              >
                <X size={17} />
              </button>
            </div>
            <div className="p-4 space-y-2 text-xs sm:text-sm text-slate-700">
              <p>
                Reativar a célula <strong>{confirmCell.name}</strong>?
              </p>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Ela volta sem membros e sem líderes. Depois de reativar, vincule os líderes em Setores e Células e os
                membros pelo Pool de Membros.
              </p>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCell(null)}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReactivate}
                disabled={busyId === confirmCell.id}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {busyId === confirmCell.id && <Loader2 size={14} className="animate-spin" />}
                Reativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
