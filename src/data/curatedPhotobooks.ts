import { PhotoBook, PhotoItem } from '../types/photobook.ts';

const base = (import.meta as any).env?.BASE_URL || './';
const cleanBase = base.endsWith('/') ? base : `${base}/`;

export const MASTER_INTRO_PHOTO: PhotoItem = {
  id: 'master-intro-photo',
  title: 'OFICIALIA DEL REGISTRO CIVIL',
  subtitle: 'Master Intro Photograph',
  imageUrl: `${cleanBase}assets/aistudio/IMG_5509_square_matte.webp`,
  aspectRatioLabel: '1:1',
  year: '2026',
  location: 'MEXICO',
  filmStockOrCamera: '35mm Rangefinder · Color Film',
  notes: 'Master intro photograph with museum-grade 1:1 square white matting.',
  fileSize: '284 KB',
};

export const CURATED_PHOTOBOOKS: PhotoBook[] = [];

