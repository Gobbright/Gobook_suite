import assert from 'node:assert/strict';
import test from 'node:test';
import { journalError, journalForm, journalHistory, journalPayload, journalTotals } from '../src/features/categories/automobile/automobileJournals.js';

const accounts = [{ _id: 'supplier', name: 'Shree Auto Parts', group: 'Sundry Creditors' }, { _id: 'bank', name: 'Bank', group: 'Bank Accounts' }];
const form = { voucherNo: 'JRN-26-27-00001', date: '2026-10-22', branch: 'Main', referenceNo: ' TRF-001 ', narration: ' Payment to supplier ', lines: [
  { key: 'one', ledgerName: 'Shree Auto Parts', debit: '125000', credit: '', costCenter: 'Main', narration: 'Vendor payment' },
  { key: 'two', ledgerName: 'Bank', debit: '', credit: '125000', costCenter: '', narration: 'Bank transfer' },
] };
test('journal totals calculate both sides and round currency without false imbalance', () => {
  assert.deepEqual(journalTotals(form.lines), { debit: 125000, credit: 125000, difference: 0, balanced: true });
  assert.equal(journalTotals([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }]).balanced, true);
  assert.equal(journalTotals([]).balanced, false);
});
test('posting requires balance while an unbalanced draft can be saved', () => {
  const draft = structuredClone(form); draft.lines[1].credit = 100000;
  assert.match(journalError(draft, accounts, 'Posted'), /totals must match/);
  assert.equal(journalError(draft, accounts, 'Draft'), '');
  assert.equal(journalError(form, accounts, 'Posted'), '');
});
test('incomplete, invalid and double-sided lines cannot silently disappear on save', () => {
  for (const changes of [{ ledgerName: '' }, { debit: 0 }, { credit: 5 }, { debit: -1 }, { debit: 'invalid' }, { debit: '1.001' }]) {
    const invalid = structuredClone(form); Object.assign(invalid.lines[0], changes);
    assert.ok(journalError(invalid, accounts, 'Draft'));
  }
  assert.ok(journalError({ ...form, narration: ' ' }, accounts, 'Posted'));
  assert.ok(journalError({ ...form, lines: [form.lines[0]] }, accounts, 'Posted'));
});
test('journal payload saves real account IDs and one amount per line', () => {
  const payload = journalPayload(form, accounts, 'Posted');
  assert.equal(payload.voucherType, 'Journal'); assert.equal(payload.status, 'Posted');
  assert.equal(payload.referenceNo, 'TRF-001'); assert.equal(payload.narration, 'Payment to supplier');
  assert.deepEqual(payload.lines.map((line) => [line.ledgerId, line.ledgerGroup, line.side, line.amount]), [['supplier', 'Sundry Creditors', 'debit', 125000], ['bank', 'Bank Accounts', 'credit', 125000]]);
  assert.equal('key' in payload.lines[0], false);
});
test('draft editing preserves line references, amounts and remarks', () => {
  const voucher = { ...journalPayload(form, accounts, 'Draft'), lines: journalPayload(form, accounts, 'Draft').lines.map((line) => ({ ...line, billRef: 'BILL-001' })) };
  const restored = journalForm(voucher);
  assert.equal(journalError(restored, accounts, 'Posted'), '');
  assert.deepEqual(journalPayload(restored, accounts, 'Draft'), voucher);
});
test('history keeps legacy entries and removes duplicate voucher numbers', () => {
  const rows = journalHistory([{ _id: 'new', voucherNo: 'JV-001', date: '2026-10-22' }], [{ _id: 'old', entryNo: 'JV-001', date: '2026-10-22' }, { _id: 'legacy', entryNo: 'JE-001', date: '2026-10-20', particulars: 'Old journal' }]);
  assert.equal(rows.length, 2); assert.equal(rows[1].legacy, true); assert.equal(rows[1].narration, 'Old journal');
});

test('same journal numbers in other periods or owner accounts do not hide historical entries', () => {
  const history = journalHistory([{ _id: 'current', userId: 'owner-1', voucherNo: 'MANUAL-1', date: '2026-11-10' }], [{ _id: 'prior', userId: 'owner-1', entryNo: 'MANUAL-1', date: '2025-11-10' }, { _id: 'other', userId: 'owner-2', entryNo: 'MANUAL-1', date: '2026-11-10' }]);
  assert.equal(history.length, 3);
});
