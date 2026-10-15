'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Church,
  ClipboardList,
  History,
  Pencil,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { UserProfile } from '@/types';
import { CultoClient, CultoCampus, CultoCount, CultoSchedule, cultoOverviewQuery } from '@/lib/cultoClient';
import { markStale } from '@/lib/queryCache';

/**
 * Contagem de Cultos — lançamento e lista dos lançamentos.
 * Só aparece para quem tem a permissão "Gestor de Culto" (culto:gerenciar), church:admin,
 * Pastor ou Administrador. Campus e horários são cadastrados em Configurações da Igreja › Cultos;
 * os gráficos e o histórico ficam em Indicadores da Igreja.
 */

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Tab = 'launch' | 'history';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'launch', label: 'Lançar', icon: ClipboardList },
  { id: 'history', label: 'Lançamentos', icon: History },
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

  // Espera a busca terminar: assim a tela nunca mostra o dado antigo logo depois de salvar
  // (o que parecia que "não salvou" e levava a salvar de novo).
  const refreshAll = async () => {
    // Gráficos de Indicadores: só marcados como desatualizados (buscam ao abrir a aba)
    markStale(queryClient, ['culto-indicators']);
    await queryClient.invalidateQueries({ queryKey: ['culto-overview', churchId ?? ''] });
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
              onDone={async () => {
                setEditing(null);
                await refreshAll();
              }}
              onCancelEdit={() => setEditing(null)}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-800">Nenhum culto cadastrado ainda.</p>
              <p className="text-xs text-slate-500">
                O campus e os horários dos cultos são cadastrados em Configurações da Igreja › Cultos, por quem administra
                as configurações. Peça a essa pessoa para cadastrá-los e depois volte aqui para lançar a contagem.
              </p>
            </div>
          )
        ) : (
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
  onDone: () => Promise<void> | void;
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
  // Culto+data que acabou de ser salvo nesta tela (não é preciso avisar "já existe": fomos nós)
  const [justSavedKey, setJustSavedKey] = useState('');

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
      const savedLabel = options.find((o) => o.id === scheduleId)?.label || 'culto';
      if (existing) {
        await CultoClient.updateCount(existing.id, input, churchId);
        setSuccess(`Atualizado: ${savedLabel} · ${formatDate(date)}. Total: ${total}.`);
      } else {
        await CultoClient.createCount(scheduleId, date, input, churchId);
        setSuccess(`Salvo: ${savedLabel} · ${formatDate(date)}. Total: ${total}.`);
      }
      setJustSavedKey(`${scheduleId}|${date}`);

      // Depois de lançar um culto, já deixa pronto o próximo do mesmo dia que ainda não tem contagem
      const nextOption = existing
        ? undefined
        : options.find(
            (o) =>
              o.id !== scheduleId &&
              o.dayOfWeek === weekdayOf(date) &&
              !counts.some((c) => c.scheduleId === o.id && c.date === date)
          );

      // Espera a lista ser atualizada antes de liberar o botão (evita salvar de novo sem querer)
      await onDone();
      if (nextOption) setScheduleId(nextOption.id);
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
              setJustSavedKey('');
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
                setJustSavedKey('');
              }
            }}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
          />
        </div>
      </div>

      {existing && justSavedKey !== `${scheduleId}|${date}` && (
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
  onChanged: () => Promise<void> | void;
}> = ({ counts, loading, error, churchId, onEdit, onChanged }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const remove = async (id: string) => {
    setBusyId(id);
    setMessage('');
    try {
      await CultoClient.deleteCount(id, churchId);
      await onChanged();
      setConfirmId(null);
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
