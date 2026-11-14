import test from 'node:test';
import assert from 'node:assert/strict';
import { filterReconciliation, importReconciliationCsv, matchReconciliation, parseReconciliationCsv, reconciliationSummary, parseWorkspaceImport, filterWorkspace } from '../src/features/categories/automobile/automobileGstReconciliation.js';

const entries = [
  { invoiceNo: 'P1', gstin: 'GST-A', supplier: 'Parts One', branch: 'Main', itcBooks: 100, itcGstr2b: 0, resolution: 'none' },
  { invoiceNo: 'P1', gstin: 'GST-B', supplier: 'Parts Two', branch: 'North', itcBooks: 200, itcGstr2b: 0, resolution: 'none' },
];
test('workspace import retains statement-only rows, duplicates, explicit zero and unknown fields', () => {
  const rows = parseWorkspaceImport('invoiceNo,gstin,date,taxable,gst\nP1,GST-A,2026-11-03,1000,180\nP9,GST-B,,,0\nP9,GST-B,,,0');
  assert.equal(rows.length, 3); assert.equal(rows[1].gst, 0); assert.equal(rows[1].taxable, null);
  assert.equal(rows[1].statementEligibility, 'unknown');
  assert.throws(() => parseWorkspaceImport('invoiceNo,gstin,gst\nP1,GST-A,invalid'), /invalid numeric/);
});
test('workspace normalized JSON imports and filters cover review and eligibility separately', () => {
  assert.equal(parseWorkspaceImport('[{"invoiceNo":"P1","gstin":"GST-A","gst":180}]', 'statement.json')[0].gst, 180);
  assert.throws(() => parseWorkspaceImport('{"data":{"docdata":{}}}', 'raw.json'), /Raw portal JSON/);
  const rows = [{ id: 'b:1', book: { invoiceNo: 'P1', supplier: 'Parts One', gstin: 'GST-A' }, portal: null, status: 'not_in_2b', eligibility: 'review', resolution: 'none', gstDifference: 180, taxableDifference: 1000, duplicate: true }];
  assert.equal(filterWorkspace(rows, { search: 'Parts', status: 'not_in_2b', eligibility: 'review', difference: '900', duplicates: true }).length, 1);
  assert.equal(filterWorkspace(rows, { resolution: 'accepted' }).length, 0);
});
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
