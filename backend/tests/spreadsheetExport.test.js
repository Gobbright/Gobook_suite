import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createSpreadsheet, exportDateRange, exportTables, recordInExportCategory, recordInExportRange, sanitizeExportValue } from '../src/modules/data-management/spreadsheetExport.js';

test('export ranges reject impossible dates and reversed ranges', () => {
  assert.equal(exportDateRange('', ''), null);
  assert.deepEqual(exportDateRange('2024-02-29', ''), { from: '2024-02-29', to: '' });
  assert.throws(() => exportDateRange('2026-02-30', ''), { statusCode: 400 });
  assert.throws(() => exportDateRange('2026-15-01', ''), { statusCode: 400 });
  assert.throws(() => exportDateRange('2026-10-25', '2026-10-24'), { statusCode: 400 });
});
test('business dates take precedence over creation dates and date bounds are inclusive in India', () => {
  const range = exportDateRange('2026-10-24', '2026-10-24');
  assert.equal(recordInExportRange({ meta: { date: '2026-10-23' }, createdAt: '2026-10-24' }, { key: 'invoices', dateFields: ['meta.date', 'createdAt'] }, range), false);
  assert.equal(recordInExportRange({ createdAt: new Date('2026-10-23T20:00:00Z') }, { dateFields: ['createdAt'] }, range), true);
  assert.equal(recordInExportRange({ from: '2026-10-24', createdAt: '2026-10-20' }, { key: 'leaves', dateFields: ['fromDate', 'createdAt'] }, range), true);
  assert.equal(recordInExportRange({ month: '2026-10' }, { dateFields: ['month'] }, exportDateRange('2026-10-01', '2026-10-31')), true);
});
test('sales and purchase exports partition billing documents and online scope excludes unrelated module records', () => {
  assert.equal(recordInExportCategory({ documentType: 'purchase-entry' }, 'invoices', 'sales'), false);
  assert.equal(recordInExportCategory({ documentType: 'purchase-entry' }, 'invoices', 'purchase'), true);
  assert.equal(recordInExportCategory({ documentType: 'invoice' }, 'invoices', 'purchase'), false);
  assert.equal(recordInExportCategory({ moduleKey: 'automobile/job-cards' }, 'moduleRecords', 'online'), false);
  assert.equal(recordInExportCategory({ moduleKey: 'retail/online-store/orders' }, 'moduleRecords', 'online'), true);
});
test('spreadsheet serialization removes nested credentials and protects formula-like values', () => {
  const input = { name: '=HYPERLINK("bad")', loginPassword: 'private', data: { password: 'secret', accessToken: 'token', visible: 'ok' }, list: [{ passwordHash: 'hash', phone: '123' }] };
  const clean = sanitizeExportValue(input);
  assert.equal(clean.loginPassword, undefined); assert.deepEqual(clean.data, { visible: 'ok' }); assert.deepEqual(clean.list, [{ phone: '123' }]);
  const table = exportTables({ employees: [input] })[0];
  assert.equal(table.fields.includes('loginPassword'), false); assert.equal(table.rows[0][table.fields.indexOf('name')].startsWith("'="), true);
});
test('CSV supports multiple collections, escaped quotes, nested values and zero amounts', async () => {
  const csv = (await createSpreadsheet({ customers: [{ name: 'A "quoted" name', amount: 0, address: { city: 'Chennai' } }], products: [{ description: 'Filter' }] }, 'csv')).toString('utf8');
  assert.ok(csv.includes('"Collection"')); assert.ok(csv.includes('"customers"')); assert.ok(csv.includes('A ""quoted"" name')); assert.ok(csv.includes('"0"')); assert.ok(csv.includes('Chennai')); assert.ok(csv.includes('"products"'));
});
test('Excel output is a readable workbook with separate collection sheets and no credential columns', async () => {
  const buffer = await createSpreadsheet({ customers: [{ name: 'Arun', password: 'hidden' }], products: [{ description: 'Oil Filter', stock: 0 }] }, 'xlsx');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 2); assert.equal(workbook.worksheets[0].getCell('A1').value, 'name'); assert.equal(workbook.worksheets[0].getCell('A2').value, 'Arun');
  assert.equal(workbook.worksheets[1].getCell('B2').value, '0');
});
