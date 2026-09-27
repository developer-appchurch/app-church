'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface CelulaSearchInputProps {
  onSearchChange: (search: string) => void;
  onDiaSemanaChange: (dia: string) => void;
  selectedDiaSemana: string;
  totalCount?: number;
  isPending?: boolean;
}

const DIAS_SEMANA = [
  { id: 'todos', label: 'Todos' },
  { id: 'Segunda', label: 'Seg' },
  { id: 'Terça', label: 'Ter' },
  { id: 'Quarta', label: 'Qua' },
  { id: 'Quinta', label: 'Qui' },
  { id: 'Sexta', label: 'Sex' },
  { id: 'Sábado', label: 'Sáb' },
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
        <div className="grid grid-cols-7 gap-1 sm:flex sm:items-center sm:gap-1.5 w-full sm:w-auto">
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
                className={`w-full sm:w-auto px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-all text-center cursor-pointer border ${
                  isActive
                    ? 'bg-[#052447] text-white border-[#052447] shadow-xs font-bold ring-1 ring-[#052447]/30'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 hover:border-slate-400 shadow-2xs'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        {typeof totalCount === 'number' && (
          <div className="text-[11px] font-semibold text-slate-500 text-right shrink-0">
            Total: <span className="font-bold text-[#052447]">{totalCount}</span> células
          </div>
        )}
      </div>
    </div>
  );
};
