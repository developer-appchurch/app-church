import { supabase } from './supabase';
import { optimizeImageToWebP, IMAGE_PRESETS } from './imageOptimizer';

export interface LogoUploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Otimiza e envia o logotipo de uma igreja em cadastro para o Supabase Storage
 * no bucket "church-logos" (mesmo padrão de lib/feedStorage.ts e
 * lib/unitPhotoStorage.ts). Diferente dos outros uploads, aqui ainda não existe
 * membro/sessão: o churchId é gerado no navegador (components/RegisterChurchView.tsx)
 * antes do envio e reaproveitado depois na própria requisição de cadastro da igreja.
 */
export async function uploadChurchLogo(
  fileOrBlob: File | Blob,
  churchId: string
): Promise<LogoUploadResult> {
  const optimized = await optimizeImageToWebP(fileOrBlob, IMAGE_PRESETS.LOGO);

  if (!supabase) {
    throw new Error('Conexão com o Storage indisponível. Tente novamente em alguns segundos.');
  }

  const fileExt = optimized.format === 'image/webp' ? 'webp' : 'jpg';

  const res = await fetch('/api/churches/logo-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      churchId,
      extension: fileExt,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedUrl || !data?.token || !data?.path) {
    throw new Error(data?.error || 'Falha ao preparar o envio do logotipo.');
  }

  const { error: uploadErr } = await supabase.storage
    .from('church-logos')
    .uploadToSignedUrl(data.path, data.token, optimized.blob, {
      contentType: optimized.format,
      cacheControl: '31536000',
    });

  if (uploadErr) {
    console.error('Erro no uploadToSignedUrl (church-logos):', uploadErr);
    throw new Error(`Falha no envio do logotipo para o Storage: ${uploadErr.message}`);
  }

  return { publicUrl: data.publicUrl, path: data.path };
}

/**
 * Remove um logotipo antigo do bucket "church-logos" (ex: usuário troca a
 * imagem antes de confirmar o cadastro). Falhas aqui são silenciosas.
 */
export async function deleteChurchLogo(publicUrlOrPath: string, churchId: string): Promise<void> {
  try {
    await fetch('/api/churches/logo-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        churchId,
        imageUrl: publicUrlOrPath,
      }),
    });
  } catch (err) {
    console.warn('Aviso ao remover logotipo antigo do Storage:', err);
  }
}
