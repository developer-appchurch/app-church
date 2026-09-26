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

/**
 * Valida se um arquivo selecionado é uma imagem suportada
 */
export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'Nenhum arquivo selecionado.' };
  }

  // Limite máximo de segurança: 25MB (para evitar travamento no navegador do celular)
  const MAX_RAW_SIZE = 25 * 1024 * 1024;
  if (file.size > MAX_RAW_SIZE) {
    return {
      isValid: false,
      error: `A imagem original é muito grande (${formatFileSize(file.size)}). O limite máximo suportado é de 25MB.`,
    };
  }

  const validTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/avif',
    'image/heic',
    'image/heif',
  ];

  const hasValidType = file.type && (validTypes.includes(file.type.toLowerCase()) || file.type.startsWith('image/'));
  const hasValidExt = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);

  if (!hasValidType && !hasValidExt) {
    return {
      isValid: false,
      error: 'Formato de arquivo não suportado. Por favor, envie uma imagem válida (JPG, PNG ou WEBP).',
    };
  }

  return { isValid: true };
}

/**
 * Verifica se a string é uma URL WebP base64 válida
 */
export function isWebPDataUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:image/webp;base64,') || str.startsWith('data:image/webp;');
}

/**
 * Verifica se a string é uma URL HTTP/HTTPS externa válida
 */
export function isHttpUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Validação rigorosa: Garante que apenas WebP (ou URL pública) seja salvo no banco
 */
export function validateImageForDatabase(
  imageUrl: string | null | undefined,
  fieldName: string = 'Imagem'
): { isValid: boolean; error?: string } {
  if (!imageUrl) {
    return { isValid: true };
  }

  const trimmed = imageUrl.trim();
  if (!trimmed) {
    return { isValid: true };
  }

  if (isHttpUrl(trimmed)) {
    return { isValid: true };
  }

  if (trimmed.startsWith('data:')) {
    if (!trimmed.startsWith('data:image/webp')) {
      return {
        isValid: false,
        error: `${fieldName} deve estar obrigatoriamente convertida no formato WebP (data:image/webp). Formato atual não permitido no banco.`,
      };
    }
    return { isValid: true };
  }

  return {
    isValid: false,
    error: `${fieldName} possui um formato inválido. Deve ser uma URL segura ou imagem convertida em WebP.`,
  };
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
 * Respeitando a orientação EXIF das câmeras móveis
 */
async function loadDrawableImage(
  source: File | Blob | string,
  sourceUrl: string
): Promise<{ drawable: CanvasImageSource; width: number; height: number; cleanup?: () => void }> {
  // Se o navegador suportar createImageBitmap com imageOrientation (Chrome, Edge, Safari, Firefox)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      let blob: Blob;
      if (typeof source === 'string') {
        const response = await fetch(source);
        blob = await response.blob();
      } else {
        blob = source;
      }
      // 'from-image' garante que a orientação EXIF seja respeitada e rotacionada corretamente
      const bitmap = await (window as any).createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fallback para HTMLImageElement se createImageBitmap falhar
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () =>
      resolve({
        drawable: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    img.onerror = (e) => reject(new Error('Falha ao carregar imagem para otimização: ' + e));
    img.src = sourceUrl;
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
    const { drawable, width: imgWidth, height: imgHeight, cleanup } = await loadDrawableImage(source, imageSourceUrl);

    // Calcula dimensões proporcionais
    let targetWidth = imgWidth;
    let targetHeight = imgHeight;

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
    ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);

    // Libera recursos se for ImageBitmap
    cleanup?.();

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
