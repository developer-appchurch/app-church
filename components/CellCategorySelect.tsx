'use client';

import React from 'react';
import { Tag } from 'lucide-react';
import { useCellCategories } from '@/lib/cellCategories';

interface CellCategorySelectProps {
  churchId?: string | null;
  /** '' = sem categoria */
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  className?: string;
  /** 'inline' (padrão): rótulo e campo na mesma linha. 'stacked': rótulo em cima, para usar lado a lado com outro campo. 'field': igual aos demais campos dos modais de edição (ícone + rótulo em cima, campo grande). */
  layout?: 'inline' | 'stacked' | 'field';
}

/**
 * Campo "Categoria" das células (Crianças, Jovens, Casais...). Mostra só categorias ativas;
 * a categoria já escolhida continua aparecendo mesmo se tiver sido desativada depois.
 * Não renderiza nada se a igreja não tiver categorias.
 */
export const CellCategorySelect: React.FC<CellCategorySelectProps> = ({
  churchId,
  value,
  onChange,
  disabled,
  className,
  layout = 'inline',
}) => {
  const { data: categories = [] } = useCellCategories(churchId);
  const options = categories.filter((c) => c.active || c.id === value);
  if (options.length === 0) return null;

  if (layout === 'field') {
    return (
      <div className="min-w-0">
        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
          <Tag size={13} className="text-sky-600 shrink-0" />
          <span>Categoria:</span>
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={
            className ||
            'w-full min-w-0 text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 bg-white cursor-pointer disabled:opacity-60'
          }
        >
          <option value="">Sem categoria</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? '' : ' (desativada)'}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Compacto: rótulo e campo na MESMA linha (ocupa só uma linha do formulário, também no celular)
  return (
    <div className={layout === 'stacked' ? 'min-w-0' : 'flex items-center gap-2'}>
      <label className={layout === 'stacked' ? 'block text-xs font-bold text-slate-700 mb-1' : 'text-xs font-bold text-slate-700 w-[4.6rem] shrink-0'}>
        Categoria
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={
          className ||
          'w-full flex-1 min-w-0 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer disabled:opacity-60'
        }
      >
        <option value="">Sem categoria</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.active ? '' : ' (desativada)'}
          </option>
        ))}
      </select>
    </div>
  );
};
