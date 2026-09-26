'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { CelulaCardItem } from '@/types';
import { getCellOptimizedImageUrl } from '@/lib/celulasService';
import { MapPin, Calendar, Clock, Users, ChevronRight, UserCheck } from 'lucide-react';

interface CelulaCardProps {
  celula: CelulaCardItem;
  onSelect?: (celula: CelulaCardItem) => void;
}

const CelulaCardComponent: React.FC<CelulaCardProps> = ({ celula, onSelect }) => {
  const imageUrl = getCellOptimizedImageUrl(celula.fotoUrl, celula.id || celula.nome, 600, 80);

  // Formata dia da semana limpo (ex: "Quinta" em vez de "Quinta-feira")
  const shortDay = (celula.diaSemana || 'Sexta').replace(/-feira/i, '').trim();
  const cleanTime = (celula.horario || '19:30').replace(/^(\d{1,2}):(\d{2})$/, '$1h$2').trim();

  // Formata líderes
  const leaderDisplay =
    celula.leaderNames.length === 1
      ? celula.leaderNames[0]
      : celula.leaderNames.length === 2
      ? `${celula.leaderNames[0]} e ${celula.leaderNames[1]}`
      : celula.leaderNames.length > 2
      ? `${celula.leaderNames.slice(0, -1).join(', ')} e ${celula.leaderNames[celula.leaderNames.length - 1]}`
      : 'Liderança local';

  return (
    <div
      onClick={() => onSelect?.(celula)}
      className="group relative flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-sky-300 transition-all duration-300 overflow-hidden cursor-pointer transform hover:-translate-y-0.5"
      role="article"
      aria-label={`Card da Célula ${celula.nome}`}
    >
      {/* Container Proporcional da Foto da Célula (Aspect 16:10) */}
      <div className="relative w-full aspect-[16/10] bg-slate-100 overflow-hidden shrink-0">
        <Image
          src={imageUrl}
          alt={`Foto da célula ${celula.nome}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          referrerPolicy="no-referrer"
          priority={false}
        />

        {/* Gradiente sutil para contraste dos badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        {/* Badge superior: Dia da semana & Horário */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 backdrop-blur-md text-[#052447] text-[11px] font-bold rounded-lg shadow-xs border border-white/40">
          <Calendar size={12} className="text-sky-600 shrink-0" />
          <span>{shortDay}</span>
          <span className="text-slate-300">•</span>
          <Clock size={11} className="text-slate-400 shrink-0" />
          <span>{cleanTime}</span>
        </div>

        {/* Badge superior direito: Contagem de Membros */}
        {celula.memberCount > 0 && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-semibold rounded-lg shadow-xs">
            <Users size={12} className="text-sky-300" />
            <span>{celula.memberCount}</span>
          </div>
        )}

        {/* Tag do Setor na base da foto */}
        {celula.sectorName && (
          <div className="absolute bottom-2.5 left-2.5 max-w-[85%] truncate">
            <span className="inline-block px-2 py-0.5 bg-sky-950/80 backdrop-blur-md text-sky-200 text-[10px] font-semibold rounded-md uppercase tracking-wider truncate">
              {celula.sectorName}
            </span>
          </div>
        )}
      </div>

      {/* Conteúdo Abaixo da Foto */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Nome da Célula */}
          <h3 className="font-extrabold text-base sm:text-[17px] text-[#04213d] group-hover:text-sky-700 transition-colors line-clamp-1">
            {celula.nome}
          </h3>

          {/* Bairro da Célula */}
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mt-1 line-clamp-1">
            <MapPin size={13} className="text-rose-500 shrink-0" />
            <span className="truncate">{celula.bairro || 'Bairro Central'}</span>
            {celula.endereco && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] font-normal text-slate-400 truncate max-w-[120px]">
                  {celula.endereco}
                </span>
              </>
            )}
          </p>

          {/* Líderes da Célula */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-700">
            <div className="p-1 bg-sky-50 text-sky-700 rounded-md shrink-0">
              <UserCheck size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block leading-tight">
                {celula.leaderNames.length > 1 ? 'Líderes' : 'Líder'}
              </span>
              <p className="font-medium text-slate-800 text-xs truncate" title={leaderDisplay}>
                {leaderDisplay}
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé do Card com CTA sutil */}
        <div className="mt-3 pt-2 flex items-center justify-between text-xs font-bold text-sky-800 group-hover:text-sky-950">
          <span className="text-[11px] font-semibold text-slate-400 group-hover:text-sky-700 transition-colors">
            Ver detalhes da célula
          </span>
          <ChevronRight size={15} className="transform group-hover:translate-x-1 transition-transform text-sky-600" />
        </div>
      </div>
    </div>
  );
};

export const CelulaCard = memo(CelulaCardComponent);
