import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGstr1Documents, gstr1Documents, gstr1RateSummary, gstinStatus, isCredit, validateGstr1 } from '../src/features/categories/automobile/automobileGstr1.js';

const gstin = '33AAACT1234A1Z5';
const invoice = { sourceId: 'one', documentType: 'invoice', invoiceNo: 'INV-1', date: '2026-10-10', name: 'Auto Parts', gstin, state: 'Tamil Nadu', branch: 'Main', taxable: 1000, cgst: 90, sgst: 90, igst: 0, rate: 18 };

test('source documents preserve note signs and source identity', () => {
  const rows = gstr1Documents({ sourceDocuments: [invoice, { ...invoice, sourceId: 'two', documentType: 'credit-note', invoiceNo: 'CN-1', taxable: -100 }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sourceId, 'one');
  assert.equal(rows[1].taxable, -100);
  assert.ok(isCredit(rows[1]));
  assert.notEqual(rows[0].key, rows[1].key);
});

test('branch, document type, GSTIN format and search filters compose', () => {
  const rows = gstr1Documents({ sourceDocuments: [invoice, { ...invoice, sourceId: 'other', branch: 'North' }, { ...invoice, sourceId: 'bad', gstin: 'bad' }] });
  assert.equal(filterGstr1Documents(rows, { branch: 'Main', type: 'invoice', gstin: 'Format valid', search: 'auto' }).length, 1);
  assert.equal(gstinStatus({ gstin: '' }), 'Unregistered');
  assert.equal(gstinStatus({ gstin: 'bad' }), 'Invalid format');
});

test('rate summary uses individual rates and nets credit notes once', () => {
  const rates = gstr1RateSummary([
    { rateRows: [{ rate: 18, taxable: 1000, cgst: 90, sgst: 90 }, { rate: 5, taxable: 500, cgst: 12.5, sgst: 12.5 }] },
    { rateRows: [{ rate: 18, taxable: -100, cgst: -9, sgst: -9 }] },
  ]);
  assert.deepEqual(rates.map((row) => [row.rate, row.taxable, row.cgst + row.sgst]), [[5, 500, 25], [18, 900, 162]]);
});

test('local validation reports invalid identity, missing supply, date and HSN separately', () => {
  const rows = gstr1Documents({ sourceDocuments: [{ ...invoice, gstin: 'bad', state: '', date: '2026-09-30', missingHsn: 1 }] });
  const issues = validateGstr1(rows, 'October 2026', gstin);
  assert.equal(issues.length, 4);
  assert.equal(issues.filter((issue) => issue.blocking).length, 3);
  assert.equal(issues.filter((issue) => !issue.blocking).length, 1);
});

test('valid source passes local checks without claiming registration verification', () => {
  const rows = gstr1Documents({ sourceDocuments: [invoice] });
  assert.deepEqual(validateGstr1(rows, 'October 2026', gstin), []);
  assert.equal(gstinStatus(invoice), 'Format valid');
});

test('saved return fallback separates credit notes and permits B2C aggregates without invoice dates', () => {
  const rows = gstr1Documents({ b2b: [invoice], b2cs: [{ state: 'Tamil Nadu', rate: 18, taxable: 500 }], cdnr: [{ noteNo: 'CN-1', noteDate: '2026-10-10', noteType: 'Credit Note', taxable: 100, cgst: 9, sgst: 9 }] });
  assert.equal(rows[2].taxable, -100);
  assert.equal(rows[2].cgst, -9);
  assert.ok(!validateGstr1([rows[1]], 'October 2026', gstin).length);
});

test('duplicate document numbers and missing business GSTIN block review readiness', () => {
  const rows = gstr1Documents({ sourceDocuments: [invoice, { ...invoice, sourceId: 'two' }] });
  const issues = validateGstr1(rows, 'October 2026', '');
  assert.equal(issues.filter((issue) => issue.blocking).length, 2);
});
