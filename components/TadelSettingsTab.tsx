'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Check, Pencil, X, Eye, EyeOff } from 'lucide-react';
import type { TadelConfigResponse, TadelSchedule, UserProfile } from '@/types';
import { TadelClient, WEEKDAY_NAMES } from '@/lib/tadelClient';

type ScheduleDraft = Omit<TadelSchedule, 'id' | 'active'>;

const EMPTY_DRAFT: ScheduleDraft = {
  dayOfWeek: 3,
  startTime: '19:30',
  minutesBefore: 30,
  minutesAfter: 120,
  location: '',
};

const inputClass =
  'w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#052447]/20 focus:border-[#052447]';

/** Aba "TADEL" em Configurações da Igreja: nome, níveis que registram presença e horários. */
export const TadelSettingsTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const [config, setConfig] = useState<TadelConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [name, setName] = useState('');
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  const [draft, setDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await TadelClient.getConfig(churchId);
      setConfig(data);
      setName(data.name);
      setLevelIds(data.participatingLevelIds);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao carregar configuração do TADEL.');
    } finally {
      setIsLoading(false);
    }
  }, [churchId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (id: string | null, action: () => Promise<unknown>, successMessage: string) => {
    setBusyId(id);
    try {
      await action();
      showToast('success', successMessage);
      await load();
      return true;
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao salvar.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveGeneral = async () => {
    setIsSavingGeneral(true);
    await run(
      null,
      () => TadelClient.updateConfig(churchId, { name: name.trim(), participatingLevelIds: levelIds }),
      'Configuração salva.'
    );
    setIsSavingGeneral(false);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    const ok = await run(null, () => TadelClient.createSchedule(churchId, draft), 'Horário cadastrado.');
    if (ok) setDraft(EMPTY_DRAFT);
    setIsCreating(false);
  };

  const handleSaveEdit = async (id: string) => {
    const ok = await run(id, () => TadelClient.updateSchedule(churchId, { id, ...editDraft }), 'Horário atualizado.');
    if (ok) setEditingId(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 p-10 flex justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center text-sm text-slate-500">
        Não foi possível carregar a configuração do TADEL.
      </div>
    );
  }

  const generalChanged =
    name.trim() !== config.name ||
    levelIds.length !== config.participatingLevelIds.length ||
    levelIds.some((id) => !config.participatingLevelIds.includes(id));

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Geral */}
      <section className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800">Geral</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            O líder registra presença com um botão no app durante o horário do encontro. Basta ir a um dos horários
            da semana.
          </p>
        </div>

        <label className="block max-w-xs">
          <span className="text-xs font-semibold text-slate-600">Nome do encontro</span>
          <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>

        <div>
          <span className="text-xs font-semibold text-slate-600">Quem registra presença (líderes dos níveis)</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {config.levels.map((level) => {
              const checked = levelIds.includes(level.id);
              return (
                <button
                  key={level.id}
                  type="button"
                  onClick={() =>
                    setLevelIds((prev) => (checked ? prev.filter((id) => id !== level.id) : [...prev, level.id]))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border transition cursor-pointer ${
                    checked
                      ? 'bg-[#052447] border-[#052447] text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {checked && <Check size={14} />}
                  {level.name}
                </button>
              );
            })}
          </div>
          {config.usingDefaultLevels && (
            <p className="text-[11px] text-slate-400 mt-1.5">Padrão: os dois níveis mais baixos da hierarquia.</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSaveGeneral}
          disabled={!generalChanged || levelIds.length === 0 || !name.trim() || isSavingGeneral}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#052447] hover:bg-[#073366] disabled:bg-slate-300 cursor-pointer disabled:cursor-not-allowed"
        >
          {isSavingGeneral ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Salvar
        </button>
      </section>

      {/* Horários */}
      <section className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800">Horários semanais</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            O botão de presença fica liberado da abertura até o encerramento da janela de cada horário.
          </p>
        </div>

        {config.schedules.length === 0 && (
          <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Nenhum horário cadastrado ainda.</p>
        )}

        <div className="space-y-2">
          {config.schedules.map((s) =>
            editingId === s.id ? (
              <div key={s.id} className="border border-slate-300 bg-slate-50 rounded-xl p-3 space-y-3">
                <ScheduleFields value={editDraft} onChange={setEditDraft} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(s.id)}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#052447] hover:bg-[#073366] cursor-pointer"
                  >
                    {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-3 border rounded-xl px-3 py-2.5 ${
                  s.active ? 'border-slate-200/80' : 'border-slate-200/60 bg-slate-50 opacity-70'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">
                    {WEEKDAY_NAMES[s.dayOfWeek]} · {s.startTime}
                    {!s.active && <span className="ml-2 text-[11px] text-slate-500">(inativo)</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Check-in de {s.minutesBefore} min antes até {s.minutesAfter} min depois
                    {s.location ? ` · ${s.location}` : ''}
                  </p>
                </div>
                {confirmDeleteId === s.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-600 mr-1">Excluir?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        run(s.id, () => TadelClient.deleteSchedule(churchId, s.id), 'Horário excluído.');
                      }}
                      className="px-2 py-1 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700 cursor-pointer"
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {busyId === s.id && <Loader2 size={15} className="animate-spin text-slate-400 mr-1" />}
                    <IconButton
                      title={s.active ? 'Desativar' : 'Reativar'}
                      onClick={() =>
                        run(
                          s.id,
                          () => TadelClient.updateSchedule(churchId, { id: s.id, active: !s.active }),
                          s.active ? 'Horário desativado.' : 'Horário reativado.'
                        )
                      }
                    >
                      {s.active ? <EyeOff size={15} /> : <Eye size={15} />}
                    </IconButton>
                    <IconButton
                      title="Editar"
                      onClick={() => {
                        setEditingId(s.id);
                        setEditDraft({
                          dayOfWeek: s.dayOfWeek,
                          startTime: s.startTime,
                          minutesBefore: s.minutesBefore,
                          minutesAfter: s.minutesAfter,
                          location: s.location,
                        });
                      }}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton title="Excluir" onClick={() => setConfirmDeleteId(s.id)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Novo horário</p>
          <ScheduleFields value={draft} onChange={setDraft} />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 cursor-pointer"
          >
            {isCreating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Adicionar horário
          </button>
        </div>
      </section>
    </div>
  );
};

const ScheduleFields: React.FC<{ value: ScheduleDraft; onChange: (v: ScheduleDraft) => void }> = ({
  value,
  onChange,
}) => (
  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
    <label className="block col-span-2 sm:col-span-1">
      <span className="text-[11px] font-semibold text-slate-500">Dia</span>
      <select
        className={inputClass}
        value={value.dayOfWeek}
        onChange={(e) => onChange({ ...value, dayOfWeek: Number(e.target.value) })}
      >
        {WEEKDAY_NAMES.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </label>
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">Início</span>
      <input
        type="time"
        className={inputClass}
        value={value.startTime}
        onChange={(e) => onChange({ ...value, startTime: e.target.value })}
      />
    </label>
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">Abre (min antes)</span>
      <input
        type="number"
        min={0}
        max={720}
        className={inputClass}
        value={value.minutesBefore}
        onChange={(e) => onChange({ ...value, minutesBefore: Number(e.target.value) })}
      />
    </label>
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">Fecha (min depois)</span>
      <input
        type="number"
        min={0}
        max={720}
        className={inputClass}
        value={value.minutesAfter}
        onChange={(e) => onChange({ ...value, minutesAfter: Number(e.target.value) })}
      />
    </label>
    <label className="block col-span-2 sm:col-span-1">
      <span className="text-[11px] font-semibold text-slate-500">Local (opcional)</span>
      <input
        className={inputClass}
        value={value.location}
        placeholder="Templo sede"
        onChange={(e) => onChange({ ...value, location: e.target.value })}
      />
    </label>
  </div>
);

const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({
  title,
  onClick,
  children,
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
  >
    {children}
  </button>
);
