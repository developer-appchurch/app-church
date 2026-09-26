'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CellMember, LeadershipTrackProgress, LeadershipTrackStep, UserProfile, Role } from '../types';
import { AppChurchService } from '../lib/supabase';
import {
  CheckCircle2,
  Circle,
  Clock,
  X,
  Calendar,
  MapPin,
  Award,
  User,
  Phone,
  Check,
  Building2,
  Loader2,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';

interface LeadershipTrackModalProps {
  member: CellMember | null;
  churchId?: string;
  churchName?: string;
  cellName: string;
  currentUser?: UserProfile | null;
  userHierarchyLevel?: number;
  validatorName?: string;
  onClose: () => void;
  onSaveProgress?: (memberId: string, progress: LeadershipTrackProgress) => void;
}

export const LeadershipTrackModal: React.FC<LeadershipTrackModalProps> = ({
  member,
  churchId,
  churchName,
  cellName,
  currentUser,
  userHierarchyLevel: propHierarchyLevel,
  validatorName,
  onClose,
  onSaveProgress,
}) => {
  const [track, setTrack] = useState<LeadershipTrackProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'track' | 'notes'>('track');
  const [memberNotes, setMemberNotes] = useState(member?.notes || '');
  const [savedAlert, setSavedAlert] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<number | string>>(new Set());
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);

  const toggleStepDetails = (stepId: number | string) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Carrega funções do banco para resolução dinâmica do nível hierárquico
  useEffect(() => {
    let isMounted = true;
    async function loadRoles() {
      try {
        const roles = await AppChurchService.getRoles();
        if (isMounted && roles && roles.length > 0) {
          setAvailableRoles(roles);
        }
      } catch (e) {
        console.warn('Erro ao carregar roles no LeadershipTrackModal:', e);
      }
    }
    loadRoles();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fechar modal com a tecla Escape (cancela etapas não salvas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Nível hierárquico do usuário logado
  const userHierarchyLevel = useMemo(() => {
    if (propHierarchyLevel !== undefined) {
      return propHierarchyLevel;
    }
    if (!currentUser) return 1;
    if (currentUser.isSystemAdmin || currentUser.role === 'Administrador' || currentUser.login === 'admin') {
      return 999;
    }

    if (availableRoles.length > 0) {
      const matched = availableRoles.find(
        (r) =>
          (currentUser.roleId && r.id === currentUser.roleId) ||
          r.name?.toLowerCase() === currentUser.role?.toLowerCase() ||
          r.slug?.toLowerCase() === currentUser.role?.toLowerCase() ||
          (currentUser.role &&
            (r.name?.toLowerCase().includes(currentUser.role.toLowerCase()) ||
              currentUser.role.toLowerCase().includes(r.name?.toLowerCase())))
      );
      if (matched) {
        return matched.hierarchyLevel;
      }
    }

    const roleLower = (currentUser.role || '').toLowerCase();
    if (roleLower.includes('pastor')) return 7;
    if (roleLower.includes('distrito')) return 6;
    if (roleLower.includes('rede')) return 5;
    if (roleLower.includes('área') || roleLower.includes('area')) return 4;
    if (roleLower.includes('setor')) return 3;
    if (roleLower.includes('célula') || roleLower.includes('celula')) return 2;
    if (roleLower.includes('treinamento') || roleLower.includes('discipulador')) return 2;
    return 1;
  }, [currentUser, propHierarchyLevel, availableRoles]);

  // Apenas níveis hierárquicos superiores a 1 têm permissão de concluir etapas e salvar
  const canEdit = userHierarchyLevel > 1;

  // Carrega as etapas vinculadas à igreja específica e o status real do membro
  useEffect(() => {
    if (!member) return;

    const memberId = member.id;
    const memberChurchId = member.churchId;
    const memberNotesVal = member.notes;

    let isMounted = true;

    async function loadMemberTrack() {
      try {
        const resolvedChurchId = memberChurchId || churchId;
        const progress = await AppChurchService.getLeadershipProgress(memberId, resolvedChurchId);
        if (isMounted) {
          if (progress) {
            setTrack(progress);
          }
          setMemberNotes(memberNotesVal || '');
        }
      } catch (err) {
        console.error('Erro ao carregar etapas do trilho do membro:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMemberTrack();

    return () => {
      isMounted = false;
    };
  }, [member, churchId]);

  if (!member) return null;

  const defaultValidator = validatorName || 'Líder Responsável';

  const toggleStep = (stepId: number | string) => {
    if (!track || !canEdit) return;

    const updatedSteps = track.steps.map((s) => {
      if (String(s.id) === String(stepId)) {
        const nextCompleted = !s.completed;
        return {
          ...s,
          completed: nextCompleted,
          completedAt: nextCompleted ? (s.completedAt || new Date().toLocaleDateString('pt-BR')) : undefined,
          validatedBy: nextCompleted ? (s.validatedBy?.trim() || defaultValidator) : undefined,
        };
      }
      return s;
    });

    const completedIndices = updatedSteps
      .map((s, idx) => (s.completed ? idx : -1))
      .filter((idx) => idx !== -1);

    const nextCurrent =
      completedIndices.length > 0
        ? Math.min(Math.max(...completedIndices) + 2, updatedSteps.length)
        : 1;

    setTrack({
      ...track,
      currentStepId: nextCurrent,
      steps: updatedSteps,
    });
  };

  const handleStepNoteChange = (stepId: number | string, noteText: string) => {
    if (!track || !canEdit) return;
    setTrack({
      ...track,
      steps: track.steps.map((s) =>
        String(s.id) === String(stepId) ? { ...s, notes: noteText } : s
      ),
    });
  };

  const handleStepValidatorChange = (stepId: number | string, valText: string) => {
    if (!track) return;
    setTrack({
      ...track,
      steps: track.steps.map((s) =>
        String(s.id) === String(stepId) ? { ...s, validatedBy: valText } : s
      ),
    });
  };

  const handleSave = async () => {
    if (!track || !member) return;

    setIsSaving(true);
    try {
      const resolvedChurchId = member.churchId || churchId;
      
      // Assegura que todas as etapas concluídas tenham o nome do validador na coluna validado_por
      const stepsWithValidation = track.steps.map((st) => ({
        ...st,
        validatedBy: st.completed ? (st.validatedBy?.trim() || defaultValidator) : undefined,
        completedAt: st.completed ? (st.completedAt || new Date().toLocaleDateString('pt-BR')) : undefined,
      }));

      const trackToSave: LeadershipTrackProgress = {
        ...track,
        steps: stepsWithValidation,
      };

      await AppChurchService.saveLeadershipProgress(
        member.id,
        trackToSave,
        resolvedChurchId,
        member.cellId
      );

      if (onSaveProgress) {
        onSaveProgress(member.id, trackToSave);
      }

      setSavedAlert(true);
      setTimeout(() => {
        setSavedAlert(false);
        onClose();
      }, 900);
    } catch (err) {
      console.error('Erro ao salvar progresso do trilho:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const completedCount = track?.steps.filter((s) => s.completed).length || 0;
  const totalCount = track?.steps.length || 0;
  const percentageCompleted = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      id="leadership-track-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none cursor-pointer"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 cursor-default"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Dark Navy branding */}
        <div className="bg-[#052447] text-white p-4 sm:p-6 flex items-start justify-between relative shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 pr-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
              <LeadershipBadgeIcon className="w-6 h-6 sm:w-8 sm:h-8 text-sky-300" size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{member.name}</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200 mt-1">
                <span className="flex items-center gap-1 font-medium bg-white/10 px-2.5 py-0.5 rounded-full">
                  <User size={12} /> {member.role}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0 ml-1"
            aria-label="Fechar modal"
          >
            <X size={22} />
          </button>
        </div>

        {/* Progress Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-xs font-semibold text-slate-600">Progresso no Trilho:</div>
            <div className="w-24 sm:w-44 bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-[#052447] h-full rounded-full transition-all duration-500"
                style={{ width: `${percentageCompleted}%` }}
              />
            </div>
            <span className="text-xs font-bold text-[#052447]">{percentageCompleted}%</span>
          </div>
          <div className="text-xs text-slate-500">
            <strong className="text-slate-700">{completedCount}</strong> de {totalCount} etapas concluídas
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('track')}
            className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'track'
                ? 'border-[#052447] text-[#052447]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Award size={16} /> Etapas do Trilho
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ml-6 cursor-pointer ${
              activeTab === 'notes'
                ? 'border-[#052447] text-[#052447]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={16} /> Discipulado & Observações
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#052447]" />
              <p className="text-sm font-medium text-slate-600">
                Carregando etapas do trilho da congregação...
              </p>
            </div>
          ) : activeTab === 'track' ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 mb-2 font-medium flex items-center justify-between">
                <span>
                  {canEdit
                    ? 'Etapas cadastradas para esta congregação. Clique na etapa para marcar a conclusão do membro:'
                    : 'Etapas cadastradas para esta congregação (Modo de visualização):'}
                </span>
              </div>

              {track?.steps.map((step, index) => {
                const isCurrent = !step.completed && index + 1 === track.currentStepId;
                const isExpanded = expandedStepIds.has(step.id);

                return (
                  <div
                    key={step.id}
                    className={`rounded-xl border transition select-none ${
                      step.completed
                        ? 'bg-emerald-50/70 border-emerald-200 text-slate-800'
                        : isCurrent
                        ? 'bg-sky-50/50 border-sky-200'
                        : 'bg-white border-slate-200'
                    } ${
                      canEdit
                        ? step.completed
                          ? 'hover:bg-emerald-100/60 cursor-pointer'
                          : isCurrent
                          ? 'hover:border-sky-300 cursor-pointer'
                          : 'hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <div
                      onClick={() => canEdit && toggleStep(step.id)}
                      className={`p-3.5 flex items-start gap-3.5 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {canEdit ? (
                        <button
                          type="button"
                          className="mt-0.5 text-emerald-600 focus:outline-none cursor-pointer shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStep(step.id);
                          }}
                          aria-label={step.completed ? 'Marcar como não concluída' : 'Marcar como concluída'}
                        >
                          {step.completed ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 hover:text-slate-400" />
                          )}
                        </button>
                      ) : (
                        <div className="mt-0.5 shrink-0">
                          {step.completed ? (
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300" />
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h4
                            className={`text-sm font-bold ${
                              step.completed ? 'text-emerald-950' : 'text-slate-800'
                            }`}
                          >
                            {step.title}
                          </h4>

                          <div className="flex items-center gap-2">
                            {step.completed && (
                              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Check size={11} /> Concluída{step.completedAt ? ` em ${step.completedAt}` : ''}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[11px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                                Em Andamento
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStepDetails(step.id);
                              }}
                              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
                                isExpanded
                                  ? 'bg-sky-100 text-[#052447] border-sky-300 shadow-2xs'
                                  : 'bg-white hover:bg-sky-50 text-slate-500 hover:text-[#052447] border-slate-200'
                              }`}
                              title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                              aria-label={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                            >
                              {isExpanded ? (
                                <EyeOff size={14} className="shrink-0 text-sky-800" />
                              ) : (
                                <Eye size={14} className="shrink-0 text-slate-600" />
                              )}
                              <span className="text-[11px] hidden sm:inline">
                                {isExpanded ? 'Ocultar' : 'Ver detalhes'}
                              </span>
                              {Boolean(step.notes) && !isExpanded && (
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-600 shrink-0" title="Possui observações" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Componentes de detalhes (ocultos por padrão, visíveis ao clicar no ícone de ver detalhes) */}
                        {isExpanded && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 space-y-2 animate-in fade-in duration-150">
                            {step.description && (
                              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/70">
                                {step.description}
                              </p>
                            )}

                            {step.validatedBy && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <span>Validado por:</span>
                                <span className="text-slate-700 font-semibold">{step.validatedBy}</span>
                              </div>
                            )}

                            <div className="pt-0.5">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Observações desta etapa:
                              </label>
                              <input
                                type="text"
                                value={step.notes || ''}
                                readOnly={!canEdit}
                                disabled={!canEdit}
                                onChange={(e) => handleStepNoteChange(step.id, e.target.value)}
                                placeholder={
                                  canEdit
                                    ? 'Ex: Concluiu com louvor, batizado pelo Pr. Paulo...'
                                    : 'Nenhuma observação informada.'
                                }
                                className={`w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none text-slate-800 ${
                                  canEdit ? 'bg-white focus:border-sky-800 focus:ring-1 focus:ring-sky-800' : 'bg-slate-100 cursor-default'
                                }`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Anotações Gerais de Discipulado e Acompanhamento:
                </label>
                <textarea
                  value={memberNotes}
                  readOnly={!canEdit}
                  disabled={!canEdit}
                  onChange={(e) => setMemberNotes(e.target.value)}
                  placeholder={canEdit ? 'Ex: Teve uma conversa importante sobre batismo; participou do jejum de 21 dias; orar pela família...' : 'Nenhuma anotação de discipulado registrada.'}
                  rows={5}
                  className={`w-full text-sm p-3 rounded-xl border border-slate-300 focus:outline-none text-slate-800 ${
                    canEdit ? 'bg-white focus:border-sky-800 focus:ring-1 focus:ring-sky-800' : 'bg-slate-100 cursor-default'
                  }`}
                />
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                <div className="font-semibold text-slate-700 flex items-center gap-1">
                  <Phone size={14} className="text-[#052447]" /> Contato Rápido:
                </div>
                <div className="flex items-center justify-between">
                  <span>Telefone / WhatsApp:</span>
                  <span className="font-mono text-slate-900 font-medium">
                    {member.phone || '(88) 99800-0000'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Frequência Média Registrada:</span>
                  <span className="font-bold text-slate-900">{member.attendancePercentage}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Congregação / Igreja:</span>
                  <span className="font-medium text-slate-900">{churchName || 'Igreja Local'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {savedAlert && (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Check size={14} /> Progresso gravado com sucesso!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              {canEdit ? 'Cancelar' : 'Fechar'}
            </button>
            {canEdit && (
              <button
                id="btn-save-leadership-track"
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="px-5 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Salvando...
                  </>
                ) : (
                  'Salvar Trilho'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
