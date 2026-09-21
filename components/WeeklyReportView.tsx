'use client';

import React, { useState } from 'react';
import { CellGroup, CellMember } from '../types';
import { FileText, Check, Users, Send } from 'lucide-react';

interface WeeklyReportViewProps {
  currentCell: CellGroup;
  members: CellMember[];
}

export const WeeklyReportView: React.FC<WeeklyReportViewProps> = ({ currentCell, members }) => {
  const cellMembers = members.filter((m) => m.cellId === currentCell.id);
  const [presentMemberIds, setPresentMemberIds] = useState<string[]>(
    cellMembers
      .filter((m) => m.attendanceStatus === 'green' || m.attendanceStatus === 'yellow')
      .map((m) => m.id)
  );
  const [visitorsCount, setVisitorsCount] = useState('2');
  const [offeringAmount, setOfferingAmount] = useState('75,00');
  const [studyTopic, setStudyTopic] = useState('O Poder da Oração Eficaz e Comunhão (Tiago 5:16)');
  const [prayerRequests, setPrayerRequests] = useState(
    'Cura da mãe do Caio e emprego para novo visitante.'
  );
  const [isSubmitted, setIsSubmitted] = useState(false);

  const togglePresence = (id: string) => {
    setPresentMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
    }, 3500);
  };

  return (
    <div id="screen-reports" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-5">
        {/* Banner */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#052447] text-white flex items-center justify-center shrink-0">
              <FileText size={22} className="text-sky-300" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                Secretaria da Célula
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#052447] mt-1">
                Relatório Semanal de Célula
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Célula <strong>{currentCell.name}</strong> • Setor {currentCell.sectorName}
              </p>
            </div>
          </div>
        </div>

        {isSubmitted && (
          <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl mb-4 flex items-center gap-3 text-emerald-900 animate-in fade-in">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <Check size={18} />
            </div>
            <div>
              <div className="text-sm font-bold">Relatório enviado com sucesso!</div>
              <div className="text-xs text-emerald-700">
                Os dados foram sincronizados para o banco do Supabase e coordenação pastoral.
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Member Roll Call Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#052447] flex items-center gap-2">
                  <Users size={16} className="text-sky-700" /> Chamada dos Membros
                </h3>
                <p className="text-xs text-slate-400">Marque quem esteve presente nesta semana:</p>
              </div>
              <span className="text-xs font-bold text-sky-900 bg-sky-50 px-3 py-1 rounded-full border border-sky-200">
                {presentMemberIds.length} de {cellMembers.length} presentes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cellMembers.map((member) => {
                const isPresent = presentMemberIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => togglePresence(member.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold text-left transition cursor-pointer ${
                      isPresent
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isPresent ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      <span className="truncate">{member.name}</span>
                    </div>
                    {isPresent && <Check size={14} className="text-emerald-700 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numerical & Textual Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Quantidade de Visitantes / Novos:
              </label>
              <input
                type="number"
                min="0"
                value={visitorsCount}
                onChange={(e) => setVisitorsCount(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Oferta da Célula (R$):
              </label>
              <input
                type="text"
                value={offeringAmount}
                onChange={(e) => setOfferingAmount(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Palavra / Estudo Ministrado:
              </label>
              <input
                type="text"
                value={studyTopic}
                onChange={(e) => setStudyTopic(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivos de Oração & Observações da Célula:
              </label>
              <textarea
                rows={3}
                value={prayerRequests}
                onChange={(e) => setPrayerRequests(e.target.value)}
                className="w-full text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
              />
            </div>
          </div>

          {/* Submit button */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 bg-[#052447] hover:bg-[#073366] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <Send size={16} />
              Enviar Relatório Semanal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
