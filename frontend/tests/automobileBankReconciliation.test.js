import assert from 'node:assert/strict';
import test from 'node:test';
import { reconciliationPayload, reconciliationRows, reconciliationTotals } from '../src/features/categories/automobile/automobileBankReconciliation.js';

const entries = [
  { _id: 'ob', vchType: 'OB', date: '2026-10-01', balance: 1000 },
  { _id: 'a', vchNo: 'BR-001', vchType: 'Deposit', date: '2026-10-02', deposit: 100, withdrawal: 0, reconciled: true, bankDate: '2026-10-03', particulars: 'Customer receipt' },
  { _id: 'b', vchNo: 'BP-001', vchType: 'Withdrawal', date: '2026-10-05', deposit: 0, withdrawal: 40, reconciled: false, particulars: 'Rent payment' },
  { _id: 'cb', vchType: 'CB', date: '2026-10-31', balance: 1060 },
  { _id: 'future', vchNo: 'BR-002', vchType: 'Deposit', date: '2026-11-01', deposit: 999, withdrawal: 0 },
];
const filters = { from: '2026-10-01', to: '2026-10-31', status: '', search: '' };
test('reconciliation rows exclude balance snapshots and respect the book period', () => {
  assert.deepEqual(reconciliationRows(entries, {}, filters).map((row) => row._id), ['a', 'b']);
});
test('working changes update status and reference filters without mutating saved records', () => {
  const before = structuredClone(entries);
  const changes = { b: { reconciled: true, bankDate: '2026-10-06', bankReference: 'RENT-001', reconciliationNotes: 'Reviewed' } };
  const rows = reconciliationRows(entries, changes, { ...filters, status: 'cleared', search: 'rent-001' });
  assert.equal(rows.length, 1); assert.equal(rows[0]._id, 'b'); assert.equal(rows[0].withdrawal, 40);
  assert.deepEqual(entries, before);
});
test('summary distinguishes gross cleared/uncleared amounts from net outstanding movement', () => {
  assert.deepEqual(reconciliationTotals(reconciliationRows(entries, {}, filters)), { cleared: 1, uncleared: 1, credits: 100, debits: 40, clearedAmount: 100, unclearedAmount: 40, outstandingNet: -40 });
});
test('cleared entries require bank dates and payloads contain only reconciliation fields', () => {
  assert.throws(() => reconciliationPayload({ vchNo: 'BR-001', reconciled: true }), /bank date/);
  assert.deepEqual(reconciliationPayload({ ...entries[1], bankReference: ' REF ', reconciliationNotes: ' Checked ' }), { reconciled: true, bankDate: '2026-10-03', bankReference: 'REF', reconciliationNotes: 'Checked' });
});
test('unclearing removes the bank date and reference while retaining notes', () => {
  assert.deepEqual(reconciliationPayload({ ...entries[1], reconciled: false, bankReference: 'REF', reconciliationNotes: 'Reopened' }), { reconciled: false, bankDate: '', bankReference: '', reconciliationNotes: 'Reopened' });
});
test('empty and fractional summaries avoid false differences', () => {
  assert.equal(reconciliationTotals([]).outstandingNet, 0);
  assert.equal(reconciliationTotals([{ deposit: 0.1 }, { deposit: 0.2 }, { withdrawal: 0.3 }]).outstandingNet, 0);
});
