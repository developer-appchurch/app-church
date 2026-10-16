'use client';

import React, { useState } from 'react';
import { Plus, Pencil, Check, X, Loader2, AlertCircle, Trash2, Power } from 'lucide-react';
import { UserProfile } from '@/types';
import { CellCategory, useCellCategories, useCellCategoryMutations } from '@/lib/cellCategories';

/**
 * Configurações da Igreja › Categorias: lista de categorias das células
 * (Crianças, Adolescentes, Jovens, Adultos, Casais...). Cada célula escolhe uma.
 * Categoria em uso não é excluída: desativa-se (a célula continua mostrando a categoria).
 */
export const CellCategoriesTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId || '';
  const query = useCellCategories(churchId, { withUsage: true });
  const actions = useCellCategoryMutations(churchId);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = async (id: string | null, fn: () => Promise<void>) => {
    setBusyId(id ?? 'new');
    setError('');
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir a operação.');
    } finally {
      setBusyId(null);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(null, async () => {
      await actions.create(newName.trim());
      setNewName('');
    });
  };

  const saveRename = (cat: CellCategory) => {
    if (!editName.trim() || editName.trim() === cat.name) {
      setEditingId(null);
      return;
    }
    run(cat.id, async () => {
      await actions.update(cat.id, { name: editName.trim() });
      setEditingId(null);
    });
  };

  if (query.isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 flex justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
        <AlertCircle size={16} className="shrink-0" />
        <span>{(query.error as Error)?.message || 'Não foi possível carregar as categorias.'}</span>
      </div>
    );
  }

  const categories = query.data || [];

  return (
    <div className="max-w-3xl space-y-3">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4">
        <h2 className="text-sm sm:text-base font-bold text-slate-800">Categorias de célula</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Cada célula pode ter uma categoria (por exemplo Crianças, Jovens ou Casais). Ela aparece no cartão da célula e
          serve de filtro em Nossas Células.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100">
        {categories.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma categoria cadastrada.</p>}
        {categories.map((cat) => {
          const editing = editingId === cat.id;
          const busy = busyId === cat.id;
          return (
            <div key={cat.id} className="flex items-center gap-2 px-4 py-2.5">
              {editing ? (
                <input
                  autoFocus
                  value={editName}
                  maxLength={40}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(cat);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-sky-800"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-semibold ${cat.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                    {cat.name}
                  </span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {cat.usageCount === 0
                      ? 'nenhuma célula'
                      : `${cat.usageCount} ${cat.usageCount === 1 ? 'célula' : 'células'}`}
                    {!cat.active && ' · desativada'}
                  </span>
                </div>
              )}

              {busy ? (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              ) : editing ? (
                <>
                  <button type="button" onClick={() => saveRename(cat)} aria-label="Salvar nome" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer">
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label="Cancelar" className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                    aria-label={`Renomear ${cat.name}`}
                    title="Renomear"
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => run(cat.id, () => actions.update(cat.id, { active: !cat.active }))}
                    aria-label={cat.active ? `Desativar ${cat.name}` : `Ativar ${cat.name}`}
                    title={cat.active ? 'Desativar (some da lista ao cadastrar)' : 'Ativar'}
                    className={`p-1.5 rounded-lg cursor-pointer ${cat.active ? 'text-slate-500 hover:bg-slate-100' : 'text-emerald-600 hover:bg-emerald-50'}`}
                  >
                    <Power size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={cat.usageCount > 0}
                    onClick={() => run(cat.id, () => actions.remove(cat.id))}
                    aria-label={`Excluir ${cat.name}`}
                    title={cat.usageCount > 0 ? 'Em uso: desative em vez de excluir' : 'Excluir'}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={add} className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 flex gap-2">
        <input
          value={newName}
          maxLength={40}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nova categoria (ex.: Idosos)"
          disabled={busyId === 'new'}
          className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:border-sky-800 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!newName.trim() || busyId === 'new'}
          className="px-4 py-2 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {busyId === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar
        </button>
      </form>
    </div>
  );
};
