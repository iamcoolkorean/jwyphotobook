import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFolderId } from '../services/googleDrive.ts';

test('extractFolderId: parses raw folder ID', () => {
  assert.equal(extractFolderId('1ABCDEF123456_-xyz'), '1ABCDEF123456_-xyz');
  assert.equal(extractFolderId('  1ABCDEF123456_-xyz  '), '1ABCDEF123456_-xyz');
});

test('extractFolderId: parses standard google drive folder url', () => {
  const url = 'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456';
  assert.equal(extractFolderId(url), '1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456');
});

test('extractFolderId: parses drive url with user index (/u/0/)', () => {
  const url = 'https://drive.google.com/drive/u/0/folders/1zYxWvUtSrQpOnMlKjIhGfEdCbA987654?usp=sharing';
  assert.equal(extractFolderId(url), '1zYxWvUtSrQpOnMlKjIhGfEdCbA987654');
});

test('extractFolderId: parses drive url with query param id', () => {
  const url = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz098765';
  assert.equal(extractFolderId(url), '1AbCdEfGhIjKlMnOpQrStUvWxYz098765');
});
