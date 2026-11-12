import assert from 'node:assert/strict';
import test from 'node:test';
import { barcodePrintCount, barcodeStatus, lastBarcodePrint, printableBarcode } from '../src/features/categories/automobile/automobileBarcodes.js';

test('only exact supported Code 39 values are considered printable', () => {
  for (const value of ['8901234567890', 'MRF-185/65 R15', 'A.$+%/123']) assert.equal(printableBarcode(value), true);
  // Never silently normalize into a different barcode from the stored value.
  for (const value of ['', 'lowercase', 'A&B', '<script>', 'A*B', 'A'.repeat(33), '产品123']) assert.equal(printableBarcode(value), false);
  assert.equal(barcodeStatus({ barcode: '' }), 'Pending');
  assert.equal(barcodeStatus({ barcode: 'lowercase' }), 'Unsupported');
  assert.equal(barcodeStatus({ barcode: 'ABC-123' }), 'Generated');
});
test('batch printing rejects invalid codes and protects against excessive label allocation', () => {
  const rows = [{ barcode: 'TYRE-001' }, { barcode: 'FILTER-001' }];
  assert.equal(barcodePrintCount(rows, 25), 50);
  assert.equal(barcodePrintCount(rows, '2500'), 5000);
  for (const count of [0, -1, 1.5, 2501, 'bad', Infinity]) assert.equal(barcodePrintCount(rows, count), null);
  assert.equal(barcodePrintCount([], 1), null);
  assert.equal(barcodePrintCount([{ barcode: '' }], 1), null);
  assert.equal(barcodePrintCount([{ barcode: 'abc' }], 1), null);
});
test('last print activity matches the product and variant without inventing history', () => {
  const activity = [
    { at: '2026-10-21T10:00:00Z', increments: [{ id: 'tyre', variantIndex: 0, count: 2 }] },
    { at: '2026-10-22T10:00:00Z', increments: [{ id: 'tyre', variantIndex: 1, count: 3 }] },
    { at: '2026-10-22T11:00:00Z', increments: [{ id: 'filter', count: 1 }] },
  ];
  assert.equal(lastBarcodePrint({ _id: 'tyre', variantIndex: 0 }, activity), '2026-10-21T10:00:00Z');
  assert.equal(lastBarcodePrint({ _id: 'tyre', parentId: 'tyre', variantIndex: 1 }, activity), '2026-10-22T10:00:00Z');
  assert.equal(lastBarcodePrint({ _id: 'filter' }, activity), '2026-10-22T11:00:00Z');
  assert.equal(lastBarcodePrint({ _id: 'unknown' }, activity), '');
  assert.equal(lastBarcodePrint({ _id: 'tyre' }, activity), '');
});
