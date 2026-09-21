'use client';

import React from 'react';
import { CellMember, CellGroup } from '../types';
import { LEADERSHIP_STAGES } from '../data/initialData';
import { ChevronRight } from 'lucide-react';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';

interface LeadershipOverviewViewProps {
  members: CellMember[];
  currentCell: CellGroup;
  onOpenMemberTrack: (member: CellMember) => void;
}

export const LeadershipOverviewView: React.FC<LeadershipOverviewViewProps> = ({
  members,
  currentCell,
  onOpenMemberTrack,
}) => {
  const cellMembers = members.filter((m) => m.cellId === currentCell.id);

  return (
    <div id="screen-leadership-track" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-5">
        {/* Banner */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#052447] flex items-center justify-center text-white shrink-0">
              <LeadershipBadgeIcon className="w-8 h-8 text-sky-300" size={30} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                Discipulado & Formação
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#052447] mt-1">
                Trilho de Liderança • Célula {currentCell.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhe o crescimento e amadurecimento espiritual de cada discípulo da célula.
              </p>
            </div>
          </div>
        </div>

        {/* Steps Grid */}
        <div className="space-y-4">
          {LEADERSHIP_STAGES.map((stage, idx) => {
            return (
              <div
                key={stage.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
              >
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#052447] font-bold text-sm flex items-center justify-center border border-sky-100 shrink-0">
                      {stage.id}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#052447]">{stage.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      Etapa {idx + 1} de {LEADERSHIP_STAGES.length}
                    </span>
                  </div>
                </div>

                {/* Sample disciples at this stage */}
                <div className="p-4 bg-slate-50/50">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Membros Acompanhados nesta etapa:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cellMembers.slice(idx * 2, idx * 2 + 3).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onOpenMemberTrack(m)}
                        className="inline-flex items-center gap-2 bg-white hover:bg-sky-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 transition group cursor-pointer shadow-2xs"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            m.attendanceStatus === 'green'
                              ? 'bg-emerald-500'
                              : m.attendanceStatus === 'yellow'
                              ? 'bg-amber-400'
                              : m.attendanceStatus === 'red'
                              ? 'bg-rose-500'
                              : 'bg-slate-900'
                          }`}
                        />
                        <span>{m.name}</span>
                        <ChevronRight
                          size={13}
                          className="text-slate-400 group-hover:text-sky-700"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
