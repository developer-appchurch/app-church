'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Church,
  ClipboardList,
  History,
  Settings2,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Power,
} from 'lucide-react';
import { UserProfile } from '@/types';
import { CultoClient, CultoCampus, CultoCount, CultoSchedule, cultoOverviewQuery } from '@/lib/cultoClient';
import { markStale } from '@/lib/queryCache';

/**
 * Contagem de Cultos — lançamento e cadastro de campus/horários.
 * Só aparece para quem tem a permissão "Gestor de Culto" (culto:gerenciar), church:admin,
 * Pastor ou Administrador. Os gráficos e o histórico ficam em Indicadores da Igreja.
 */

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Tab = 'launch' | 'history' | 'config';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'launch', label: 'Lançar', icon: ClipboardList },
  { id: 'history', label: 'Lançamentos', icon: History },
  { id: 'config', label: 'Campus e horários', icon: Settings2 },
];

interface FormState {
  adults: string;
  children: string;
  volunteers: string;
  conversions: string;
  reconciliations: string;
  guests: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  adults: '',
  children: '',
  volunteers: '',
  conversions: '',
  reconciliations: '',
  guests: '',
  note: '',
};

const NUMBER_FIELDS: { key: keyof Omit<FormState, 'note'>; label: string; hint?: string }[] = [
  { key: 'adults', label: 'Adultos' },
  { key: 'children', label: 'Crianças' },
  { key: 'volunteers', label: 'Voluntários', hint: 'Não entram no total' },
  { key: 'conversions', label: 'Conversões' },
  { key: 'reconciliations', label: 'Reconciliações' },
  { key: 'guests', label: 'Convidados' },
];

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function scheduleLabel(c: CultoCampus, s: CultoSchedule, showCampus: boolean): string {
  return `${showCampus ? `${c.name} · ` : ''}${s.name} (${DAYS[s.dayOfWeek]} ${s.time})`;
}

interface Props {
  currentUser: UserProfile;
  onBack?: () => void;
}

export const CultoCountView: React.FC<Props> = ({ currentUser }) => {
  const churchId = currentUser.churchId || undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('launch');
  const [editing, setEditing] = useState<CultoCount | null>(null);

  // UMA consulta (uma ida ao servidor) traz campus, horários e lançamentos recentes.
  // Trocar de aba não busca nada; só salvar/editar/excluir busca de novo.
  const overviewQuery = useQuery(cultoOverviewQuery(churchId));

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['culto-overview', churchId ?? ''] });
    // Gráficos de Indicadores: só marcados como desatualizados (buscam ao abrir a aba)
    markStale(queryClient, ['culto-indicators']);
  };

  const campuses = overviewQuery.data?.campuses || [];
  const counts = overviewQuery.data?.counts || [];
  const hasSchedules = campuses.some((c) => c.active && c.schedules.some((s) => s.active));

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-24">
      <div className="max-w-3xl mx-auto space-y-3">
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Church size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">Contagem de Culto</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Lance os números de cada culto. Histórico e gráficos ficam em Indicadores da Igreja.
            </p>
          </div>
        </div>

        <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                  active ? 'bg-[#052447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        {overviewQuery.isError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{(overviewQuery.error as Error)?.message || 'Não foi possível carregar os cultos.'}</span>
          </div>
        )}

        {overviewQuery.isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 flex justify-center text-slate-400">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : tab === 'launch' ? (
          hasSchedules ? (
            <LaunchForm
              campuses={campuses}
              counts={counts}
              churchId={churchId}
              editing={editing}
              onDone={() => {
                setEditing(null);
                refreshAll();
              }}
              onCancelEdit={() => setEditing(null)}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">Nenhum culto cadastrado ainda.</p>
              <p className="text-xs text-slate-500">
                Cadastre o campus e os horários dos cultos para começar a lançar a contagem.
              </p>
              <button
                type="button"
                onClick={() => setTab('config')}
                className="px-4 py-2 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Cadastrar campus e horários
              </button>
            </div>
          )
        ) : tab === 'history' ? (
          <HistoryList
            counts={counts}
            loading={false}
            error=""
            churchId={churchId}
            onEdit={(c) => {
              setEditing(c);
              setTab('launch');
            }}
            onChanged={refreshAll}
          />
        ) : (
          <ConfigPanel campuses={campuses} churchId={churchId} onChanged={refreshAll} />
        )}
      </div>
    </div>
  );
};

/* ------------------------------ Lançar ------------------------------ */

