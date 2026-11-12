import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceActionIds, invoicePaymentSummary } from '../src/utils/invoicePayment.js';
const today = '2026-10-29';
test('payment status uses recorded balances instead of stale status text', () => {
  assert.equal(invoicePaymentSummary({ balance: 0, payStatus: 'Overdue' }, 100, today).paymentStatus, 'Paid');
  assert.equal(invoicePaymentSummary({ balance: 100, payStatus: 'Paid', meta: { dueDate: '2026-10-28' } }, 100, today).paymentStatus, 'Overdue');
});
test('partial payments match server precedence and due-today invoices are not overdue', () => {
  assert.equal(invoicePaymentSummary({ totalPaid: 20, balance: 80, meta: { dueDate: '2026-10-01' } }, 100, today).paymentStatus, 'Partial');
  assert.equal(invoicePaymentSummary({ meta: { dueDate: today } }, 100, today).paymentStatus, 'Unpaid');
  assert.equal(invoicePaymentSummary({ advanceReceived: 20 }, 100, today).paymentStatus, 'Partial');
});
test('drafts and cancelled invoices never claim settlement or an outstanding balance', () => {
  for (const lifecycleStatus of ['draft', 'cancelled']) {
    const payment = invoicePaymentSummary({ lifecycleStatus, payStatus: 'Paid', balance: 100 }, 100, today);
    assert.equal(payment.balanceDue, 0);
    assert.equal(payment.paymentStatus.toLowerCase(), lifecycleStatus);
  }
});
test('zero totals and credit-adjusted server balances stay settled', () => {
  assert.equal(invoicePaymentSummary({}, 0, today).paymentStatus, 'Paid');
  assert.equal(invoicePaymentSummary({ totalCredits: 100 }, 100, today).paymentStatus, 'Paid');
  assert.equal(invoicePaymentSummary({ totalPaid: 20, balance: 50 }, 100, today).balanceDue, 50);
});
test('actions allow draft and posted mutations, with payments only for posted balances', () => {
  const draft = invoiceActionIds({ lifecycleStatus: 'draft', balanceDue: 100 });
  assert.ok(draft.includes('edit') && draft.includes('delete'));
  assert.equal(draft.includes('payment'), false);
  for (const invoice of [{ lifecycleStatus: 'cancelled', balanceDue: 100 }]) {
    const ids = invoiceActionIds(invoice);
    assert.equal(ids.includes('payment') || ids.includes('edit') || ids.includes('delete'), false);
    assert.ok(ids.includes('view') && ids.includes('pdf') && ids.includes('share'));
  }
  assert.equal(invoiceActionIds({ lifecycleStatus: 'posted', balanceDue: 100 }).includes('payment'), true);
  for (const invoice of [{ lifecycleStatus: 'posted', balanceDue: 0 }, { balanceDue: 100 }]) {
    const ids = invoiceActionIds(invoice);
    assert.ok(ids.includes('edit') && ids.includes('delete'));
  }
});
