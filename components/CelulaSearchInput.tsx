'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Search, X, Loader2, Calendar } from 'lucide-react';

interface CelulaSearchInputProps {
  onSearchChange: (search: string) => void;
  onDiaSemanaChange: (dia: string) => void;
  selectedDiaSemana: string;
  totalCount?: number;
  isPending?: boolean;
}

const DIAS_SEMANA = [
  { id: 'todos', label: 'Todos os Dias' },
  { id: 'Segunda', label: 'Segunda' },
  { id: 'Terça', label: 'Terça' },
  { id: 'Quarta', label: 'Quarta' },
  { id: 'Quinta', label: 'Quinta' },
  { id: 'Sexta', label: 'Sexta' },
  { id: 'Sábado', label: 'Sábado' },
  { id: 'Domingo', label: 'Domingo' },
];

export const CelulaSearchInput: React.FC<CelulaSearchInputProps> = ({
  onSearchChange,
  onDiaSemanaChange,
  selectedDiaSemana,
  totalCount,
  isPending = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [, startTransition] = useTransition();

  // Debounce de 300ms antes de disparar a busca no servidor
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        onSearchChange(inputValue);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, onSearchChange]);

  const handleClear = () => {
    setInputValue('');
    startTransition(() => {
      onSearchChange('');
    });
  };

  return (
    <div className="w-full space-y-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
      {/* Campo de Busca Principal */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
          {isPending ? (
            <Loader2 size={18} className="animate-spin text-sky-600" />
          ) : (
            <Search size={18} />
          )}
        </div>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Buscar célula por nome, bairro, dia da semana ou líder..."
          className="w-full pl-10 pr-10 py-2.5 sm:py-3 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all outline-none font-medium"
          aria-label="Buscar células"
        />

        {inputValue.trim().length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-1 text-slate-400 hover:text-slate-700 bg-slate-200/70 hover:bg-slate-200 rounded-full transition cursor-pointer"
            title="Limpar busca"
            aria-label="Limpar campo de busca"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filtros Rápidos de Dia da Semana & Contador de Resultados */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
            <Calendar size={13} className="text-slate-500" />
            <span className="hidden sm:inline">Dia:</span>
          </div>

          {DIAS_SEMANA.map((d) => {
            const isActive = selectedDiaSemana === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    onDiaSemanaChange(d.id);
                  });
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#052447] text-white shadow-2xs font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {typeof totalCount === 'number' && (
          <div className="text-[11px] font-semibold text-slate-500 shrink-0">
            Total: <span className="font-bold text-[#052447]">{totalCount}</span> células
          </div>
        )}
      </div>
    </div>
  );
};
