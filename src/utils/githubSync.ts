import { PhotoBook } from '../types/photobook.ts';

export interface GitHubRepoDetails {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Parses user input for GitHub repository into owner and repository name.
 * Accepts "owner/repo" or "https://github.com/owner/repo" format.
 */
export function parseGitHubRepoString(input: string, defaultBranch: string = 'main'): GitHubRepoDetails | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return {
      owner: parts[0],
      repo: parts[1],
      branch: defaultBranch,
    };
  }
  return null;
}

/**
 * Converts a monograph title into a clean URL-safe lowercase slug (a-z, 0-9, hyphens).
 * Example: "#001 Nogodan" -> "001-nogodan"
 */
export function slugifyMonographTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Sanitizes live user input for the URL Slug (ID) field.
 * Converts spaces and special characters into hyphens while allowing a single trailing hyphen during typing.
 */
export function sanitizeMonographSlugInput(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '');
}

/**
 * Generates a unique monograph slug ID from a title, appending -2, -3, etc. on collision,
 * or monograph-1, monograph-2, etc. when the title has no ASCII alphanumeric characters.
 */
export function generateUniqueMonographSlug(
  title: string,
  existingBooks: ReadonlyArray<Pick<PhotoBook, 'id'>>,
  excludeBookId?: string
): string {
  const existingIds = new Set(
    existingBooks
      .filter((b) => b.id !== excludeBookId)
      .map((b) => b.id)
  );

  const baseSlug = slugifyMonographTitle(title);
  if (!baseSlug) {
    let seq = 1;
    while (existingIds.has(`monograph-${seq}`)) {
      seq += 1;
    }
    return `monograph-${seq}`;
  }

  if (!existingIds.has(baseSlug)) {
    return baseSlug;
  }

  let seq = 2;
  while (existingIds.has(`${baseSlug}-${seq}`)) {
    seq += 1;
  }
  return `${baseSlug}-${seq}`;
}

/**
 * Automatically detects the GitHub repository (owner/repo) based on GitHub Pages URL,
 * environment variables, or fallback to the correct repository name.
 */
export function detectDefaultGitHubRepo(): string {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    if (hostname.endsWith('.github.io')) {
      const owner = hostname.replace('.github.io', '');
      const segments = pathname.split('/').filter(Boolean);
      const repo = segments[0] || 'photo';
      return `${owner}/${repo}`;
    }
  }
  return (
    (import.meta as any).env?.VITE_GITHUB_REPO ||
    'jwygallery/photo'
  );
}


/**
 * Generates the clean JSON payload of photobooks, catalog description,
 * information page sections, and site configuration to be committed to GitHub repository.
 */
export function buildPhotobooksConfigPayload(
  books: PhotoBook[],
  mainBannerPhotoId: string,
  updatedBy: string = 'JWY',
  catalogDescription: string = '',
  informationConfig?: any
): string {
  const data = {
    appName: 'JWY PHOTO BOOK',
    organizer: 'JWY',
    location: 'SEOUL, KOREA',
    updatedAt: new Date().toISOString(),
    updatedBy,
    mainBannerPhotoId,
    catalogDescription,
    informationConfig: informationConfig || null,
    monographsCount: books.length,
    books: books.map((b, idx) => ({
      id: b.id,
      index: String(idx + 1).padStart(2, '0'),
      title: b.title,
      subtitle: b.subtitle,
      edition: b.edition,
      year: b.year,
      curatorNote: b.curatorNote,
      coverImageId: b.coverImage.id,
      photosCount: b.photos.length,
      photos: b.photos.map((p) => ({
        id: p.id,
        title: p.title,
        subtitle: p.subtitle || '',
        imageUrl: p.imageUrl,
        aspectRatioLabel: p.aspectRatioLabel || '1:1',
        year: p.year || b.year,
        location: p.location || 'SEOUL, KOREA',
        filmStockOrCamera: p.filmStockOrCamera || '',
        notes: p.notes || '',
        fileSize: p.fileSize || '',
      })),
    })),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Mathematical placement specs for rendering an image centered on a 1:1 square canvas.
 */
export function computeCanvasDrawSpecs(
  naturalWidth: number,
  naturalHeight: number,
  canvasSize: number = 2000,
  paddingRatio: number = 0.025
) {
  const usableSize = canvasSize * (1 - paddingRatio * 2);
  const aspect = naturalWidth / naturalHeight;

  let dw: number;
  let dh: number;

  if (aspect >= 1) {
    dw = usableSize;
    dh = usableSize / aspect;
  } else {
    dh = usableSize;
    dw = usableSize * aspect;
  }

  const dx = (canvasSize - dw) / 2;
  const dy = (canvasSize - dh) / 2;

  return {
    canvasSize,
    dx: Math.round(dx),
    dy: Math.round(dy),
    dw: Math.round(dw),
    dh: Math.round(dh),
  };
}

export interface ParsedRemoteConfig {
  books: PhotoBook[];
  mainBannerPhotoId?: string;
  catalogDescription?: string;
  informationConfig?: any;
  updatedAt?: string;
}

/**
 * Validates and parses remote JSON payload committed to GitHub (data/photobooks.json),
 * restoring strongly-typed PhotoBook instances with covers and individual plates.
 */
export function parseRemotePhotobooksPayload(jsonInput: string | any): ParsedRemoteConfig | null {
  try {
    const data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    if (!data || !Array.isArray(data.books)) return null;

    const books: PhotoBook[] = data.books.map((b: any, bIdx: number) => {
      const photos = Array.isArray(b.photos)
        ? b.photos.map((p: any, pIdx: number) => ({
            id: p.id || `remote-photo-${bIdx}-${pIdx}`,
            title: p.title || `PLATE ${String(pIdx + 1).padStart(2, '0')}`,
            subtitle: p.subtitle || '',
            imageUrl: p.imageUrl,
            aspectRatioLabel: p.aspectRatioLabel || '1:1',
            year: p.year || b.year || '2026',
            location: p.location || 'SEOUL, KOREA',
            filmStockOrCamera: p.filmStockOrCamera || '',
            notes: p.notes || '',
            fileSize: p.fileSize || '',
          }))
        : [];

      const coverImage = photos.find((p: any) => p.id === b.coverImageId) || photos[0] || {
        id: `cover-${b.id || bIdx}`,
        title: b.title || 'Monograph Cover',
        subtitle: b.subtitle || '',
        imageUrl: '',
        aspectRatioLabel: '1:1',
        year: b.year || '2026',
      };

      return {
        id: b.id || `book-${bIdx + 1}`,
        title: b.title || 'Untitled Monograph',
        subtitle: b.subtitle || '',
        edition: b.edition || 'ARCHIVE MONOGRAPH',
        year: b.year || '2026',
        curatorNote: b.curatorNote || '',
        coverImage,
        photos,
      };
    });

    return {
      books,
      mainBannerPhotoId: data.mainBannerPhotoId,
      catalogDescription: data.catalogDescription,
      informationConfig: data.informationConfig,
      updatedAt: data.updatedAt,
    };
  } catch (err) {
    console.warn('Failed to parse remote photobooks payload:', err);
    return null;
  }
}

