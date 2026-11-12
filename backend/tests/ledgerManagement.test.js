import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLedgerStatement, canonicalLedgerGroup, ledgerCategory, ledgerOutstanding, ledgerPayload, ledgerPeriodBounds } from '../src/services/ledgerManagement.js';

const ledger = { name: 'Customer', group: 'Sundry Debtors', opening: -100 };
const voucher = (id, date, side, amount, status = 'Posted', extra = {}) => ({ _id: id, voucherNo: id, voucherType: 'Journal', date, status, financialYear: date < '2026-04-01' ? '2025-26' : '2026-27', lines: [{ _id: `${id}-line`, ledgerName: 'Customer', side, amount }, { ledgerName: 'Bank', side: side === 'debit' ? 'credit' : 'debit', amount }], ...extra });

test('statement opening carries earlier posted movements and handles both Dr/Cr transitions', () => {
  const vouchers = [voucher('prior', '2026-03-31', 'debit', 150), voucher('payment', '2026-04-02', 'credit', 100), voucher('receipt', '2026-04-03', 'debit', 80), voucher('draft', '2026-04-01', 'debit', 900, 'Draft'), voucher('cancelled', '2026-04-01', 'credit', 900, 'Cancelled'), voucher('future', '2027-04-01', 'debit', 900)];
  const result = buildLedgerStatement(ledger, vouchers, ledgerPeriodBounds({ financialYear: '2026-27' }));
  assert.deepEqual(result.totals, { opening: 50, debitTotal: 80, creditTotal: 100, closing: 30 });
  assert.deepEqual(result.entries.map((entry) => entry.balance), [-50, 30]);
  assert.deepEqual(result.entries.map((entry) => entry.voucherId), ['payment', 'receipt']);
  assert.equal(result.ledger.opening, 50);
  assert.equal(result.ledger.masterOpening, -100);
});

test('date windows without movements retain their carried balance', () => {
  const result = buildLedgerStatement(ledger, [voucher('prior', '2026-03-31', 'debit', 150)], { from: '2026-05-01', to: '2026-05-31' });
  assert.deepEqual(result.totals, { opening: 50, debitTotal: 0, creditTotal: 0, closing: 50 });
  assert.deepEqual(result.entries, []);
});

test('financial-year boundaries follow company settings and reject invalid dates and windows', () => {
  assert.deepEqual(ledgerPeriodBounds({ financialYear: '2026-27' }, '15 July'), { from: '2026-07-15', to: '2027-07-14', financialYear: '2026-27' });
  for (const query of [{ from: '2026-02-30' }, { from: '2026-05-02', to: '2026-05-01' }, { financialYear: '2026-28' }, { financialYear: '2026-27', from: '2026-03-31' }]) assert.throws(() => ledgerPeriodBounds(query));
});

test('ledger payload maps customer/supplier groups and rejects counter injection and invalid credit/tax data', () => {
  assert.equal(canonicalLedgerGroup('Customer'), 'Sundry Debtors');
  assert.equal(canonicalLedgerGroup('supplier'), 'Sundry Creditors');
  assert.equal(ledgerCategory('Customer'), 'Customer');
  assert.equal(ledgerPayload({ name: 'Supplier', group: 'Supplier', opening: -50 }).group, 'Sundry Creditors');
  for (const patch of [{ debit: 100 }, { opening: Infinity }, { gstin: 'invalid' }, { creditLimit: -1 }, { creditDays: 1.5 }, { active: 'false' }, { email: 'invalid' }]) assert.throws(() => ledgerPayload({ name: 'Test', group: 'Bank Accounts', ...patch }));
  assert.equal(ledgerPayload({ creditDays: null }, ledger).creditDays, null);
  assert.deepEqual(ledgerPayload({ debit: 100, credit: 20, auditHistory: ['forged'], userId: 'foreign' }, { ...ledger, debit: 100, credit: 20 }), {});
});

test('outstanding includes multiple partial allocations, advances and on-account entries with real due dates', () => {
  const bills = [voucher('bill-1', '2026-04-01', 'debit', 100), voucher('bill-2', '2026-04-02', 'debit', 200)];
  bills[0].lines[0].allocations = [{ type: 'New Reference', reference: 'INV-1', amount: 100 }];
  bills[1].lines[0].allocations = [{ type: 'New Reference', reference: 'INV-2', amount: 200 }];
  const receipt = voucher('receipt', '2026-04-05', 'credit', 150);
  receipt.lines[0].allocations = [{ type: 'Against Reference', reference: 'INV-1', amount: 50 }, { type: 'Against Reference', reference: 'INV-2', amount: 100 }];
  const result = ledgerOutstanding([...bills, receipt, voucher('ignored', '2026-04-05', 'debit', 900, 'Draft')], 'Customer', '2026-05-01', 15);
  assert.deepEqual(result.map((bill) => [bill.reference, bill.outstanding, bill.side, bill.dueDate, bill.overdue]), [['INV-1', 50, 'Dr', '2026-04-16', true], ['INV-2', 100, 'Dr', '2026-04-17', true]]);
});

test('reconciliation and expandable details retain source identities and the full balanced entry', () => {
  const bank = { name: 'Bank', group: 'Bank Accounts', opening: 0 };
  const posted = voucher('bank-voucher', '2026-04-01', 'credit', 100, 'Posted', { bankReconciliations: [{ bank: 'Bank', reconciled: true, bankReference: 'UTR-1', bankDate: '2026-04-02' }] });
  const result = buildLedgerStatement(bank, [posted]);
  assert.equal(result.entries[0].reconciled, true);
  assert.equal(result.entries[0].bankReference, 'UTR-1');
  assert.equal(result.entries[0].lines.length, 2);
  assert.equal(result.entries[0].voucherId, 'bank-voucher');
});
