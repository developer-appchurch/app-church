'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Loader2, PowerOff, X } from 'lucide-react';
import { AppChurchService } from '@/lib/supabase';
import { markStale } from '@/lib/queryCache';

export interface DeactivateCellResult {
  unlinkedMemberIds: string[];
  demotedLeaders: { id: string; name: string }[];
}

interface DeactivateCellModalProps {
  cellId: string;
  cellName: string;
  churchId: string;
  memberCount?: number;
  leaderNames?: string[];
  onClose: () => void;
  onDeactivated?: (result: DeactivateCellResult) => void;
}

/** Texto de sucesso padrão após desativar uma célula. */
export function deactivateSuccessMessage(cellName: string, result: DeactivateCellResult): string {
  const parts = [`${result.unlinkedMemberIds.length} membro(s) desvinculado(s)`];
  if (result.demotedLeaders.length > 0) {
    parts.push(`${result.demotedLeaders.map((l) => l.name).join(', ')} voltou(aram) a ser Membro`);
  }
  return `Célula "${cellName}" desativada: ${parts.join('; ')}.`;
}

/**
 * Alerta de confirmação para desativar uma célula (Setores e Células e Nossas Células).
 * Ao confirmar, chama a API, tira a célula das listas em cache e marca as demais telas como desatualizadas.
 */
export const DeactivateCellModal: React.FC<DeactivateCellModalProps> = ({
  cellId,
  cellName,
  churchId,
  memberCount,
  leaderNames,
  onClose,
  onDeactivated,
}) => {
  const queryClient = useQueryClient();
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setIsDeactivating(true);
    setError('');
    try {
      const result = await AppChurchService.deactivateCell(cellId, churchId);

      // A célula sai das listas em cache na hora
      const withoutCell = (old: any[] | undefined) =>
        old ? old.filter((c: any) => c.id !== cellId && c.unidadeId !== cellId) : old;
      queryClient.setQueryData(['church-cells', churchId], withoutCell);
      queryClient.setQueryData(['celulas-gallery', churchId], withoutCell);
      queryClient.setQueryData(['churchUnits', churchId], withoutCell);

      // As demais telas buscam os dados novos quando forem abertas
      markStale(
        queryClient,
        ['churchUnits', churchId],
        ['churchMembers', churchId],
        ['church-members', churchId],
        ['church-cells', churchId],
        ['church-structure', churchId],
        ['celulas-gallery', churchId],
        ['member-pool'],
        ['cell-members'],
        ['user-covered-cells']
      );

      onDeactivated?.(result);
    } catch (err: any) {
      console.error('Erro ao desativar célula:', err);
      setError(err?.message || 'Falha ao desativar a célula.');
      setIsDeactivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-red-700 text-white p-3.5 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <AlertTriangle size={19} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold">Desativar Célula</h3>
              <p className="text-[11px] text-red-100 mt-0.5 truncate">{cellName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeactivating}
            className="p-1.5 text-red-100 hover:text-white rounded-lg transition cursor-pointer"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3.5 sm:p-5 space-y-3">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs sm:text-sm text-slate-700">
            Tem certeza que deseja desativar a célula <strong>{cellName}</strong>?
          </p>

          <ul className="p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] sm:text-xs text-amber-900 space-y-1 list-disc pl-6 sm:pl-7">
            <li>
              {memberCount
                ? `Os ${memberCount} membro(s) serão desvinculados da célula`
                : 'Os membros serão desvinculados da célula'}{' '}
              (não são apagados e podem ser vinculados a outra célula pelo Pool de Membros).
            </li>
            <li>
              {leaderNames && leaderNames.length > 0
                ? `O vínculo de liderança de ${leaderNames.join(', ')} será encerrado`
                : 'O vínculo dos líderes será encerrado'}
              ; quem não lidera outra unidade volta a ter a função de Membro.
            </li>
            <li>Os relatórios e o histórico da célula são preservados.</li>
            <li>A célula some das listas. Só o Administrador do Sistema pode reativá-la.</li>
          </ul>
        </div>

        <div className="px-3.5 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeactivating}
            className="px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeactivating}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition cursor-pointer"
          >
            {isDeactivating ? <Loader2 size={15} className="animate-spin" /> : <PowerOff size={15} />}
            Desativar Célula
          </button>
        </div>
      </div>
    </div>
  );
};
