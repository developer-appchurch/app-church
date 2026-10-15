/** Chamadas do cliente às rotas /api/culto*. O usuário é identificado pela sessão (cookie). */

export interface CultoSchedule {
  id: string;
  campusId: string;
  name: string;
  dayOfWeek: number;
  time: string;
  active: boolean;
}

export interface CultoCampus {
  id: string;
  name: string;
  active: boolean;
  schedules: CultoSchedule[];
}

export interface CultoCount {
  id: string;
  scheduleId: string;
  scheduleName: string;
  campusId: string;
  campusName: string;
  date: string;
  adults: number;
  children: number;
  volunteers: number;
  conversions: number;
  reconciliations: number;
  guests: number;
  total: number;
  note: string;
  updatedAt: string;
}

export interface CultoCountInput {
  adults: number;
  children: number;
  volunteers: number;
  conversions: number;
  reconciliations: number;
  guests: number;
  note?: string;
}

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
    throw new Error(data?.error || 'Falha na comunicação com o servidor.');
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

export const CultoClient = {
  async getConfig(churchId?: string) {
    const r = await request<{ campuses: CultoCampus[] }>(`/api/culto/config?${qs({ churchId })}`);
    return r.campuses;
  },
  createCampus(name: string, churchId?: string) {
    return request<{ id: string }>('/api/culto/config', {
      method: 'POST',
      body: JSON.stringify({ type: 'campus', name, churchId }),
    });
  },
  updateCampus(id: string, fields: { name?: string; active?: boolean }, churchId?: string) {
    return request<{ success: true }>('/api/culto/config', {
      method: 'PATCH',
      body: JSON.stringify({ type: 'campus', id, churchId, ...fields }),
    });
  },
  createSchedule(
    campusId: string,
    fields: { name: string; dayOfWeek: number; time: string },
    churchId?: string
  ) {
    return request<{ id: string }>('/api/culto/config', {
      method: 'POST',
      body: JSON.stringify({ type: 'schedule', campusId, churchId, ...fields }),
    });
  },
  updateSchedule(
    id: string,
    fields: { name?: string; dayOfWeek?: number; time?: string; active?: boolean },
    churchId?: string
  ) {
    return request<{ success: true }>('/api/culto/config', {
      method: 'PATCH',
      body: JSON.stringify({ type: 'schedule', id, churchId, ...fields }),
    });
  },
  deleteConfigItem(type: 'campus' | 'schedule', id: string, churchId?: string) {
    return request<{ success: true }>(`/api/culto/config?${qs({ type, id, churchId })}`, { method: 'DELETE' });
  },

  async getCounts(params: { from?: string; to?: string; limit?: number; churchId?: string }) {
    const r = await request<{ counts: CultoCount[] }>(`/api/culto/contagens?${qs(params)}`);
    return r.counts;
  },
  createCount(scheduleId: string, date: string, input: CultoCountInput, churchId?: string) {
    return request<{ id: string }>('/api/culto/contagens', {
      method: 'POST',
      body: JSON.stringify({ scheduleId, date, churchId, ...input }),
    });
  },
  updateCount(id: string, input: CultoCountInput, churchId?: string) {
    return request<{ success: true }>('/api/culto/contagens', {
      method: 'PATCH',
      body: JSON.stringify({ id, churchId, ...input }),
    });
  },
  deleteCount(id: string, churchId?: string) {
    return request<{ success: true }>(`/api/culto/contagens?${qs({ id, churchId })}`, { method: 'DELETE' });
  },
};
