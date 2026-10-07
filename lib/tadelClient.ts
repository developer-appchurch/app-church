import type {
  TadelAttendanceRecord,
  TadelConfigResponse,
  TadelSchedule,
  TadelStatusResponse,
  TadelSupervisionResponse,
} from '@/types';

/** Chamadas do cliente às rotas /api/tadel*. O usuário é identificado pela sessão (cookie). */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
    cache: 'no-store',
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo JSON
  }
  if (!res.ok) {
    const error = new Error(data?.error || 'Falha na comunicação com o servidor.') as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

export const TadelClient = {
  getStatus(churchId?: string) {
    return request<TadelStatusResponse>(`/api/tadel?${qs({ churchId })}`);
  },

  checkIn() {
    return request<{ success: true; attendance: TadelAttendanceRecord }>('/api/tadel', { method: 'POST' });
  },

  getSupervision(churchId: string | undefined, weekOffset: number) {
    return request<TadelSupervisionResponse>(`/api/tadel/acompanhamento?${qs({ churchId, weekOffset })}`);
  },

  getConfig(churchId?: string) {
    return request<TadelConfigResponse>(`/api/tadel/config?${qs({ churchId })}`);
  },

  updateConfig(churchId: string | undefined, payload: { name?: string; participatingLevelIds?: string[] | null }) {
    return request<{ success: true }>('/api/tadel/config', {
      method: 'PUT',
      body: JSON.stringify({ churchId, ...payload }),
    });
  },

  createSchedule(churchId: string | undefined, payload: Omit<TadelSchedule, 'id' | 'active'>) {
    return request<{ success: true; schedule: TadelSchedule }>('/api/tadel/config', {
      method: 'POST',
      body: JSON.stringify({ churchId, ...payload }),
    });
  },

  updateSchedule(churchId: string | undefined, payload: Partial<TadelSchedule> & { id: string }) {
    return request<{ success: true; schedule: TadelSchedule }>('/api/tadel/config', {
      method: 'PATCH',
      body: JSON.stringify({ churchId, ...payload }),
    });
  },

  deleteSchedule(churchId: string | undefined, id: string) {
    return request<{ success: true }>(`/api/tadel/config?${qs({ churchId, id })}`, { method: 'DELETE' });
  },
};

/** Opções de query compartilhadas (tela + prefetch do menu) para reaproveitar o mesmo cache. */
export const tadelStatusQueryOptions = (churchId?: string) => ({
  queryKey: ['tadel-status', churchId || ''] as const,
  queryFn: () => TadelClient.getStatus(churchId),
  staleTime: 60_000,
});

export const WEEKDAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const WEEKDAY_SHORT_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "qua, 08/10" a partir de YYYY-MM-DD */
export function formatTadelDate(dateStr: string): string {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return `${WEEKDAY_SHORT_NAMES[day]}, ${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}

/** Hora local (Brasília/Fortaleza) "HH:mm" de um timestamp ISO */
export function formatTadelTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Fortaleza',
  });
}
