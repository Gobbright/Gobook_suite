import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import express from 'express';
import { once } from 'node:events';
import { extractHsnSacCatalog } from '../scripts/importHsnSacCatalog.js';
import { loadHsnSacCatalog, searchHsnSacCatalog } from '../src/services/hsnSacCatalog.js';
import { referenceRouter } from '../src/modules/reference/routes.js';

function workbookWithRows(hsnRows, sacRows = [['995411', 'Residential construction']]) {
  const workbook = new ExcelJS.Workbook();
  for (const [type, rows] of [['HSN', hsnRows], ['SAC', sacRows]]) {
    const sheet = workbook.addWorksheet(`${type}_MSTR`);
    sheet.addRow([`${type}_CD`, `${type}_Description`]);
    sheet.addRows(rows);
  }
  return workbook;
}

test('workbook import preserves zeros and merges spaced duplicates without losing descriptions', () => {
  const catalog = extractHsnSacCatalog(workbookWithRows([
    ['0101', 'Live horses'], ['2307 00', 'Wine lees and argol'], ['230700', 'Wine lees'], ['30559', 'Source review'],
  ]));
  assert.equal(catalog.counts.total, 4);
  assert.equal(catalog.counts.duplicateRows, 1);
  assert.equal(catalog.counts.needsReview, 1);
  assert.equal(catalog.entries[0].code, '0101');
  assert.deepEqual(catalog.entries.find((entry) => entry.code === '230700').alternateDescriptions, ['Wine lees and argol']);
  assert.equal(catalog.entries.find((entry) => entry.code === '30559').needsReview, true);
});

test('invalid workbook structure or rows fail validation rather than silently omitting data', () => {
  assert.throws(() => extractHsnSacCatalog(new ExcelJS.Workbook()), /Missing HSN/);
  assert.throws(() => extractHsnSacCatalog(workbookWithRows([['not a code', 'Description']])), /Invalid HSN record/);
  assert.throws(() => extractHsnSacCatalog(workbookWithRows([['0101', '']])), /Invalid HSN record/);
});

test('bundled catalog contains the actual supplied records with unique string codes', async () => {
  const catalog = await loadHsnSacCatalog();
  assert.equal(catalog.counts.HSN, 21933);
  assert.equal(catalog.counts.SAC, 681);
  assert.equal(catalog.entries.length, 22614);
  assert.equal(new Set(catalog.entries.map((entry) => `${entry.type}:${entry.code}`)).size, 22614);
  assert.match(catalog.sha256, /^[a-f0-9]{64}$/);
  assert.equal(catalog.entries.filter((entry) => entry.needsReview).length, 5);
  assert.strictEqual(await loadHsnSacCatalog(), catalog);
});

test('catalog supports bounded prefix and multi-word description searches, type filtering and aliases', async () => {
  const catalog = await loadHsnSacCatalog();
  const prefix = searchHsnSacCatalog(catalog, { q: '01', limit: '3', type: 'HSN' });
  assert.equal(prefix.data.length, 3);
  assert.equal(prefix.hasMore, true);
  assert.equal(prefix.data[0].code, '01');
  assert.ok(prefix.data.every((entry) => entry.code.startsWith('01') && entry.type === 'HSN'));
  assert.ok(prefix.data.every((entry) => !('searchText' in entry) && !('gstRate' in entry)));
  const services = searchHsnSacCatalog(catalog, { q: 'residential construction', type: 'SAC' });
  assert.ok(services.data.some((entry) => entry.code === '995411'));
  assert.ok(services.data.every((entry) => entry.type === 'SAC'));
  assert.equal(searchHsnSacCatalog(catalog, { q: '2307 00' }).data[0].code, '230700');
  assert.ok(searchHsnSacCatalog(catalog, { q: 'argol' }).data.some((entry) => entry.code === '230700'));
  assert.equal(searchHsnSacCatalog(catalog, { q: '01', limit: 10000 }).data.length, 50);
  assert.deepEqual(searchHsnSacCatalog(catalog, { q: '0' }).data, []);
  assert.deepEqual(searchHsnSacCatalog(catalog, { q: 'not-a-real-hsn-description' }).data, []);
});

test('invalid search parameters cannot become unbounded searches or executable regex', async () => {
  const catalog = await loadHsnSacCatalog();
  for (const params of [{ q: {} }, { q: 'x'.repeat(101) }, { type: 'wrong' }, { limit: 'NaN' }, { limit: 0 }, { limit: ['20'] }]) {
    assert.throws(() => searchHsnSacCatalog(catalog, params), (error) => error.statusCode === 400);
  }
  assert.deepEqual(searchHsnSacCatalog(catalog, { q: '.*' }).data, []);
});

test('reference HTTP endpoint returns actual limited records and actionable validation errors', async () => {
  const app = express();
  app.use('/api/reference', referenceRouter);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/reference/hsn-sac`;
    const response = await fetch(`${base}?q=0101&limit=2`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data[0].code, '0101');
    assert.equal(result.data.length, 2);
    assert.equal(result.counts.total, 22614);
    assert.equal((await fetch(`${base}?type=invalid`)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
