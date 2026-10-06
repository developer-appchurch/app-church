import { supabase } from './supabase';
import { optimizeImageToWebP, IMAGE_PRESETS, OptimizedImageResult } from './imageOptimizer';

export interface UnitPhotoUploadResult {
  publicUrl: string;
  path: string;
  /** Prévia local (dataUrl) da imagem já otimizada — só para exibir, nunca salvar no banco. */
  previewUrl: string;
  format: 'image/webp' | 'image/jpeg';
  originalSize: number;
  optimizedSize: number;
  reductionLabel: string;
}

/**
 * Otimiza e envia a foto de uma Célula / Unidade organizacional para o Supabase
 * Storage no bucket "units" (mesmo padrão das fotos de avatar e do Feed):
 * - Redimensiona no navegador e converte para WebP; se o navegador não codificar
 *   WebP, usa JPEG. Em ambos os casos reduz qualidade/dimensões até ficar leve
 *   (IMAGE_PRESETS.UNIT_PHOTO.maxBytes).
 * - Obtém Signed Upload URL via API backend ({igreja_id}/{uuid}.webp)
 * - Envia direto via supabase.storage.uploadToSignedUrl
 * - Retorna a URL pública — é só ela que deve ser salva em unidades.foto_url.
 *
 * Aceita o arquivo original (File/Blob) ou um resultado já otimizado com
 * IMAGE_PRESETS.UNIT_PHOTO, para não otimizar duas vezes.
 */
export async function uploadUnitPhoto(
  source: File | Blob | OptimizedImageResult,
  memberId: string
): Promise<UnitPhotoUploadResult> {
  const optimized: OptimizedImageResult =
    source instanceof Blob ? await optimizeImageToWebP(source, IMAGE_PRESETS.UNIT_PHOTO) : source;

  if (!supabase) {
    throw new Error('Conexão com o Storage indisponível. Tente novamente em alguns segundos.');
  }

  const fileExt = optimized.format === 'image/webp' ? 'webp' : 'jpg';

  const res = await fetch('/api/hierarchy/unit-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      memberId,
      extension: fileExt,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedUrl || !data?.token || !data?.path) {
    throw new Error(data?.error || 'Falha ao preparar o envio da foto.');
  }

  const { error: uploadErr } = await supabase.storage
    .from('units')
    .uploadToSignedUrl(data.path, data.token, optimized.blob, {
      contentType: optimized.format,
      cacheControl: '31536000',
    });

  if (uploadErr) {
    console.error('Erro no uploadToSignedUrl (units):', uploadErr);
    throw new Error(`Falha no envio da foto para o Storage: ${uploadErr.message}`);
  }

  return {
    publicUrl: data.publicUrl,
    path: data.path,
    previewUrl: optimized.dataUrl,
    format: optimized.format,
    originalSize: optimized.originalSize,
    optimizedSize: optimized.optimizedSize,
    reductionLabel: optimized.reductionLabel,
  };
}

/** true quando a URL aponta para um arquivo do bucket "units" deste projeto. */
export function isUnitStorageUrl(url?: string | null): boolean {
  return !!url && url.includes('/storage/v1/object/public/units/');
}

/**
 * Remove uma foto do bucket "units" (ex: usuário troca a foto antes de salvar,
 * cancela a edição, ou a foto antiga foi substituída). Só age em URLs do bucket
 * "units"; falhas aqui são silenciosas — não bloqueiam o fluxo principal.
 */
export async function deleteUnitPhoto(publicUrlOrPath: string, memberId: string): Promise<void> {
  const isExternalUrl = /^https?:\/\//i.test(publicUrlOrPath || '') && !isUnitStorageUrl(publicUrlOrPath);
  if (!publicUrlOrPath || publicUrlOrPath.startsWith('data:') || isExternalUrl) {
    return;
  }
  try {
    await fetch('/api/hierarchy/unit-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        memberId,
        imageUrl: publicUrlOrPath,
      }),
    });
  } catch (err) {
    console.warn('Aviso ao remover foto antiga do Storage (units):', err);
  }
}
