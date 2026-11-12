import { useState, useEffect } from 'react';

interface SpaceArchiveMatteImageProps {
  src: string;
  alt: string;
  title?: string;
  archivalCode?: string;
  aspectRatioLabel?: string;
  className?: string;
  priority?: boolean;
  mattePaddingClass?: string;
  showArchivalStamp?: boolean;
  onClick?: () => void;
}

/**
 * Core image rendering component adhering to Space Archive visual philosophy:
 * 1. Output canvas is strictly a 1:1 square (aspect-square)
 * 2. Background is a pristine, museum-grade white matting (passe-partout)
 * 3. Original photograph is placed in the exact dead center preserving native aspect ratio without distortion
 * 4. Zero-pill, crisp rectangular geometry (rounded-none)
 * 5. Margin ratio reduced to ~60% of original on longest side for stronger photo presence
 */
export default function SpaceArchiveMatteImage({
  src,
  alt,
  title,
  archivalCode,
  aspectRatioLabel,
  className = '',
  priority = false,
  mattePaddingClass = 'p-0',
  showArchivalStamp = true,
  onClick,
}: SpaceArchiveMatteImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryAttempt, setRetryAttempt] = useState(0);

  // Sync state whenever src prop changes
  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setIsLoaded(false);
    setRetryAttempt(0);
  }, [src]);

  const handleImageError = () => {
    // If standard thumbnail link failed with =s0, try fallback size =s1600 or =s800
    if (retryAttempt === 0 && currentSrc) {
      if (currentSrc.includes('=s0')) {
        setRetryAttempt(1);
        setCurrentSrc(currentSrc.replace('=s0', '=s1600'));
        return;
      }
      if (currentSrc.includes('=s1600')) {
        setRetryAttempt(2);
        setCurrentSrc(currentSrc.replace('=s1600', '=s800'));
        return;
      }
      // If it's a drive thumbnail link, try direct google thumbnail query
      const driveMatch = currentSrc.match(/d\/([a-zA-Z0-9_-]+)/);
      if (driveMatch && driveMatch[1]) {
        setRetryAttempt(3);
        setCurrentSrc(`https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1600`);
        return;
      }
    }
    setHasError(true);
  };

  return (
    <div
      onClick={onClick}
      className={`relative w-full aspect-square bg-white rounded-none select-none overflow-hidden transition-transform duration-500 ease-out ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      data-testid="space-archive-matte-canvas"
    >
      {/* Pristine White Passe-Partout Framing Container */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${mattePaddingClass}`}
      >
        {/* Centered Photograph Area */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {!hasError && currentSrc ? (
            <img
              src={currentSrc}
              alt={alt}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              onLoad={() => setIsLoaded(true)}
              onError={handleImageError}
              className={`max-w-full max-h-full object-contain rounded-none shadow-xs transition-opacity duration-300 ease-in-out ${
                isLoaded || priority ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : (
            /* Resilient Minimalist Fallback */
            <div className="w-full h-4/5 border border-neutral-300 flex flex-col items-center justify-center p-6 text-center bg-neutral-50 text-neutral-800">
              <span className="font-light text-xs tracking-tight uppercase mb-1">
                [ ARCHIVAL ASSET PENDING ]
              </span>
              <span className="text-xs font-light text-neutral-500">{title || alt}</span>
            </div>
          )}

          {/* Loading Skeleton */}
          {!isLoaded && !hasError && currentSrc && !priority && (
            <div className="absolute inset-0 bg-neutral-100/60 animate-pulse" />
          )}
        </div>

        {/* Archival Dry Stamp / Museum Annotation in the White Matting Margin */}
        {showArchivalStamp && (
          <div className="absolute bottom-2 sm:bottom-3 left-4 sm:left-8 right-4 sm:right-8 flex items-center justify-between text-[9px] sm:text-[10px] font-light tracking-tight text-neutral-400 uppercase pointer-events-none">
            <span className="truncate max-w-[60%]">
              {archivalCode || 'SPACE ARCHIVE'} {title ? `· ${title}` : ''}
            </span>
            <span className="shrink-0 text-neutral-400">
              {aspectRatioLabel ? `RATIO ${aspectRatioLabel} · 1:1 MATTE` : '1:1 MATTE'}
            </span>
          </div>
        )}
      </div>

      {/* Subtle Hairline Frame Border */}
      <div className="absolute inset-0 border border-neutral-200 pointer-events-none" />
    </div>
  );
}
