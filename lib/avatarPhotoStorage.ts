import { supabase } from './supabase';
import { optimizeImageToWebP, IMAGE_PRESETS } from './imageOptimizer';

export interface AvatarUploadResult {
  publicUrl: string;
  path: string;
}

/**
 * Otimiza e envia a foto de perfil (avatar) de um membro para o Supabase
 * Storage no bucket "avatars" (mesmo padrão de lib/feedStorage.ts e
 * lib/unitPhotoStorage.ts): converte para WebP, pede uma Signed Upload URL
 * via API backend e envia direto via uploadToSignedUrl. Retorna só a URL
 * pública, para salvar em membros.url_avatar.
 */
export async function uploadAvatarPhoto(
  fileOrBlob: File | Blob,
  memberId: string,
  login?: string
): Promise<AvatarUploadResult> {
  const optimized = await optimizeImageToWebP(fileOrBlob, IMAGE_PRESETS.AVATAR);

  if (!supabase) {
    throw new Error('Conexão com o Storage indisponível. Tente novamente em alguns segundos.');
  }

  const fileExt = optimized.format === 'image/webp' ? 'webp' : 'jpg';

  const res = await fetch('/api/members/avatar-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'upload',
      memberId,
      login,
      extension: fileExt,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedUrl || !data?.token || !data?.path) {
    throw new Error(data?.error || 'Falha ao preparar o envio da foto.');
  }

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .uploadToSignedUrl(data.path, data.token, optimized.blob, {
      contentType: optimized.format,
      cacheControl: '31536000',
    });

  if (uploadErr) {
    console.error('Erro no uploadToSignedUrl (avatars):', uploadErr);
    throw new Error(`Falha no envio da foto para o Storage: ${uploadErr.message}`);
  }

  return { publicUrl: data.publicUrl, path: data.path };
}

/**
 * Remove uma foto antiga do bucket "avatars" (ex: usuário troca a foto antes
 * de salvar). Falhas aqui são silenciosas — não bloqueiam o fluxo principal.
 */
export async function deleteAvatarPhoto(publicUrlOrPath: string, memberId: string, login?: string): Promise<void> {
  try {
    await fetch('/api/members/avatar-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'excluir',
        memberId,
        login,
        imageUrl: publicUrlOrPath,
      }),
    });
  } catch (err) {
    console.warn('Aviso ao remover avatar antigo do Storage:', err);
  }
}
