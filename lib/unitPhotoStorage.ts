import { supabase } from './supabase';
import { optimizeImageToWebP, IMAGE_PRESETS } from './imageOptimizer';

export interface UnitPhotoUploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Otimiza e envia a foto de uma Célula / Unidade organizacional para o Supabase
 * Storage no bucket "units" (mesmo padrão usado nas fotos do Feed, em feedStorage.ts):
 * - Redimensiona no navegador e converte para WebP
 * - Obtém Signed Upload URL via API backend ({igreja_id}/{uuid}.webp)
 * - Envia direto via supabase.storage.uploadToSignedUrl
 * - Retorna apenas a URL pública, para salvar em unidades.foto_url
 */
export async function uploadUnitPhoto(
  fileOrBlob: File | Blob,
  memberId: string
): Promise<UnitPhotoUploadResult> {
  const optimized = await optimizeImageToWebP(fileOrBlob, IMAGE_PRESETS.UNIT_PHOTO);

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

  return { publicUrl: data.publicUrl, path: data.path };
}

/**
 * Remove uma foto do bucket "units" (ex: usuário troca a foto antes de salvar,
 * ou a célula é excluída). Falhas aqui são silenciosas — não bloqueiam o fluxo principal.
 */
export async function deleteUnitPhoto(publicUrlOrPath: string, memberId: string): Promise<void> {
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
