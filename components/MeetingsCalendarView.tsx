'use client';

import React, { useState } from 'react';
import { CellGroup } from '../types';
import { Calendar, Clock, MapPin, CheckCircle } from 'lucide-react';

interface MeetingsCalendarViewProps {
  currentCell: CellGroup;
}

export const MeetingsCalendarView: React.FC<MeetingsCalendarViewProps> = ({ currentCell }) => {
  const [scheduledMeetings] = useState([
    {
      id: 'm-1',
      title: `Reunião Semanal da Célula ${currentCell.name}`,
      date: `${currentCell.meetingDay}, Próxima semana`,
      time: currentCell.meetingTime,
      host: 'Casa do Davi Melo',
      address: currentCell.address,
      topic: 'Estudo: As Bem-Aventuranças e o Caráter do Discípulo',
      foodHost: 'Irmã Adriana (Lanche da comunhão)',
      confirmedCount: 14,
    },
    {
      id: 'm-2',
      title: 'Vigília e Oração dos Líderes do Setor',
      date: 'Sábado, 27/09',
      time: '22:00',
      host: 'Templo Central',
      address: 'Auditório de Líderes',
      topic: 'Clamor pelo Encontro com Deus e novas células',
      foodHost: 'Coordenação de Setor',
      confirmedCount: 28,
    },
    {
      id: 'm-3',
      title: 'Culto de Celebração de Domingo',
      date: 'Domingo, 28/09',
      time: '18:00',
      host: 'Templo Central',
      address: 'Auditório Principal',
      topic: 'Celebração com a Grande Família da Fé',
      foodHost: 'Cafeteria da Igreja',
      confirmedCount: 52,
    },
  ]);

  return (
    <div id="screen-meetings" className="bg-[#e9eff6] min-h-screen pb-20 font-sans select-none">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-5">
        {/* Banner */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                Agenda & Calendário
              </span>
              <span className="text-xs text-slate-500">Célula {currentCell.name}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#052447] mt-1">
              Próximos Encontros da Célula
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Horários, anfitriões e temas dos estudos bíblicos semanais.
            </p>
          </div>
        </div>

        {/* Meeting Cards */}
        <div className="space-y-4">
          {scheduledMeetings.map((meeting) => (
            <div
              key={meeting.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 transition hover:border-sky-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                <div>
                  <h3 className="text-base font-bold text-[#052447]">{meeting.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1.5">
                    <span className="flex items-center gap-1 font-semibold text-sky-900">
                      <Calendar size={14} className="text-sky-700" /> {meeting.date}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Clock size={14} className="text-slate-500" /> {meeting.time}
                    </span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <MapPin size={14} className="text-slate-500" /> {meeting.address}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1 self-start">
                  <CheckCircle size={13} className="text-emerald-600" /> {meeting.confirmedCount}{' '}
                  confirmados
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <span className="font-bold text-slate-500 block uppercase text-[10px]">
                    Tema do Estudo:
                  </span>
                  <span className="text-slate-800 font-medium">{meeting.topic}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block uppercase text-[10px]">
                    Anfitrião & Comunhão:
                  </span>
                  <span className="text-slate-800 font-medium">
                    {meeting.host} • {meeting.foodHost}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
