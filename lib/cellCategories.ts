'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

/** Categoria de célula (Crianças, Adolescentes, Jovens, Adultos, Casais...). */
export interface CellCategory {
  id: string;
  name: string;
  order: number;
  active: boolean;
  /** Quantas células usam esta categoria. */
  usageCount: number;
}

export const cellCategoriesKey = (churchId: string) => ['cellCategories', churchId] as const;

async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  return data as T;
}

export async function fetchCellCategories(churchId: string, withUsage = false): Promise<CellCategory[]> {
  const data = await request<{ categories: CellCategory[] }>(
    `/api/celulas/categorias?churchId=${encodeURIComponent(churchId)}${withUsage ? '&usage=1' : ''}`
  );
  return data.categories || [];
}

/** Lista de categorias da igreja (uma busca, reaproveitada por todas as telas por 10 min). */
export function useCellCategories(churchId?: string | null, options?: { withUsage?: boolean }) {
  const withUsage = Boolean(options?.withUsage);
  return useQuery({
    // A versão com contagem de uso (só na aba Categorias) tem chave própria; ambas são invalidadas juntas.
    queryKey: withUsage ? [...cellCategoriesKey(churchId || ''), 'usage'] : cellCategoriesKey(churchId || ''),
    queryFn: () => fetchCellCategories(churchId as string, withUsage),
    enabled: Boolean(churchId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCellCategoryMutations(churchId: string) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: cellCategoriesKey(churchId) });
  };
  return {
    create: async (name: string) => {
      await request('/api/celulas/categorias', { method: 'POST', body: JSON.stringify({ churchId, name }) });
      await refresh();
    },
    update: async (id: string, fields: { name?: string; active?: boolean }) => {
      await request('/api/celulas/categorias', { method: 'PATCH', body: JSON.stringify({ churchId, id, ...fields }) });
      await refresh();
    },
    remove: async (id: string) => {
      await request(
        `/api/celulas/categorias?churchId=${encodeURIComponent(churchId)}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      await refresh();
    },
  };
}
