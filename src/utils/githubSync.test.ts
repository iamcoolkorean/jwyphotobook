import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitHubRepoString,
  buildPhotobooksConfigPayload,
  computeCanvasDrawSpecs,
  parseRemotePhotobooksPayload,
  detectDefaultGitHubRepo,
  slugifyMonographTitle,
  sanitizeMonographSlugInput,
  generateUniqueMonographSlug,
} from './githubSync.ts';
import { CURATED_PHOTOBOOKS, MASTER_INTRO_PHOTO } from '../data/curatedPhotobooks.ts';

test('parseGitHubRepoString: parses owner/repo', () => {
  const result = parseGitHubRepoString('jwy-photo/photobook');
  assert.deepEqual(result, {
    owner: 'jwy-photo',
    repo: 'photobook',
    branch: 'main',
  });
});

test('parseGitHubRepoString: parses full github URL', () => {
  const result = parseGitHubRepoString('https://github.com/iamcoolkorean/jwy-photobook/');
  assert.deepEqual(result, {
    owner: 'iamcoolkorean',
    repo: 'jwy-photobook',
    branch: 'main',
  });
});

test('parseGitHubRepoString: handles invalid input', () => {
  assert.equal(parseGitHubRepoString(''), null);
  assert.equal(parseGitHubRepoString('invalid-string-no-slash'), null);
});

test('buildPhotobooksConfigPayload: builds valid JSON payload with JWY metadata', () => {
  const payload = buildPhotobooksConfigPayload(CURATED_PHOTOBOOKS, MASTER_INTRO_PHOTO.id, 'JWY');
  const parsed = JSON.parse(payload);
  assert.equal(parsed.appName, 'JWY PHOTO BOOK');
  assert.equal(parsed.organizer, 'JWY');
  assert.equal(parsed.location, 'SEOUL, KOREA');
  assert.equal(parsed.mainBannerPhotoId, MASTER_INTRO_PHOTO.id);
  assert.equal(Array.isArray(parsed.books), true);
  assert.equal(parsed.books.length, CURATED_PHOTOBOOKS.length);
});

test('computeCanvasDrawSpecs: centers 16:9 landscape on square canvas', () => {
  const spec = computeCanvasDrawSpecs(1600, 900, 1000, 0.1);
  assert.equal(spec.canvasSize, 1000);
  assert.equal(spec.dw, 800);
  assert.equal(spec.dh, 450);
  assert.equal(spec.dx, 100);
  assert.equal(spec.dy, 275);
});

test('parseRemotePhotobooksPayload: successfully parses and restores payload', () => {
  const sampleBooks = [
    {
      id: 'test-book-1',
      title: 'TEST MONOGRAPH',
      subtitle: 'Sub',
      edition: 'EDITION I',
      year: '2026',
      curatorNote: 'Note',
      coverImage: MASTER_INTRO_PHOTO,
      photos: [MASTER_INTRO_PHOTO],
    },
  ];

  const payloadStr = buildPhotobooksConfigPayload(
    sampleBooks,
    MASTER_INTRO_PHOTO.id,
    'JWY',
    'Custom Catalog Introduction'
  );

  const parsed = parseRemotePhotobooksPayload(payloadStr);
  assert.ok(parsed);
  assert.equal(parsed?.books.length, sampleBooks.length);
  assert.equal(parsed?.mainBannerPhotoId, MASTER_INTRO_PHOTO.id);
  assert.equal(parsed?.catalogDescription, 'Custom Catalog Introduction');
  assert.equal(parsed?.books[0].coverImage.id, sampleBooks[0].coverImage.id);
});

test('parseRemotePhotobooksPayload: handles invalid JSON gracefully', () => {
  assert.equal(parseRemotePhotobooksPayload(''), null);
  assert.equal(parseRemotePhotobooksPayload('invalid-json'), null);
  assert.equal(parseRemotePhotobooksPayload({}), null);
});

test('detectDefaultGitHubRepo: defaults to jwygallery/photo in non-browser or fallback env', () => {
  const repo = detectDefaultGitHubRepo();
  assert.equal(repo, 'jwygallery/photo');
});

test('slugifyMonographTitle: converts titles into clean URL slugs', () => {
  assert.equal(slugifyMonographTitle('#001 Nogodan'), '001-nogodan');
  assert.equal(slugifyMonographTitle('  Seoul Archive 2026!  '), 'seoul-archive-2026');
  assert.equal(slugifyMonographTitle('노고단 사진집'), '');
});

test('sanitizeMonographSlugInput: cleans spaces and special characters while typing', () => {
  assert.equal(sanitizeMonographSlugInput('#001 Nogodan '), '001-nogodan-');
  assert.equal(sanitizeMonographSlugInput('My   Photo__Book'), 'my-photo-book');
});

test('generateUniqueMonographSlug: avoids duplicates and handles empty slugs', () => {
  const existing = [{ id: '001-nogodan' }, { id: '001-nogodan-2' }, { id: 'monograph-1' }];
  assert.equal(generateUniqueMonographSlug('#002 Hallasan', existing), '002-hallasan');
  assert.equal(generateUniqueMonographSlug('#001 Nogodan', existing), '001-nogodan-3');
  assert.equal(generateUniqueMonographSlug('노고단', existing), 'monograph-2');
  assert.equal(generateUniqueMonographSlug('#001 Nogodan', existing, '001-nogodan'), '001-nogodan');
});

