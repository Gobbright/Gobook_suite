import test from 'node:test';
import assert from 'node:assert/strict';
import { journalEntryError, journalLedgerOption } from '../src/features/categories/common/modules/accounting/journalEntryRules.js';

const ledgers = [{ _id: 'rent', name: 'Rent', group: 'Expenses', currentBalance: -1234.5 }, { _id: 'bank', name: 'Bank', group: 'Bank Accounts' }, { name: 'Inactive', active: false }];
const form = { date: '2026-11-10', financialYear: '2026-27', lines: [{ ledgerName: 'Rent', side: 'debit', amount: '100' }, { ledgerName: 'Bank', side: 'credit', amount: '100' }, { ledgerName: '', amount: '', narration: '' }] };
test('posting requires active distinct ledgers, valid positive amounts and balanced lines', () => {
  assert.equal(journalEntryError(form, ledgers), '');
  assert.match(journalEntryError({ ...form, lines: [form.lines[0]] }, ledgers), /two/);
  assert.match(journalEntryError({ ...form, lines: [form.lines[0], { ...form.lines[1], ledgerName: 'Rent' }] }, ledgers), /different/);
  assert.match(journalEntryError({ ...form, lines: [form.lines[0], { ...form.lines[1], ledgerName: 'Inactive' }] }, ledgers), /active/);
  for (const amount of [0, -1, 'NaN', 'Infinity', 100.001]) assert.match(journalEntryError({ ...form, lines: [form.lines[0], { ...form.lines[1], amount }] }, ledgers), /positive/);
  const unbalanced = { ...form, lines: [form.lines[0], { ...form.lines[1], amount: '90' }] };
  assert.match(journalEntryError(unbalanced, ledgers), /totals must match/);
  assert.equal(journalEntryError(unbalanced, ledgers, false), '');
});
test('financial dates and allocations fail before posting, including invalid calendar dates', () => {
  assert.match(journalEntryError({ ...form, date: '2026-02-30' }, ledgers), /valid journal date/);
  assert.match(journalEntryError({ ...form, date: '2026-03-31' }, ledgers), /financial year/);
  assert.equal(journalEntryError({ ...form, date: '2026-07-14', fyStart: '15 July', financialYear: '2025-26' }, ledgers), '');
  assert.match(journalEntryError({ ...form, lines: [{ ...form.lines[0], allocations: [{ type: 'New Reference', reference: 'B-1', amount: 90 }] }, form.lines[1]] }, ledgers), /allocations/);
});
test('ledger suggestions show actual projected Dr/Cr balances and searchable accounting groups', () => {
  assert.deepEqual(journalLedgerOption(ledgers[0]), { value: 'Rent', label: 'Rent', searchText: 'Rent Expenses', badge: 'Expenses · 1,234.50 Cr' });
});
