import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePagination, paginated } from '../src/utils/pagination.js';

test('paginación usa 20 registros por defecto', () => {
  assert.deepEqual(normalizePagination(), { page: 1, limit: 20, skip: 0 });
});

test('paginación calcula skip y limita a 100', () => {
  assert.deepEqual(normalizePagination({ page: 3, limit: 25 }), { page: 3, limit: 25, skip: 50 });
  assert.throws(() => normalizePagination({ limit: 101 }), /entre 1 y 100/);
});

test('resultado paginado incluye totales', () => {
  assert.deepEqual(paginated([1, 2], 42, 2, 20), {
    data: [1, 2], pagination: { page: 2, limit: 20, total: 42, totalPages: 3 }
  });
});
