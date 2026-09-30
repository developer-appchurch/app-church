import { CelulaCardItem, CelulasQueryParams, CelulasPaginationResult } from '@/types';

/**
 * Curated high-aesthetic default cell images based on cell id or name
 */
const DEFAULT_CELL_PHOTOS = [
  'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1543807535-eceef0bc6599?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=700&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=700&auto=format&fit=crop&q=80',
];

/**
 * Obtém URL otimizada com resize/quality do Supabase Storage ou placeholder curado
 */
export function getCellOptimizedImageUrl(
  fotoUrl?: string,
  identifierSeed: string = 'cell',
  width: number = 600,
  quality: number = 80
): string {
  if (fotoUrl && fotoUrl.trim().length > 0) {
    const cleanUrl = fotoUrl.trim();
    // Se for do Supabase Storage, aplica os parâmetros de transformação nativos
    if (cleanUrl.includes('supabase.co/storage/v1/object/public/')) {
      const separator = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${separator}width=${width}&quality=${quality}&resize=cover`;
    }
    return cleanUrl;
  }

  // Fallback determinístico e estável baseado no nome ou ID da célula
  let hash = 0;
  for (let i = 0; i < identifierSeed.length; i++) {
    hash = (hash << 5) - hash + identifierSeed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DEFAULT_CELL_PHOTOS.length;
  return DEFAULT_CELL_PHOTOS[index];
}

/**
 * Consulta de células por congregação com busca multi-campo, paginação e isolamento estrito
 */
export async function getCelulasByIgreja(
  params: CelulasQueryParams
): Promise<CelulasPaginationResult> {
  const { churchId, search = '', diaSemana = '', page = 1, pageSize = 12 } = params;

  if (!churchId) {
    return {
      celulas: [],
      total: 0,
      page: 1,
      pageSize,
      hasMore: false,
    };
  }

  const queryParams = new URLSearchParams();
  queryParams.set('churchId', churchId);
  if (search.trim()) queryParams.set('search', search.trim());
  if (diaSemana && diaSemana !== 'todos') queryParams.set('diaSemana', diaSemana);
  queryParams.set('page', String(page));
  queryParams.set('pageSize', String(pageSize));

  const url = `/api/celulas?${queryParams.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(
      errorData?.error || `Falha ao carregar células da congregação (Status ${res.status}).`
    );
  }

  const data = await res.json();
  return {
    celulas: data.celulas || [],
    total: data.total || 0,
    page: data.page || page,
    pageSize: data.pageSize || pageSize,
    hasMore: Boolean(data.hasMore),
  };
}
