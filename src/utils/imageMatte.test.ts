import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatteBounds,
  formatArchivalCatalogDate,
  formatArchivalFileSize,
  isValidArchiveImageMime,
  formatMonographIndex,
} from './imageMatte.ts';

test('calculateMatteBounds: centers 4:3 landscape inside 1:1 square canvas with symmetric margins', () => {
  const result = calculateMatteBounds(1600, 1200, 1000, 0.1);
  assert.equal(result.containerWidth, 1000);
  assert.equal(result.containerHeight, 1000);
  // Available size: 1000 * 0.8 = 800
  assert.equal(result.imageDisplayWidth, 800);
  assert.equal(result.imageDisplayHeight, 600);
  assert.equal(result.matteMarginX, 100);
  assert.equal(result.matteMarginY, 200);
  assert.equal(result.isSquare, false);
});

test('calculateMatteBounds: centers 3:4 portrait inside 1:1 square canvas with symmetric margins', () => {
  const result = calculateMatteBounds(1200, 1600, 1000, 0.1);
  assert.equal(result.containerWidth, 1000);
  assert.equal(result.containerHeight, 1000);
  assert.equal(result.imageDisplayHeight, 800);
  assert.equal(result.imageDisplayWidth, 600);
  assert.equal(result.matteMarginX, 200);
  assert.equal(result.matteMarginY, 100);
  assert.equal(result.isSquare, false);
});

test('calculateMatteBounds: vertical portrait and horizontal landscape share identical margin ratio on longest edge', () => {
  const landscape = calculateMatteBounds(3000, 2000, 2000, 0.025);
  const portrait = calculateMatteBounds(2000, 3000, 2000, 0.025);

  // Longest side margin for landscape is matteMarginX (2.5% of 2000 = 50px)
  // Longest side margin for portrait is matteMarginY (2.5% of 2000 = 50px)
  assert.equal(landscape.matteMarginX, portrait.matteMarginY);
  assert.equal(landscape.matteMarginX, 50);
  assert.equal(portrait.matteMarginY, 50);

  // Available size is 95% = 1900px
  assert.equal(landscape.imageDisplayWidth, 1900);
  assert.equal(portrait.imageDisplayHeight, 1900);

  // Container is always 1:1 square
  assert.equal(landscape.containerWidth, landscape.containerHeight);
  assert.equal(portrait.containerWidth, portrait.containerHeight);
});

test('calculateMatteBounds: handles 1:1 square image correctly', () => {
  const result = calculateMatteBounds(1000, 1000, 1000, 0.15);
  assert.equal(result.isSquare, true);
  assert.equal(result.imageDisplayWidth, 700);
  assert.equal(result.imageDisplayHeight, 700);
  assert.equal(result.matteMarginX, 150);
  assert.equal(result.matteMarginY, 150);
});

test('formatArchivalCatalogDate: formats valid dates predictably', () => {
  const date = new Date(2026, 9, 24); // Oct 24, 2026
  assert.equal(formatArchivalCatalogDate(date), '2026.10.24');
  assert.equal(formatArchivalCatalogDate(undefined), 'ARCHIVAL REFERENCE');
});

test('formatArchivalFileSize: humanizes byte metrics', () => {
  assert.equal(formatArchivalFileSize(500), '500 B');
  assert.equal(formatArchivalFileSize(2048), '2.0 KB');
  assert.equal(formatArchivalFileSize(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatArchivalFileSize(undefined), 'UNKNOWN SIZE');
});

test('isValidArchiveImageMime: validates supported image types', () => {
  assert.equal(isValidArchiveImageMime('image/jpeg'), true);
  assert.equal(isValidArchiveImageMime('image/png'), true);
  assert.equal(isValidArchiveImageMime('image/webp'), true);
  assert.equal(isValidArchiveImageMime('application/pdf'), false);
  assert.equal(isValidArchiveImageMime(undefined), false);
});

test('formatMonographIndex: zero-pads indices', () => {
  assert.equal(formatMonographIndex(1), '01');
  assert.equal(formatMonographIndex(9), '09');
  assert.equal(formatMonographIndex(14), '14');
});
