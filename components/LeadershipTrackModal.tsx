'use client';

import React, { useState } from 'react';
import { CellMember, LeadershipTrackProgress } from '../types';
import { LEADERSHIP_STAGES } from '../data/initialData';
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
} from 'lucide-react';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';

interface LeadershipTrackModalProps {
  member: CellMember | null;
  cellName: string;
  onClose: () => void;
  onSaveProgress?: (memberId: string, progress: LeadershipTrackProgress) => void;
}

export const LeadershipTrackModal: React.FC<LeadershipTrackModalProps> = ({
  member,
  cellName,
  onClose,
  onSaveProgress,
}) => {
  // Build initial track with state initializer
  const [track, setTrack] = useState<LeadershipTrackProgress>(() => ({
    memberId: member?.id || '',
    currentStepId: member?.role === 'Líder em Treinamento' ? 5 : 2,
    steps: LEADERSHIP_STAGES.map((stage) => {
      const isPast =
        member?.role === 'Líder em Treinamento'
          ? stage.id <= 4
          : member?.role === 'Líder de Setor' || member?.role === 'Líder de Célula'
          ? true
          : stage.id <= 1;
      return {
        id: stage.id,
        title: stage.title,
        description: stage.description,
        completed: isPast,
        completedAt: isPast ? '10/02/2024' : undefined,
      };
    }),
  }));

  const [activeTab, setActiveTab] = useState<'track' | 'notes'>('track');
  const [memberNotes, setMemberNotes] = useState(member?.notes || '');
  const [savedAlert, setSavedAlert] = useState(false);

  if (!member) return null;

  const toggleStep = (stepId: number) => {
    const updatedSteps = track.steps.map((s) => {
      if (s.id === stepId) {
        const nextCompleted = !s.completed;
        return {
          ...s,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toLocaleDateString('pt-BR') : undefined,
        };
      }
      return s;
    });

    const highestCompleted = updatedSteps.filter((s) => s.completed).map((s) => s.id);
    const nextCurrent =
      highestCompleted.length > 0 ? Math.min(Math.max(...highestCompleted) + 1, 6) : 1;

    setTrack({
      ...track,
      currentStepId: nextCurrent,
      steps: updatedSteps,
    });
  };

  const handleSave = () => {
    if (onSaveProgress) {
      onSaveProgress(member.id, track);
    }
    setSavedAlert(true);
    setTimeout(() => {
      setSavedAlert(false);
      onClose();
    }, 800);
  };

  const completedCount = track.steps.filter((s) => s.completed).length;
  const percentageCompleted = Math.round((completedCount / track.steps.length) * 100);

  return (
    <div
      id="leadership-track-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh] border border-slate-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with Dark Navy branding */}
        <div className="bg-[#052447] text-white p-4 sm:p-6 flex items-start justify-between relative shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 pr-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
              <LeadershipBadgeIcon className="w-6 h-6 sm:w-8 sm:h-8 text-sky-300" size={28} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded">
                  Trilho de Liderança
                </span>
                <span className="text-[11px] sm:text-xs text-slate-300 truncate">Célula {cellName}</span>
              </div>
              <h2 className="text-lg sm:text-2xl font-bold mt-1 text-white truncate">{member.name}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-200 mt-1">
                <span className="flex items-center gap-1 font-medium bg-white/10 px-2 py-0.5 rounded-full">
                  <User size={12} /> {member.role}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {member.neighborhood || 'Bairro não informado'}
                </span>
                {member.birthday && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> Níver: {member.birthday}
                  </span>
                )}
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
            <div className="text-xs font-semibold text-slate-600">Progresso Geral:</div>
            <div className="w-24 sm:w-44 bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-[#052447] h-full rounded-full transition-all duration-500"
                style={{ width: `${percentageCompleted}%` }}
              />
            </div>
            <span className="text-xs font-bold text-[#052447]">{percentageCompleted}%</span>
          </div>
          <div className="text-xs text-slate-500">
            <strong className="text-slate-700">{completedCount}</strong> de {track.steps.length}{' '}
            etapas
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white">
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'track' ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 mb-2 font-medium">
                Clique nas etapas para marcar como concluída e registrar o avanço espiritual do
                membro:
              </div>
              {track.steps.map((step, index) => {
                return (
                  <div
                    key={step.id}
                    onClick={() => toggleStep(step.id)}
                    className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition cursor-pointer select-none ${
                      step.completed
                        ? 'bg-emerald-50/70 border-emerald-200 text-slate-800 hover:bg-emerald-100/60'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      className="mt-0.5 text-emerald-600 focus:outline-none cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStep(step.id);
                      }}
                    >
                      {step.completed ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                      ) : (
                        <Circle className="w-6 h-6 text-slate-300 hover:text-slate-400" />
                      )}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4
                          className={`text-sm font-bold ${
                            step.completed ? 'text-emerald-950' : 'text-slate-800'
                          }`}
                        >
                          {step.title}
                        </h4>
                        {step.completed && step.completedAt && (
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check size={11} /> {step.completedAt}
                          </span>
                        )}
                        {!step.completed && index + 1 === track.currentStepId && (
                          <span className="text-[11px] font-semibold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                            Em Andamento
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Anotações de Discipulado e Cuidado Pastoral:
                </label>
                <textarea
                  value={memberNotes}
                  onChange={(e) => setMemberNotes(e.target.value)}
                  placeholder="Ex: Teve uma conversa importante sobre batismo; participou do jejum de 21 dias; orar pela família..."
                  rows={5}
                  className="w-full text-sm p-3 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800 text-slate-800"
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
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {savedAlert ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Check size={14} /> Progresso do membro salvo com sucesso!
              </span>
            ) : (
              'As alterações ficam salvas no Supabase da Célula.'
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-save-leadership-track"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              Salvar Trilho
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
