'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { CelulaCardItem } from '@/types';
import { getCellOptimizedImageUrl } from '@/lib/celulasService';
import { MapPin, Calendar, Clock, Users, ChevronRight } from 'lucide-react';

interface CelulaCardProps {
  celula: CelulaCardItem;
  onSelect?: (celula: CelulaCardItem) => void;
}

const CelulaCardComponent: React.FC<CelulaCardProps> = ({ celula, onSelect }) => {
  const imageUrl = getCellOptimizedImageUrl(celula.fotoUrl, celula.id || celula.nome, 600, 80);

  // Formata dia da semana e horário reais sem valores fictícios fixos
  const rawDay = celula.diaSemana && celula.diaSemana !== 'Dia a definir' ? celula.diaSemana : '';
  const shortDay = rawDay ? rawDay.replace(/-feira/i, '').trim() : '';
  const rawTime = celula.horario && celula.horario !== 'Horário a definir' ? celula.horario : '';
  const cleanTime = rawTime ? rawTime.replace(/^(\d{1,2}):(\d{2})$/, '$1h$2').trim() : '';

  const hasSchedule = Boolean(shortDay || cleanTime);

  return (
    <div
      onClick={() => onSelect?.(celula)}
      className="group relative flex flex-col bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-sky-300 transition-all duration-300 overflow-hidden cursor-pointer transform hover:-translate-y-0.5"
      role="article"
      aria-label={`Card da Célula ${celula.nome}`}
    >
      {/* Container Proporcional da Foto da Célula (Aspect 16:10) */}
      <div className="relative w-full aspect-[16/10] bg-slate-100 overflow-hidden shrink-0">
        <Image
          src={imageUrl}
          alt={`Foto da célula ${celula.nome}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          referrerPolicy="no-referrer"
          priority={false}
        />

        {/* Gradiente sutil para contraste dos badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        {/* Badge superior: Dia da semana & Horário */}
        {hasSchedule && (
          <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:px-2.5 sm:py-1 bg-white/95 backdrop-blur-md text-[#052447] text-[9.5px] sm:text-[11px] font-bold rounded-md sm:rounded-lg shadow-xs border border-white/40">
            {shortDay && (
              <>
                <Calendar size={11} className="text-sky-600 shrink-0 hidden xxs:inline" />
                <span>{shortDay}</span>
              </>
            )}
            {shortDay && cleanTime && <span className="text-slate-300">•</span>}
            {cleanTime && (
              <>
                <Clock size={10} className="text-slate-400 shrink-0" />
                <span>{cleanTime}</span>
              </>
            )}
          </div>
        )}

        {/* Badge superior direito: Contagem de Membros */}
        {celula.memberCount > 0 && (
          <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-slate-900/80 backdrop-blur-md text-white text-[9.5px] sm:text-[11px] font-semibold rounded-md sm:rounded-lg shadow-xs">
            <Users size={11} className="text-sky-300" />
            <span>{celula.memberCount}</span>
          </div>
        )}
      </div>

      {/* Conteúdo Abaixo da Foto */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Nome da Célula */}
          <h3 className="font-extrabold text-[13px] sm:text-base md:text-[17px] text-[#04213d] group-hover:text-sky-700 transition-colors line-clamp-1 leading-snug">
            {celula.nome}
          </h3>

          {/* Bairro da Célula */}
          <p className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-slate-500 mt-0.5 sm:mt-1 line-clamp-1">
            <MapPin size={11} className="text-rose-500 shrink-0" />
            <span className="truncate">{celula.bairro || 'Bairro Central'}</span>
            {celula.endereco && (
              <>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-[11px] font-normal text-slate-400 truncate max-w-[120px] hidden sm:inline">
                  {celula.endereco}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Rodapé do Card com CTA sutil */}
        <div className="mt-2.5 pt-2 sm:mt-3 sm:pt-2 flex items-center justify-between text-[10px] sm:text-xs font-bold text-sky-800 group-hover:text-sky-950 border-t border-slate-100">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 group-hover:text-sky-700 transition-colors truncate">
            Ver detalhes
          </span>
          <ChevronRight size={13} className="transform group-hover:translate-x-1 transition-transform text-sky-600 shrink-0" />
        </div>
      </div>
    </div>
  );
};

export const CelulaCard = memo(CelulaCardComponent);
