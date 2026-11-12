import test from 'node:test';
import assert from 'node:assert/strict';
import { filterReconciliation, importReconciliationCsv, matchReconciliation, parseReconciliationCsv, reconciliationSummary } from '../src/features/categories/automobile/automobileGstReconciliation.js';

const entries = [
  { invoiceNo: 'P1', gstin: 'GST-A', supplier: 'Parts One', branch: 'Main', itcBooks: 100, itcGstr2b: 0, resolution: 'none' },
  { invoiceNo: 'P1', gstin: 'GST-B', supplier: 'Parts Two', branch: 'North', itcBooks: 200, itcGstr2b: 0, resolution: 'none' },
];
test('CSV import matches supplier GSTIN and invoice together', () => {
  const result = importReconciliationCsv(entries, 'invoiceNo,gstin,itcGstr2b\nP1,GST-B,200', 'October 2026');
  assert.equal(result.imported, 1);
  assert.equal(result.entries[0].itcGstr2b, 0);
  assert.equal(result.entries[1].itcGstr2b, 200);
  assert.equal(result.entries[1].status, 'matched');
});
test('recorded zero statement ITC is a difference, not a missing statement row', () => {
  const result = importReconciliationCsv(entries, 'invoiceNo,gstin,itcGstr2b\nP1,GST-A,0', 'October 2026');
  assert.equal(result.entries[0].status, 'mismatch');
  assert.equal(result.entries[0].statementRecorded, true);
});
test('CSV parser handles BOM, quoted commas and Windows newlines', () => {
  const records = parseReconciliationCsv('\uFEFFinvoiceNo,gstin,itcGstr2b\r\n"P,1",GST-A,"1,200.50"\r\n');
  assert.equal(records[0].invoiceno, 'P,1');
  assert.equal(records[0].itcgstr2b, '1,200.50');
});
test('ambiguous and unmatched purchases are reported without modifying amounts', () => {
  const result = importReconciliationCsv([entries[0], { ...entries[0] }], 'invoiceNo,gstin,itcGstr2b\nP1,GST-A,100\nP9,GST-C,100', 'October 2026');
  assert.equal(result.imported, 0);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.entries[0].itcGstr2b, 0);
});
test('invalid amounts, duplicate statement rows and mismatched periods reject imports', () => {
  assert.throws(() => importReconciliationCsv(entries, 'invoiceNo,gstin,itcGstr2b\nP1,GST-A,-2', 'October 2026'), /Invalid/);
  assert.throws(() => importReconciliationCsv(entries, 'invoiceNo,gstin,itcGstr2b\nP1,GST-A,1\nP1,GST-A,2', 'October 2026'), /Duplicate/);
  assert.throws(() => importReconciliationCsv(entries, 'invoiceNo,gstin,itcGstr2b,period\nP1,GST-A,1,September 2026', 'October 2026'), /period/);
});
test('summary keeps review completion separate from numerical matching', () => {
  const rows = matchReconciliation([{ ...entries[0], itcGstr2b: 100 }, { ...entries[1], resolution: 'accepted' }]);
  const summary = reconciliationSummary(rows);
  assert.equal(summary.completion, 50);
  assert.equal(summary.pending.length, 0);
  assert.equal(summary.missing.length, 1);
  assert.equal(summary.risk, 200);
});
test('filters combine branch, invoice search, supplier and exception status', () => {
  const rows = matchReconciliation(entries);
  assert.equal(filterReconciliation(rows, { branch: 'North', party: 'two', search: 'P1', unmatched: true }).length, 1);
  assert.equal(filterReconciliation(rows, { status: 'matched' }).length, 0);
});
