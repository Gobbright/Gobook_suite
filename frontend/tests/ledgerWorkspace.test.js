import assert from 'node:assert/strict';
import test from 'node:test';
import { filterLedgerRows, ledgerGroupName, sortLedgerRows } from '../src/features/categories/common/modules/accounting/ledgerWorkspace.js';
import { statementPeriod, ledgerClosing, ledgerType } from '../src/features/categories/automobile/automobileLedger.js';

test('ledger filters preserve real running balances while narrowing references, reconciliations and amount ranges', () => {
  const rows = [{ voucherNo: 'OPN', openingRow: true, balance: -100 }, { voucherNo: 'RCT-1', status: 'Posted', voucherType: 'Receipt', debit: 250, balance: 150, branch: 'Main', costCenter: 'Shop', allocations: [{ reference: 'BILL-1' }], reconciled: true, reconciliationApplicable: true }, { voucherNo: 'PAY-2', status: 'Posted', voucherType: 'Payment', credit: 300, balance: -150, branch: 'Main', costCenter: 'Office', reconciliationApplicable: true }];
  const result = filterLedgerRows(rows, { type: 'Receipt', reference: 'BILL-1', costCenter: 'Shop', branch: 'Main', transactionStatus: 'Reconciled', minAmount: '100', maxAmount: '250' });
  assert.equal(result.length, 2);
  assert.equal(result[1].balance, 150);
  assert.equal(sortLedgerRows(rows, 'credit', true)[0].voucherNo, 'PAY-2');
});

test('ledger group aliases and projected balances take precedence over legacy movement counters', () => {
  assert.equal(ledgerGroupName('Supplier'), 'Sundry Creditors');
  assert.equal(ledgerType({ group: 'Local Clients', accountingGroup: 'Sundry Debtors' }), 'Customers');
  assert.equal(ledgerClosing({ opening: 100, debit: 9999, currentBalance: -50 }), -50);
});

test('statement filters cannot introduce drafts or cancellations into balances', () => {
  const result = statementPeriod({ ledger: { opening: -100 }, entries: [{ date: '2026-04-01', status: 'Draft', debit: 500 }, { date: '2026-04-02', status: 'Cancelled', debit: 500 }, { date: '2026-04-03', status: 'Posted', debit: 150, billRef: 'BILL-1' }] }, { search: 'BILL-1' });
  assert.equal(result.closing, 50);
  assert.equal(result.debit, 150);
  assert.equal(result.rows.length, 1);
});
