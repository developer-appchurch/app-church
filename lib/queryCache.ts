import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Marca consultas como desatualizadas SEM buscá-las de novo agora.
 * Use depois de salvar algo cuja tela atual já foi atualizada localmente (setQueryData/setState):
 * as outras telas que usam esses dados buscam a versão nova só quando forem abertas.
 */
export function markStale(queryClient: QueryClient, ...queryKeys: QueryKey[]) {
  queryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
  });
}
