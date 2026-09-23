/**
 * Utilitário de Otimização e Conversão de Imagens para WebP
 * 
 * Finalidade: Reduzir fotos pesadas (ex: 5MB a 15MB de câmeras de celular)
 * para formatos leves WebP (20KB a 150KB), prevenindo travamentos de memória,
 * reduzindo o consumo de dados móveis e acelerando o carregamento no celular.
 */

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 a 1.0 (padrão: 0.8)
  fallbackFormat?: 'image/jpeg';
}

export interface OptimizedImageResult {
  dataUrl: string;
  blob: Blob;
  format: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
  originalSize: number;
  optimizedSize: number;
  reductionPercentage: number;
  reductionLabel: string;
}

export const IMAGE_PRESETS = {
  // Fotos de postagens do Feed (reuniões, batismos, comunhão)
  FEED_POST: {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.8,
  },
  // Fotos de perfil e avatar
  AVATAR: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.82,
  },
  // Logotipos de igrejas e marcas
  LOGO: {
    maxWidth: 600,
    maxHeight: 600,
    quality: 0.85,
  },
} as const;

/**
 * Converte bytes numéricos em string legível (ex: "85.4 KB", "1.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(size < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Carrega uma imagem de forma assíncrona com liberação segura de recursos
 */
function loadImageAsync(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Falha ao carregar imagem para otimização: ' + e));
    img.src = src;
  });
}

/**
 * Otimiza e converte qualquer imagem (File, Blob ou dataUrl) para WebP ultraleve
 */
export async function optimizeImageToWebP(
  source: File | Blob | string,
  options: OptimizeImageOptions = {}
): Promise<OptimizedImageResult> {
  if (typeof window === 'undefined') {
    throw new Error('optimizeImageToWebP só pode ser executado no ambiente do navegador.');
  }

  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.8,
  } = options;

  let originalSize = 0;
  let objectUrlToRevoke: string | null = null;
  let imageSourceUrl = '';

  if (typeof source === 'string') {
    imageSourceUrl = source;
    // Estima o tamanho da string base64 original
    if (source.startsWith('data:')) {
      const base64Part = source.split(',')[1] || '';
      originalSize = Math.round((base64Part.length * 3) / 4);
    } else {
      originalSize = source.length;
    }
  } else {
    originalSize = source.size;
    objectUrlToRevoke = URL.createObjectURL(source);
    imageSourceUrl = objectUrlToRevoke;
  }

  try {
    const img = await loadImageAsync(imageSourceUrl);

    // Calcula dimensões proporcionais
    let targetWidth = img.naturalWidth || img.width;
    let targetHeight = img.naturalHeight || img.height;

    if (targetWidth <= 0 || targetHeight <= 0) {
      targetWidth = 800;
      targetHeight = 600;
    }

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    // Desenha em um Canvas de alta performance
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false,
    });

    if (!ctx) {
      throw new Error('Não foi possível obter contexto 2D do Canvas.');
    }

    // Suavização de alta qualidade na redução
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Tenta exportar primeiramente em image/webp
    let outputFormat: 'image/webp' | 'image/jpeg' = 'image/webp';
    let dataUrl = canvas.toDataURL('image/webp', quality);

    // Se o navegador não suportar WebP (retornando PNG), recorre a JPEG otimizado
    if (!dataUrl.startsWith('data:image/webp')) {
      outputFormat = 'image/jpeg';
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    // Converte o dataUrl para Blob para obter métricas e precisão de bytes
    const base64Data = dataUrl.split(',')[1] || '';
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: outputFormat });
    const optimizedSize = blob.size;

    // Calcula porcentagem de compressão obtida
    let reductionPercentage = 0;
    if (originalSize > 0 && optimizedSize < originalSize) {
      reductionPercentage = Math.round(((originalSize - optimizedSize) / originalSize) * 100);
    }

    const reductionLabel = reductionPercentage > 0 
      ? `${reductionPercentage}% mais leve` 
      : 'Otimizada';

    return {
      dataUrl,
      blob,
      format: outputFormat,
      width: targetWidth,
      height: targetHeight,
      originalSize: originalSize || optimizedSize,
      optimizedSize,
      reductionPercentage,
      reductionLabel,
    };
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}
