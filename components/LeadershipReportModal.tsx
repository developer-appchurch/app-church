'use client';

import React, { useState, useMemo } from 'react';
import { CellMember, CellGroup, TrackStep, UserProfile } from '../types';
import { generateLeadershipTrackPDF, LeadershipReportRow } from '../lib/reportPdfService';
import {
  FileText,
  X,
  Download,
  CheckCircle2,
  Clock,
  Filter,
  Users,
  Award,
  Loader2,
  Eye,
} from 'lucide-react';

interface LeadershipReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredMembers: CellMember[];
  levelMembers: CellMember[];
  stages: TrackStep[];
  cells: CellGroup[];
  currentCellName: string;
  selectedSectorFilter: string;
  selectedStageFilter: string;
  selectedStatusFilter: 'all' | 'completed' | 'pending';
  currentUser?: UserProfile | null;
  isStepCompleted: (member: CellMember, stepId: string | number, stepNumber?: number) => boolean;
  getStepCompletedDate: (member: CellMember, stepId: string | number) => string | undefined;
}

export const LeadershipReportModal: React.FC<LeadershipReportModalProps> = ({
  isOpen,
  onClose,
  filteredMembers,
  levelMembers,
  stages,
  cells,
  currentCellName,
  selectedSectorFilter,
  selectedStageFilter,
  selectedStatusFilter,
  currentUser,
  isStepCompleted,
  getStepCompletedDate,
}) => {
  // Configurações do relatório (inicializadas com o contexto atual da tela)
  const [memberScope, setMemberScope] = useState<'filtered' | 'all'>('filtered');
  const [stageMode, setStageMode] = useState<string>(
    selectedStageFilter !== 'all' ? selectedStageFilter : 'all_detailed'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>(
    selectedStatusFilter
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // Mapeia células por ID para busca rápida do nome
  const cellMap = useMemo(() => {
    const map = new Map<string, string>();
    cells.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [cells]);

  // Lista base de membros selecionada
  const baseMembers = memberScope === 'filtered' ? filteredMembers : levelMembers;

  // Monta as linhas do relatório baseado nas opções
  const reportRows = useMemo<LeadershipReportRow[]>(() => {
    const rows: LeadershipReportRow[] = [];
    const totalStagesCount = stages.length || 6;

    baseMembers.forEach((member) => {
      const cellName =
        (member.cellId && cellMap.get(member.cellId)) ||
        member.cellName ||
        currentCellName ||
        'Não informada';

      if (stageMode === 'all_detailed') {
        // Modo Detalhado: 1 linha por etapa para cada membro
        stages.forEach((st) => {
          const done = isStepCompleted(member, st.id, st.stepNumber);
          const statusText: 'Concluído' | 'Pendente' = done ? 'Concluído' : 'Pendente';
          const completedAt = done ? getStepCompletedDate(member, st.id) : undefined;

          // Aplica filtro de status se houver
          if (statusFilter === 'completed' && !done) return;
          if (statusFilter === 'pending' && done) return;

          rows.push({
            memberName: member.name,
            cellName,
            stageName: `Etapa ${st.stepNumber}: ${st.title}`,
            status: statusText,
            completedAt,
          });
        });
      } else if (stageMode === 'summary') {
        // Modo Resumo: 1 linha por membro indicando o status geral e etapa atual
        const completedCount = stages.filter((st) =>
          isStepCompleted(member, st.id, st.stepNumber)
        ).length;
        const isAllDone = completedCount === totalStagesCount;

        // Próxima etapa pendente ou concluída
        const nextPending = stages.find(
          (st) => !isStepCompleted(member, st.id, st.stepNumber)
        );

        const statusText: 'Concluído' | 'Pendente' = isAllDone ? 'Concluído' : 'Pendente';

        if (statusFilter === 'completed' && !isAllDone) return;
        if (statusFilter === 'pending' && isAllDone) return;

        const stageTitle = isAllDone
          ? `Trilho Completo (${completedCount}/${totalStagesCount})`
          : nextPending
          ? `Etapa ${nextPending.stepNumber}: ${nextPending.title}`
          : `Em andamento (${completedCount}/${totalStagesCount})`;

        rows.push({
          memberName: member.name,
          cellName,
          stageName: stageTitle,
          status: statusText,
        });
      } else {
        // Etapa específica selecionada
        const targetStage = stages.find((st) => String(st.id) === stageMode);
        if (targetStage) {
          const done = isStepCompleted(member, targetStage.id, targetStage.stepNumber);
          const statusText: 'Concluído' | 'Pendente' = done ? 'Concluído' : 'Pendente';
          const completedAt = done ? getStepCompletedDate(member, targetStage.id) : undefined;

          if (statusFilter === 'completed' && !done) return;
          if (statusFilter === 'pending' && done) return;

          rows.push({
            memberName: member.name,
            cellName,
            stageName: `Etapa ${targetStage.stepNumber}: ${targetStage.title}`,
            status: statusText,
            completedAt,
          });
        }
      }
    });

    return rows;
  }, [
    baseMembers,
    cellMap,
    currentCellName,
    stageMode,
    stages,
    isStepCompleted,
    getStepCompletedDate,
    statusFilter,
  ]);

  const completedCount = reportRows.filter((r) => r.status === 'Concluído').length;
  const pendingCount = reportRows.filter((r) => r.status === 'Pendente').length;

  const handleDownloadPDF = () => {
    try {
      setIsGenerating(true);

      let stageLabel = 'Todas as Etapas (Detalhado)';
      if (stageMode === 'summary') {
        stageLabel = 'Resumo da Etapa Atual';
      } else {
        const found = stages.find((st) => String(st.id) === stageMode);
        if (found) {
          stageLabel = `Etapa ${found.stepNumber}: ${found.title}`;
        }
      }

      const statusLabel =
        statusFilter === 'completed'
          ? 'Concluídos'
          : statusFilter === 'pending'
          ? 'Pendentes'
          : 'Todos (Concluídos e Pendentes)';

      generateLeadershipTrackPDF({
        churchName: currentUser?.churchName || 'AppChurch',
        generatedBy: currentUser?.name,
        filterContext: {
          cell: currentCellName,
          sector: selectedSectorFilter !== 'todos' ? selectedSectorFilter : undefined,
          stage: stageLabel,
          status: statusLabel,
        },
        rows: reportRows,
      });

      // Fecha modal após o download
      setTimeout(() => {
        setIsGenerating(false);
        onClose();
      }, 600);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      setIsGenerating(false);
      alert('Não foi possível gerar o arquivo PDF. Por favor, tente novamente.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Modal */}
        <div className="bg-[#052447] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-sky-300 shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold truncate">
                Gerar Relatório (PDF)
              </h3>
              <p className="text-xs text-sky-200/80 truncate">
                Trilho de Liderança • Nome, Célula, Etapa e Status
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 ml-2"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com Configurações e Prévia */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Opção 1: Escopo dos Membros */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Users size={13} className="text-sky-800" />
              <span>Membros a Incluir</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMemberScope('filtered')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  memberScope === 'filtered'
                    ? 'bg-sky-50 border-sky-600 text-sky-950 ring-1 ring-sky-600 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Filtrados na Tela</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold">
                    {filteredMembers.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 font-normal">
                  Respeita busca e filtros ativos
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMemberScope('all')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  memberScope === 'all'
                    ? 'bg-sky-50 border-sky-600 text-sky-950 ring-1 ring-sky-600 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Todos do Nível</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold">
                    {levelMembers.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 font-normal">
                  Todos os discípulos disponíveis
                </p>
              </button>
            </div>
          </div>

          {/* Opção 2: Etapas do Trilho */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Award size={13} className="text-sky-800" />
              <span>Etapas no Relatório</span>
            </label>
            <select
              value={stageMode}
              onChange={(e) => setStageMode(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-800 cursor-pointer"
            >
              <option value="all_detailed">
                📋 Todas as Etapas Detalhadas (1 linha por etapa de cada membro)
              </option>
              <option value="summary">
                🎯 Etapa Atual / Resumo Consolidado (1 linha por membro)
              </option>
              <optgroup label="Filtrar por Etapa Específica:">
                {stages.map((st, idx) => (
                  <option key={st.id} value={String(st.id)}>
                    Etapa {st.stepNumber || idx + 1}: {st.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Opção 3: Filtro de Status */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Filter size={13} className="text-sky-800" />
              <span>Status da Etapa</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer font-bold ${
                  statusFilter === 'all'
                    ? 'bg-[#052447] text-white border-[#052447]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer font-bold flex items-center justify-center gap-1 ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 size={13} />
                <span>Concluídos</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer font-bold flex items-center justify-center gap-1 ${
                  statusFilter === 'pending'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <Clock size={13} />
                <span>Pendentes</span>
              </button>
            </div>
          </div>

          {/* Resumo do Relatório a Gerar */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5">
                <Eye size={14} className="text-sky-800" />
                <span>Resumo do Arquivo PDF</span>
              </span>
              <span className="px-2 py-0.5 bg-sky-100 text-sky-900 rounded-md text-[11px]">
                {reportRows.length} {reportRows.length === 1 ? 'linha' : 'linhas'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/80 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                <CheckCircle2 size={12} />
                {completedCount} Concluídos
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded">
                <Clock size={12} />
                {pendingCount} Pendentes
              </span>
            </div>

            {/* Amostra rápida das colunas */}
            {reportRows.length > 0 ? (
              <div className="mt-2 pt-2 border-t border-slate-200/70 text-[10px] space-y-1">
                <p className="font-bold text-slate-500 uppercase tracking-wider">
                  Colunas incluídas no PDF:
                </p>
                <div className="bg-white rounded-lg p-2 border border-slate-200 text-slate-600 font-mono text-[10px] space-y-1 overflow-x-auto">
                  <div className="font-bold text-slate-800 border-b pb-1 flex justify-between">
                    <span>1. Nome do Membro</span>
                    <span>2. Célula</span>
                    <span>3. Etapa</span>
                    <span>4. Status</span>
                  </div>
                  {reportRows.slice(0, 2).map((r, i) => (
                    <div key={i} className="flex justify-between text-slate-700 py-0.5">
                      <span className="truncate max-w-[100px]">{r.memberName}</span>
                      <span className="truncate max-w-[80px]">{r.cellName}</span>
                      <span className="truncate max-w-[120px]">{r.stageName}</span>
                      <span
                        className={`font-bold ${
                          r.status === 'Concluído' ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                  {reportRows.length > 2 && (
                    <div className="text-slate-400 italic text-center pt-0.5">
                      ... e mais {reportRows.length - 2} registros
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-amber-700 text-[11px] font-medium pt-1">
                Nenhum registro coincide com as opções selecionadas.
              </p>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={reportRows.length === 0 || isGenerating}
            onClick={handleDownloadPDF}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer ${
              reportRows.length > 0 && !isGenerating
                ? 'bg-[#052447] hover:bg-[#073366] text-white active:scale-95'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : (
              <>
                <Download size={15} />
                <span>Baixar Relatório (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
