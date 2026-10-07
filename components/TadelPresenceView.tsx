'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  MapPin,
  Loader2,
  AlertCircle,
  XCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  Hand,
} from 'lucide-react';
import type { TadelAttendanceRecord, TadelOccurrence, TadelStatusResponse, UserProfile } from '@/types';
import { TadelClient, formatTadelDate, formatTadelTime, tadelStatusQueryOptions } from '@/lib/tadelClient';

interface TadelPresenceViewProps {
  currentUser: UserProfile;
}

type ViewTab = 'mine' | 'supervision';

export const TadelPresenceView: React.FC<TadelPresenceViewProps> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const queryClient = useQueryClient();
  const statusQuery = tadelStatusQueryOptions(churchId);
  const {
    data: status,
    isLoading,
    error: loadError,
  } = useQuery({
    ...statusQuery,
    // Revalida em segundo plano; a abertura/fechamento da janela é calculada no aparelho
    refetchInterval: 5 * 60_000,
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tab, setTab] = useState<ViewTab>('mine');

  const handleRegister = async () => {
    setIsRegistering(true);
    setFeedback(null);
    try {
      const { attendance } = await TadelClient.checkIn();
      // Mostra a confirmação na hora, sem esperar recarregar a tela
      queryClient.setQueryData<TadelStatusResponse>(statusQuery.queryKey, (prev) =>
        prev ? applyAttendance(prev, attendance) : prev
      );
      setFeedback({ type: 'success', message: 'Presença registrada! Obrigado por estar no TADEL.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Não foi possível registrar a presença.' });
    } finally {
      setIsRegistering(false);
      queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
    }
  };

  const name = status?.name || 'TADEL';

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-20">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Header */}
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <CalendarCheck size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">Presença no {name}</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              {status ? `Semana ${status.currentWeek.label}` : 'Registre sua presença semanal'}
            </p>
          </div>
        </div>

        {status?.canSupervise && (
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
            {(
              [
                ['mine', 'Minha presença', CalendarCheck],
                ['supervision', 'Acompanhamento', Users],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  tab === id ? 'bg-[#052447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        {isLoading && <LoadingSkeleton />}

        {!isLoading && loadError && !status && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            {(loadError as Error).message || 'Falha ao carregar o TADEL.'}
          </div>
        )}

        {status && tab === 'mine' && (
          <MyAttendance
            status={status}
            isRegistering={isRegistering}
            feedback={feedback}
            onRegister={handleRegister}
          />
        )}

        {status && tab === 'supervision' && <SupervisionPanel churchId={churchId} />}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// Minha presença
// ------------------------------------------------------------------------------

const MyAttendance: React.FC<{
  status: TadelStatusResponse;
  isRegistering: boolean;
  feedback: { type: 'success' | 'error'; message: string } | null;
  onRegister: () => void;
}> = ({ status, isRegistering, feedback, onRegister }) => {
  const name = status.name;
  const occurrences = useLiveOccurrences(status.occurrences);

  if (!status.configured) {
    return (
      <InfoCard icon={Clock} title={`${name} ainda não configurado`}>
        {status.canManage
          ? `Cadastre os horários em Configurações da Igreja › ${name}.`
          : `Sua igreja ainda não cadastrou os horários do ${name}.`}
      </InfoCard>
    );
  }

  const openOccurrence = occurrences.find((o) => o.status === 'open');
  const nextOccurrence = occurrences.find((o) => o.status === 'upcoming');
  const attendance = status.currentAttendance;
  const attendedOccurrence = attendance
    ? occurrences.find((o) => o.scheduleId === attendance.scheduleId)
    : null;

  return (
    <>
      {status.eligible ? (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
          {attendance ? (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 size={28} className="text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-emerald-800">Presença da semana confirmada</p>
                <p className="text-sm text-emerald-700 mt-0.5">
                  {name} de {formatTadelDate(attendance.date)}
                  {attendance.startTime ? ` (${attendance.startTime})` : ''} · registrada às{' '}
                  {formatTadelTime(attendance.registeredAt)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <button
                type="button"
                onClick={onRegister}
                disabled={!openOccurrence || isRegistering}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
              >
                {isRegistering ? <Loader2 size={20} className="animate-spin" /> : <Hand size={20} />}
                Registrar minha presença
              </button>
              <p className="text-xs sm:text-sm text-slate-500">
                {openOccurrence
                  ? `Check-in aberto até ${formatTadelTime(openOccurrence.closesAt)}.`
                  : nextOccurrence
                    ? `Disponível a partir de ${formatTadelDate(nextOccurrence.date)} às ${formatTadelTime(nextOccurrence.opensAt)}.`
                    : `Não há mais ${name} nesta semana.`}
              </p>
            </div>
          )}

          {feedback && (
            <div
              className={`text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {feedback.message}
            </div>
          )}

          {/* Horários da semana */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
              Horários desta semana · basta ir a um
            </p>
            <div className="space-y-2">
              {occurrences.map((o) => {
                const isAttended = attendedOccurrence?.scheduleId === o.scheduleId;
                const label = isAttended
                  ? 'Você esteve aqui'
                  : attendance
                    ? 'Não necessário'
                    : o.status === 'open'
                      ? 'Check-in aberto'
                      : o.status === 'upcoming'
                        ? 'Em breve'
                        : 'Encerrado';
                const badgeClass = isAttended
                  ? 'bg-emerald-100 text-emerald-700'
                  : o.status === 'open' && !attendance
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-slate-100 text-slate-500';
                return (
                  <div
                    key={o.scheduleId}
                    className="flex items-center justify-between gap-3 border border-slate-200/80 rounded-xl px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm capitalize">
                        {formatTadelDate(o.date)} · {o.startTime}
                      </p>
                      {o.location && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                          <MapPin size={12} /> {o.location}
                        </p>
                      )}
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${badgeClass}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <InfoCard icon={Users} title="Registro para líderes participantes">
          O registro de presença no {name} é feito pelos líderes dos níveis definidos pela sua igreja.
          {status.canSupervise ? ' Use a aba Acompanhamento para ver a presença dos líderes.' : ''}
        </InfoCard>
      )}

      {status.eligible && (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-slate-800">Histórico</p>
            <p className="text-sm text-slate-500">
              Frequência:{' '}
              <span className="font-black text-slate-800">{status.frequency.percentage}%</span>{' '}
              <span className="text-xs">
                ({status.frequency.present}/{status.frequency.total})
              </span>
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {status.history.map((h, i) => (
              <div key={`${h.week.year}-${h.week.week}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600">
                  {h.week.label}
                  {i === 0 && <span className="ml-1.5 text-[11px] font-semibold text-sky-600">(atual)</span>}
                </span>
                {h.attendance ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 size={15} /> {formatTadelDate(h.attendance.date)}
                  </span>
                ) : i === 0 ? (
                  <span className="text-slate-400">Pendente</span>
                ) : (
                  <span className="flex items-center gap-1 text-red-500 font-semibold">
                    <XCircle size={15} /> Ausente
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ------------------------------------------------------------------------------
// Acompanhamento (supervisão)
// ------------------------------------------------------------------------------

const SupervisionPanel: React.FC<{ churchId: string }> = ({ churchId }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['tadel-supervision', churchId, weekOffset],
    queryFn: () => TadelClient.getSupervision(churchId, weekOffset),
    staleTime: 60_000,
    // Mantém a semana anterior na tela enquanto a próxima carrega (sem piscar)
    placeholderData: keepPreviousData,
  });

  const presentCount = data?.leaders.filter((l) => l.attendance).length || 0;
  const total = data?.leaders.length || 0;
  const visible = (data?.leaders || []).filter((l) =>
    filter === 'all' ? true : filter === 'present' ? Boolean(l.attendance) : !l.attendance
  );

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekOffset((w) => w - 1)}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-bold text-slate-800 text-sm sm:text-base text-center">
          Semana {data?.week.label || '...'}
        </p>
        <button
          type="button"
          onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
          disabled={weekOffset === 0}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {isLoading && (
        <div className="py-8 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-red-600">{(error as Error).message || 'Falha ao carregar acompanhamento.'}</p>
      )}

      {!isLoading && data && (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Presentes" value={presentCount} className="text-emerald-700 bg-emerald-50" />
            <Stat label="Ausentes" value={total - presentCount} className="text-red-600 bg-red-50" />
            <Stat
              label="Frequência"
              value={`${total > 0 ? Math.round((presentCount / total) * 100) : 0}%`}
              className="text-slate-800 bg-slate-50"
            />
          </div>

          {data.schedules.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {data.schedules.map((s) => (
                <span key={s.id} className="px-2 py-1 rounded-full bg-sky-50 text-sky-700 font-semibold">
                  {formatScheduleLabel(s.dayOfWeek, s.startTime)}: {data.countsBySchedule[s.id] || 0}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-1 text-xs">
            {(
              [
                ['all', 'Todos'],
                ['present', 'Presentes'],
                ['absent', 'Ausentes'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-3 py-1.5 rounded-full font-semibold cursor-pointer ${
                  filter === id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">Nenhum líder nesta lista.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map((l) => (
                <div key={l.memberId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{l.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {l.units.map((u) => `${u.levelName ? `${u.levelName} ` : ''}${u.name}`).join(' · ')}
                    </p>
                  </div>
                  {l.attendance ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full whitespace-nowrap">
                      {formatTadelDate(l.attendance.date)}
                      {l.attendance.startTime ? ` ${l.attendance.startTime}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full whitespace-nowrap">
                      {weekOffset === 0 ? 'Pendente' : 'Ausente'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const formatScheduleLabel = (day: number, time: string) => `${WEEKDAY_SHORT[day]} ${time}`;

const Stat: React.FC<{ label: string; value: React.ReactNode; className: string }> = ({ label, value, className }) => (
  <div className={`rounded-xl py-2.5 ${className}`}>
    <p className="text-xl font-black">{value}</p>
    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
  </div>
);

const InfoCard: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({
  icon: Icon,
  title,
  children,
}) => (
  <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-8 text-center">
    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
      <Icon size={22} />
    </div>
    <p className="font-bold text-slate-800">{title}</p>
    <p className="text-sm text-slate-500 mt-1">{children}</p>
  </div>
);

// ------------------------------------------------------------------------------
// Auxiliares
// ------------------------------------------------------------------------------

/** Recalcula no aparelho se cada horário está aberto/encerrado, atualizando a cada 30s. */
function useLiveOccurrences(occurrences: TadelOccurrence[]): TadelOccurrence[] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return useMemo(
    () =>
      occurrences.map((o) => {
        const opens = Date.parse(o.opensAt);
        const closes = Date.parse(o.closesAt);
        const status: TadelOccurrence['status'] = now < opens ? 'upcoming' : now > closes ? 'closed' : 'open';
        return { ...o, status };
      }),
    [occurrences, now]
  );
}

function applyAttendance(status: TadelStatusResponse, attendance: TadelAttendanceRecord): TadelStatusResponse {
  const history = status.history.map((h, i) => (i === 0 ? { ...h, attendance } : h));
  const wasCounted = status.history[0]?.attendance !== null;
  const present = status.frequency.present + (wasCounted ? 0 : 1);
  const total = status.frequency.total + (wasCounted ? 0 : 1);
  return {
    ...status,
    currentAttendance: attendance,
    history,
    frequency: { present, total, percentage: total > 0 ? Math.round((present / total) * 100) : 0 },
  };
}

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Carregando">
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 p-5 space-y-4">
      <div className="h-14 w-full sm:w-72 mx-auto rounded-2xl bg-slate-200" />
      <div className="h-3 w-48 mx-auto rounded bg-slate-100" />
      <div className="space-y-2 pt-2">
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
      </div>
    </div>
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 p-5 space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-6 rounded bg-slate-100" />
      ))}
    </div>
  </div>
);
