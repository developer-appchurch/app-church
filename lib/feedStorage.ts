import { supabase } from './supabase';
import { optimizeImageToWebP, IMAGE_PRESETS, formatFileSize } from './imageOptimizer';

export interface FeedUploadResult {
  publicUrl: string;
  path: string;
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  format: 'image/webp' | 'image/jpeg';
}

/**
 * Gera um UUID v4 seguro mesmo se crypto.randomUUID não estiver disponível
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Otimiza e envia uma foto para o Supabase Storage no bucket "feed"
 * - Redimensiona no navegador para no máximo 1280px (respeitando EXIF)
 * - Converte para WebP 0.8 com fallback para JPEG
 * - Obtém Signed Upload URL via Edge Function / API backend ({igreja_id}/{uuid}.webp)
 * - Envia diretamente via supabase.storage.uploadToSignedUrl com cacheControl de 1 ano
 * - Retorna a URL pública, largura e altura reais
 */
export async function uploadFeedImage(
  fileOrBlob: File | Blob,
  churchId: string,
  onProgress?: (percent: number) => void,
  memberId?: string
): Promise<FeedUploadResult> {
  onProgress?.(15);

  // 1. Otimização e conversão no navegador (Canvas + WebP 0.8 + EXIF)
  const optimized = await optimizeImageToWebP(fileOrBlob, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.8,
  });

  onProgress?.(45);

  if (!supabase) {
    // Fallback caso Supabase não esteja conectado
    return {
      publicUrl: optimized.dataUrl,
      path: '',
      width: optimized.width,
      height: optimized.height,
      originalSize: optimized.originalSize,
      optimizedSize: optimized.optimizedSize,
      format: optimized.format,
    };
  }

  const fileExt = optimized.format === 'image/webp' ? 'webp' : 'jpg';

  // 2. Tenta obter Signed Upload URL via Edge Function / Endpoint seguro
  let signedUploadData: { signedUrl: string; token: string; path: string; publicUrl: string } | null = null;

  if (memberId) {
    try {
      onProgress?.(60);
      const res = await fetch('/api/feed/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload',
          memberId,
          extension: fileExt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.signedUrl && data.token && data.path) {
          signedUploadData = data;
        }
      } else {
        console.warn('Endpoint /api/feed/image retornou status não-ok:', res.status);
      }
    } catch (err) {
      console.warn('Não foi possível contatar o serviço de upload assinado, tentando método direto:', err);
    }
  }

  onProgress?.(75);

  // 3. Se obteve signed URL, usa uploadToSignedUrl (exigência de alta segurança)
  if (signedUploadData) {
    const { data: uploadRes, error: uploadErr } = await supabase.storage
      .from('feed')
      .uploadToSignedUrl(signedUploadData.path, signedUploadData.token, optimized.blob, {
        contentType: optimized.format,
        cacheControl: '31536000',
      });

    if (uploadErr) {
      console.error('Erro no uploadToSignedUrl:', uploadErr);
      throw new Error(`Falha no envio assinado para o Storage: ${uploadErr.message}`);
    }

    onProgress?.(100);

    return {
      publicUrl: signedUploadData.publicUrl,
      path: signedUploadData.path,
      width: optimized.width,
      height: optimized.height,
      originalSize: optimized.originalSize,
      optimizedSize: optimized.optimizedSize,
      format: optimized.format,
    };
  }

  // 4. Fallback padrão: upload direto pelo cliente caso não haja memberId
  const fileName = `${generateUUID()}.${fileExt}`;
  const safeChurchId = churchId?.trim() || 'geral';
  const filePath = `${safeChurchId}/${fileName}`;

  const { error } = await supabase.storage
    .from('feed')
    .upload(filePath, optimized.blob, {
      contentType: optimized.format,
      cacheControl: '31536000',
      upsert: true,
    });

  if (error) {
    console.error('Erro ao enviar imagem para o Supabase Storage:', error);
    throw new Error(`Falha no upload para o Storage: ${error.message}`);
  }

  onProgress?.(95);

  const { data: publicUrlData } = supabase.storage
    .from('feed')
    .getPublicUrl(filePath);

  onProgress?.(100);

  return {
    publicUrl: publicUrlData.publicUrl,
    path: filePath,
    width: optimized.width,
    height: optimized.height,
    originalSize: optimized.originalSize,
    optimizedSize: optimized.optimizedSize,
    format: optimized.format,
  };
}

/**
 * Remove a imagem do bucket "feed" caso o post seja excluído
 * Valida autorização via backend seguro (Edge Function / API)
 */
export async function deleteFeedImage(
  imageUrlOrPath?: string | null,
  memberId?: string,
  postId?: string
): Promise<boolean> {
  if (!imageUrlOrPath && !postId) return false;

  // 1. Tenta exclusão segura autenticada via backend (Edge Function / API Route)
  if (memberId) {
    try {
      const res = await fetch('/api/feed/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'excluir',
          memberId,
          postId,
          imageUrl: imageUrlOrPath,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return Boolean(data.success);
      }
      console.warn('Exclusão via backend retornou erro:', await res.text());
    } catch (err) {
      console.warn('Erro ao chamar exclusão segura no backend:', err);
    }
  }

  // 2. Fallback direto via Supabase Storage
  if (!supabase || !imageUrlOrPath) return false;

  try {
    let storagePath = imageUrlOrPath;

    // Se for URL completa do Supabase Storage, extrai o caminho relativo
    if (imageUrlOrPath.includes('/storage/v1/object/public/feed/')) {
      storagePath = imageUrlOrPath.split('/storage/v1/object/public/feed/')[1] || '';
    } else if (imageUrlOrPath.includes('/storage/v1/object/sign/feed/')) {
      storagePath = imageUrlOrPath.split('/storage/v1/object/sign/feed/')[1]?.split('?')[0] || '';
    } else if (imageUrlOrPath.includes('/feed/')) {
      const parts = imageUrlOrPath.split('/feed/');
      storagePath = parts[parts.length - 1] || '';
    }

    if (!storagePath || storagePath.startsWith('data:') || storagePath.startsWith('http')) {
      return false;
    }

    const cleanPath = decodeURIComponent(storagePath);
    const { error } = await supabase.storage.from('feed').remove([cleanPath]);
    if (error) {
      console.warn('Aviso ao remover imagem do Storage:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Erro ao tentar remover arquivo do Storage:', err);
    return false;
  }
}
