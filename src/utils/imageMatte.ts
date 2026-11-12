/**
 * Pure utility functions for Space Archive mathematical matting,
 * aspect ratio preservation, archival metadata formatting, and Google Drive file handling.
 */

export interface MatteCalculationResult {
  containerWidth: number;
  containerHeight: number;
  imageDisplayWidth: number;
  imageDisplayHeight: number;
  matteMarginX: number;
  matteMarginY: number;
  aspectRatio: number;
  isSquare: boolean;
}

/**
 * Computes exact dimensions for centering an image inside a 1:1 square white matting canvas
 * while preserving its natural aspect ratio.
 * 
 * @param originalWidth Natural width of the photograph
 * @param originalHeight Natural height of the photograph
 * @param canvasSize Desired square canvas size in px (default 1000)
 * @param mattingPaddingRatio Fraction of canvas reserved for white border (default 0.16 = 16%)
 */
export function calculateMatteBounds(
  originalWidth: number,
  originalHeight: number,
  canvasSize: number = 1000,
  mattingPaddingRatio: number = 0.025
): MatteCalculationResult {
  if (originalWidth <= 0 || originalHeight <= 0 || canvasSize <= 0) {
    return {
      containerWidth: canvasSize,
      containerHeight: canvasSize,
      imageDisplayWidth: 0,
      imageDisplayHeight: 0,
      matteMarginX: canvasSize / 2,
      matteMarginY: canvasSize / 2,
      aspectRatio: 1,
      isSquare: true,
    };
  }

  const availableSize = canvasSize * (1 - mattingPaddingRatio * 2);
  const imageAspect = originalWidth / originalHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (imageAspect >= 1) {
    // Landscape or square: width hits available limit first
    displayWidth = Math.round(availableSize);
    displayHeight = Math.round(availableSize / imageAspect);
  } else {
    // Portrait: height hits available limit first
    displayHeight = Math.round(availableSize);
    displayWidth = Math.round(availableSize * imageAspect);
  }

  const marginX = Math.round((canvasSize - displayWidth) / 2);
  const marginY = Math.round((canvasSize - displayHeight) / 2);

  return {
    containerWidth: canvasSize,
    containerHeight: canvasSize,
    imageDisplayWidth: displayWidth,
    imageDisplayHeight: displayHeight,
    matteMarginX: marginX,
    matteMarginY: marginY,
    aspectRatio: imageAspect,
    isSquare: Math.abs(imageAspect - 1) < 0.01,
  };
}

/**
 * Formats an ISO date into archival catalog typography (e.g., "MMXXVI · OCT 24" or "2026.10.24")
 */
export function formatArchivalCatalogDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return 'ARCHIVAL REFERENCE';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return 'ARCHIVAL REFERENCE';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * Formats byte size to clean archival human-readable text.
 */
export function formatArchivalFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'UNKNOWN SIZE';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validates whether a file or MIME type is an allowable Space Archive image format.
 */
export function isValidArchiveImageMime(mimeType?: string): boolean {
  if (!mimeType) return false;
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/tiff',
    'image/heic',
  ];
  return allowedMimes.includes(mimeType.toLowerCase()) || mimeType.startsWith('image/');
}

/**
 * Sanitizes and generates serial plate monograph indices (e.g. 01, 02, 03).
 */
export function formatMonographIndex(index: number): string {
  return String(index).padStart(2, '0');
}

export interface SquareMatteConversionResult {
  dataUrl: string;
  aspectRatioLabel: string;
  isPortrait: boolean;
  width: number;
  height: number;
}

/**
 * Converts any image (vertical, horizontal, or square) into an exact 1:1 square canvas
 * with museum-grade white matting (passe-partout).
 * Guarantees that vertical (portrait) photos receive the EXACT same margin proportion on their
 * longest side as horizontal photos, centered with pristine white borders.
 */
export async function convertImageToSquareMatteDataUrl(
  imgSource: string,
  targetCanvasSize: number = 2000,
  paddingRatio: number = 0.025
): Promise<SquareMatteConversionResult> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({
        dataUrl: imgSource,
        aspectRatioLabel: '1:1',
        isPortrait: false,
        width: targetCanvasSize,
        height: targetCanvasSize,
      });
      return;
    }

    const img = new Image();
    if (!imgSource.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const nw = img.naturalWidth || img.width || 1200;
        const nh = img.naturalHeight || img.height || 1200;
        const maxDim = Math.max(nw, nh);
        // Bounded between 1000 and targetCanvasSize (default 2000) to ensure zero memory exhaustion on mobile while retaining pristine 2K clarity
        const finalCanvasSize = Math.max(1000, Math.min(targetCanvasSize, maxDim));

        const canvas = document.createElement('canvas');
        canvas.width = finalCanvasSize;
        canvas.height = finalCanvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: imgSource,
            aspectRatioLabel: nh > nw ? '3:4' : '4:3',
            isPortrait: nh > nw,
            width: nw,
            height: nh,
          });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 1. Fill entire 1:1 square canvas with museum white matting
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, finalCanvasSize, finalCanvasSize);

        // 2. Compute exact bounds: vertical photos use identical padding ratio on longest edge (height)
        const bounds = calculateMatteBounds(nw, nh, finalCanvasSize, paddingRatio);

        // 3. Draw image centered
        ctx.drawImage(
          img,
          bounds.matteMarginX,
          bounds.matteMarginY,
          bounds.imageDisplayWidth,
          bounds.imageDisplayHeight
        );

        // 4. Export as pristine quality JPEG
        const resultDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        if (!resultDataUrl || resultDataUrl === 'data:,' || resultDataUrl.length < 50) {
          throw new Error('Canvas toDataURL returned invalid data');
        }

        const aspectLabel =
          nw >= nh
            ? `${Math.round((nw / nh) * 10) / 10}:1`
            : `1:${Math.round((nh / nw) * 10) / 10}`;

        resolve({
          dataUrl: resultDataUrl,
          aspectRatioLabel: aspectLabel,
          isPortrait: nh > nw,
          width: finalCanvasSize,
          height: finalCanvasSize,
        });
      } catch (err) {
        console.warn('Canvas conversion failed, falling back to source image:', err);
        resolve({
          dataUrl: imgSource,
          aspectRatioLabel: '1:1',
          isPortrait: false,
          width: targetCanvasSize,
          height: targetCanvasSize,
        });
      }
    };

    img.onerror = () => {
      resolve({
        dataUrl: imgSource,
        aspectRatioLabel: '1:1',
        isPortrait: false,
        width: targetCanvasSize,
        height: targetCanvasSize,
      });
    };

    img.src = imgSource;
  });
}