const LaunchForm: React.FC<{
  campuses: CultoCampus[];
  counts: CultoCount[];
  churchId?: string;
  editing: CultoCount | null;
  onDone: () => void;
  onCancelEdit: () => void;
}> = ({ campuses, counts, churchId, editing, onDone, onCancelEdit }) => {
  const options = useMemo(
    () =>
      campuses
        .filter((c) => c.active)
        .flatMap((c) =>
          c.schedules
            .filter((s) => s.active)
            .map((s) => ({
              id: s.id,
              dayOfWeek: s.dayOfWeek,
              label: scheduleLabel(c, s, campuses.filter((x) => x.active).length > 1),
            }))
        ),
    [campuses]
  );

  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [scheduleId, setScheduleId] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Lançamento já existente para o culto e a data escolhidos (evita duplicar: abre para editar)
  const existing = useMemo(
    () => counts.find((c) => c.scheduleId === scheduleId && c.date === date) || null,
    [counts, scheduleId, date]
  );

  // Ao pedir edição pela lista, posiciona culto e data
  useEffect(() => {
    if (editing) {
      setDate(editing.date);
      setScheduleId(editing.scheduleId);
    }
  }, [editing]);

  // Sugere o culto do dia da semana escolhido (ou o primeiro da lista)
  useEffect(() => {
    if (options.length === 0) return;
    if (scheduleId && options.some((o) => o.id === scheduleId)) return;
    const suggestion = options.find((o) => o.dayOfWeek === weekdayOf(date)) || options[0];
    setScheduleId(suggestion.id);
  }, [options, scheduleId, date]);

  // Preenche o formulário com o lançamento existente (ou limpa)
  useEffect(() => {
    if (existing) {
      setForm({
        adults: String(existing.adults),
        children: String(existing.children),
        volunteers: String(existing.volunteers),
        conversions: String(existing.conversions),
        reconciliations: String(existing.reconciliations),
        guests: String(existing.guests),
        note: existing.note || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [existing?.id, scheduleId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = num(form.adults) + num(form.children);

  const setField = (key: keyof FormState, value: string) => {
    if (key !== 'note' && value !== '' && !/^\d{1,6}$/.test(value)) return;
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleId) {
      setError('Selecione o culto.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const input = {
      adults: num(form.adults),
      children: num(form.children),
      volunteers: num(form.volunteers),
      conversions: num(form.conversions),
      reconciliations: num(form.reconciliations),
      guests: num(form.guests),
      note: form.note.trim(),
    };
    try {
      if (existing) {
        await CultoClient.updateCount(existing.id, input, churchId);
        setSuccess(`Lançamento de ${formatDate(date)} atualizado. Total: ${total}.`);
      } else {
        await CultoClient.createCount(scheduleId, date, input, churchId);
        setSuccess(`Contagem de ${formatDate(date)} salva. Total: ${total}.`);
      }
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Culto</label>
          <select
            value={scheduleId}
            onChange={(e) => {
              setScheduleId(e.target.value);
              setSuccess('');
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Data do culto</label>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setSuccess('');
              }
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
          />
        </div>
      </div>

      {existing && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center justify-between gap-2">
          <span>Este culto já tem contagem nesta data. Você está editando o lançamento existente.</span>
          {editing && (
            <button type="button" onClick={onCancelEdit} className="font-bold underline cursor-pointer shrink-0">
              Limpar
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-bold text-slate-700 mb-1">{f.label}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder="0"
              className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900 tabular-nums focus:bg-white focus:outline-none focus:border-sky-800"
            />
            {f.hint && <p className="text-[10px] text-slate-400 mt-0.5">{f.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
        <span className="text-xs font-bold text-sky-900">Total (adultos + crianças)</span>
        <span className="text-2xl font-black text-sky-950 tabular-nums">{total}</span>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          Observação <span className="font-medium text-slate-400">(opcional)</span>
        </label>
        <textarea
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 bg-[#052447] hover:bg-[#073366] disabled:opacity-60 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {existing ? 'Salvar alterações' : 'Salvar contagem'}
      </button>
    </form>
  );
};

/* ---------------------------- Lançamentos ---------------------------- */

const HistoryList: React.FC<{
  counts: CultoCount[];
  loading: boolean;
  error: string;
  churchId?: string;
  onEdit: (c: CultoCount) => void;
  onChanged: () => void;
}> = ({ counts, loading, error, churchId, onEdit, onChanged }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const remove = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      await CultoClient.deleteCount(id, churchId);
      setConfirmId(null);
      onChanged();
    } catch (err: any) {
      setMessage(err?.message || 'Não foi possível excluir.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 flex justify-center text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">{error}</div>
    );
  }
  if (counts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        Nenhuma contagem lançada nos últimos 6 meses.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">{message}</div>}
      {counts.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {formatDate(c.date)} · {c.scheduleName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {c.campusName} · {DAYS[weekdayOf(c.date)]}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-black text-sky-950 tabular-nums leading-none">{c.total}</p>
              <p className="text-[10px] text-slate-400 font-semibold">total</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Adultos {c.adults} · Crianças {c.children} · Voluntários {c.volunteers} · Conversões {c.conversions} ·
            Reconciliações {c.reconciliations} · Convidados {c.guests}
          </p>
          {c.note && <p className="text-[11px] text-slate-500 italic mt-1">{c.note}</p>}
          <div className="flex items-center justify-end gap-2 mt-2">
            {confirmId === c.id ? (
              <>
                <span className="text-[11px] text-red-700 font-semibold">Excluir este lançamento?</span>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => remove(c.id)}
                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  {busyId === c.id ? '...' : 'Excluir'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(c.id)}
                  className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------ Campus e horários ------------------------ */

const ConfigPanel: React.FC<{
  campuses: CultoCampus[];
  churchId?: string;
  onChanged: () => void;
}> = ({ campuses, churchId, onChanged }) => {
  const [newCampus, setNewCampus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
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
