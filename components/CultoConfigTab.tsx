'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Check, X, Loader2, AlertCircle, Trash2, Power } from 'lucide-react';
import { UserProfile } from '@/types';
import { CultoClient, CultoCampus, CultoSchedule, cultoConfigQuery } from '@/lib/cultoClient';
import { markStale } from '@/lib/queryCache';

/**
 * Configurações da Igreja › Cultos: cadastro de campus e horários de culto.
 * Fica nas Configurações (não na tela de lançamento): quem só lança a contagem (Gestor de Culto)
 * não altera campus nem horários, a menos que também tenha a permissão "Configurar Cultos"
 * (culto:configurar), church:admin, Pastor ou Administrador. O servidor valida tudo.
 */

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const CultoConfigTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId || undefined;
  const queryClient = useQueryClient();
  const query = useQuery(cultoConfigQuery(churchId));

  // Espera a lista atualizar antes de fechar formulários (evita mostrar o valor antigo).
  // A tela de lançamento só é marcada como desatualizada: busca de novo quando for aberta.
  const refresh = async () => {
    markStale(queryClient, ['culto-overview'], ['culto-indicators']);
    await queryClient.invalidateQueries({ queryKey: ['culto-config', churchId ?? ''] });
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
        <span>{(query.error as Error)?.message || 'Não foi possível carregar os cultos.'}</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4">
        <h2 className="text-sm sm:text-base font-bold text-slate-800">Campus e horários de culto</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Cadastre os locais (campus) e os horários dos cultos. O Gestor de Culto usa esta lista para lançar a contagem.
        </p>
      </div>
      <ConfigPanel campuses={query.data || []} churchId={churchId} onChanged={refresh} />
    </div>
  );
};


const ConfigPanel: React.FC<{
  campuses: CultoCampus[];
  churchId?: string;
  onChanged: () => Promise<void> | void;
}> = ({ campuses, churchId, onChanged }) => {
  const [newCampus, setNewCampus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      // Espera a lista atualizar antes de fechar o formulário: senão a linha mostra por um
      // instante o valor antigo e parece que a alteração não foi salva.
      await onChanged();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampus.trim()) return;
    if (await run(() => CultoClient.createCampus(newCampus.trim(), churchId))) setNewCampus('');
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={addCampus} className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-2">
        <input
          value={newCampus}
          onChange={(e) => setNewCampus(e.target.value)}
          maxLength={80}
          placeholder="Nome do novo campus (ex.: Sede, Campus Norte)"
          className="flex-1 min-w-0 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
        />
        <button
          type="submit"
          disabled={busy || !newCampus.trim()}
          className="px-4 py-2.5 bg-[#052447] hover:bg-[#073366] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Plus size={14} /> Adicionar campus
        </button>
      </form>

      {campuses.length === 0 && (
        <p className="text-center text-xs text-slate-500 py-4">
          Comece adicionando o primeiro campus (se a igreja tem um só local, use o nome da sede).
        </p>
      )}

      {campuses.map((campus) => (
        <CampusCard key={campus.id} campus={campus} churchId={churchId} busy={busy} run={run} />
      ))}
    </div>
  );
};

const CampusCard: React.FC<{
  campus: CultoCampus;
  churchId?: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
}> = ({ campus, churchId, busy, run }) => {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(campus.name);
  const [adding, setAdding] = useState(false);

  return (
    <div className={`bg-white rounded-2xl border shadow-xs p-4 space-y-3 ${campus.active ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-sky-800"
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={async () => {
                if (await run(() => CultoClient.updateCampus(campus.id, { name: name.trim() }, churchId))) setRenaming(false);
              }}
              className="p-2 bg-emerald-600 text-white rounded-lg cursor-pointer"
              aria-label="Salvar nome"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setName(campus.name);
              }}
              className="p-2 bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
              aria-label="Cancelar"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-sm font-black text-slate-900 truncate">
              {campus.name}
              {!campus.active && <span className="ml-2 text-[10px] font-bold text-slate-500">(desativado)</span>}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label="Renomear campus"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => CultoClient.updateCampus(campus.id, { active: !campus.active }, churchId))}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label={campus.active ? 'Desativar campus' : 'Reativar campus'}
                title={campus.active ? 'Desativar' : 'Reativar'}
              >
                <Power size={14} />
              </button>
              {campus.schedules.length === 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => CultoClient.deleteConfigItem('campus', campus.id, churchId))}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  aria-label="Excluir campus"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        {campus.schedules.length === 0 && <p className="text-[11px] text-slate-400">Nenhum horário cadastrado.</p>}
        {campus.schedules.map((s) => (
          <ScheduleRow key={s.id} schedule={s} churchId={churchId} busy={busy} run={run} />
        ))}
      </div>

      {adding ? (
        <ScheduleForm
          initial={{ name: '', dayOfWeek: 0, time: '09:00' }}
          submitLabel="Adicionar culto"
          busy={busy}
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            if (await run(() => CultoClient.createSchedule(campus.id, v, churchId))) setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] font-bold text-sky-800 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg border border-sky-300 flex items-center gap-1 cursor-pointer"
        >
          <Plus size={13} /> Adicionar horário de culto
        </button>
      )}
    </div>
  );
};

const ScheduleRow: React.FC<{
  schedule: CultoSchedule;
  churchId?: string;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
}> = ({ schedule, churchId, busy, run }) => {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ScheduleForm
        initial={{ name: schedule.name, dayOfWeek: schedule.dayOfWeek, time: schedule.time }}
        submitLabel="Salvar"
        busy={busy}
        onCancel={() => setEditing(false)}
        onSubmit={async (v) => {
          if (await run(() => CultoClient.updateSchedule(schedule.id, v, churchId))) setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
        schedule.active ? 'bg-slate-50 border-slate-200' : 'bg-slate-50/50 border-slate-200 opacity-60'
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{schedule.name}</p>
        <p className="text-[11px] text-slate-500">
          {DAYS[schedule.dayOfWeek]} às {schedule.time}
          {!schedule.active && ' · desativado'}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1.5 text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
          aria-label="Editar horário"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => CultoClient.updateSchedule(schedule.id, { active: !schedule.active }, churchId))}
          className="p-1.5 text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
          aria-label={schedule.active ? 'Desativar horário' : 'Reativar horário'}
          title={schedule.active ? 'Desativar' : 'Reativar'}
        >
          <Power size={13} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => CultoClient.deleteConfigItem('schedule', schedule.id, churchId))}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
          aria-label="Excluir horário"
          title="Excluir (só se não tiver contagens)"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
};

const ScheduleForm: React.FC<{
  initial: { name: string; dayOfWeek: number; time: string };
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: { name: string; dayOfWeek: number; time: string }) => void;
  onCancel: () => void;
}> = ({ initial, submitLabel, busy, onSubmit, onCancel }) => {
  const [name, setName] = useState(initial.name);
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek);
  const [time, setTime] = useState(initial.time);

  return (
    <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-xl space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="Nome do culto (ex.: Domingo 9h, Culto da Família)"
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-800"
      />
      <div className="flex gap-2">
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
          className="flex-1 min-w-0 px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-800"
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="px-2 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-800"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer">
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || !name.trim() || !time}
          onClick={() => onSubmit({ name: name.trim(), dayOfWeek, time })}
          className="px-3 py-1.5 bg-[#052447] hover:bg-[#073366] disabled:opacity-50 text-white rounded-lg text-[11px] font-bold cursor-pointer"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
