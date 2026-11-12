import test from 'node:test';
import assert from 'node:assert/strict';
import { annualSummary } from '../src/features/categories/automobile/automobileGstr9.js';

const data = {
  gstin: '33AAACT1234A1Z5',
  table4: [{ sno: '4A', taxable: 100 }, { sno: '4B', taxable: 900 }, { sno: '4G', taxable: 50 }, { sno: '4I', taxable: 100 }],
  table6: [{ sno: '6A', cgst: 50, sgst: 50 }, { sno: '6B', cgst: 50, sgst: 50 }],
  table7: [{ cgst: 10, sgst: 10 }],
  table9: [{ cgst: 90, sgst: 90 }, { cgst: 40, sgst: 40 }, { cgst: 50, sgst: 50 }],
  annualDetails: { invoiceCount: 2, purchaseCount: 1, inwardRows: [{ taxable: 500 }], monthly: [{ period: 'October 2026', difference: 0 }] },
};

test('annual ITC excludes control-total duplication and subtracts reversals once', () => {
  const summary = annualSummary(data);
  assert.equal(summary.available, 100);
  assert.equal(summary.reversal, 20);
  assert.equal(summary.eligible, 80);
});

test('outward subtotal does not add notes again or classify RCM as outward sales', () => {
  const summary = annualSummary(data);
  assert.equal(summary.outwardTotal, 1000);
  assert.equal(summary.inward, 500);
  assert.equal(summary.liability, 180);
});

test('source differences and invalid GSTIN reduce local preparation progress', () => {
  const summary = annualSummary({ ...data, gstin: '', annualDetails: { ...data.annualDetails, monthly: [{ period: 'October 2026', difference: 25 }] } });
  assert.equal(summary.exceptions.length, 1);
  assert.equal(summary.issues.length, 1);
  assert.ok(summary.progress < 100);
});

test('empty annual sources never indicate a completed return', () => {
  assert.equal(annualSummary().progress, 0);
  assert.equal(annualSummary({ ...data, annualDetails: { monthly: [], invoiceCount: 0, purchaseCount: 0 } }).progress, 0);
});

test('available local checks can pass while progress remains explicitly local', () => {
  const summary = annualSummary(data);
  assert.equal(summary.progress, 100);
  assert.deepEqual(summary.issues, []);
});
