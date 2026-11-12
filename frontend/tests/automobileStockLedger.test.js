import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerDay, ledgerScope, movementType, normalizeLedger, stockSourceLink } from '../src/features/categories/automobile/automobileStockLedger.js';

test('all sales stock movements retain their classification and link to the source document', () => {
  for (const sourceType of ['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice']) {
    const row = { sourceType, sourceId: 'sale-id', direction: 'out' };
    assert.equal(movementType(row), 'Sales');
    assert.equal(stockSourceLink(row), `/billing/${sourceType}/sale-id/view`);
  }
  assert.equal(stockSourceLink({ sourceType: 'invoice-cancellation', sourceId: 'sale-id' }), '/billing/invoice/sale-id/view');
  assert.equal(stockSourceLink({ sourceType: 'manual', sourceId: 'manual-id' }), '');
  assert.equal(stockSourceLink({ sourceType: 'invoice' }), '');
});

const products = [{ _id: 'tyre', description: 'Tyre', code: 'TYR-001', partNumber: 'R15', barcode: '12345', warehouse: 'Main Warehouse', stock: 120 }];
const movements = [
  { _id: 'a', productId: 'tyre', productName: 'Tyre', direction: 'in', date: '2026-10-01', sourceType: 'purchase-entry', sourceNo: 'PE-001', number: 'SIN-001', qtyIn: 50, status: 'Completed' },
  { _id: 'b', productId: 'tyre', productName: 'Tyre', direction: 'out', date: '2026-10-10', sourceType: 'invoice', sourceNo: 'INV-001', number: 'SOUT-001', qtyOut: 20, status: 'Completed' },
  { _id: 'c', productId: 'tyre', productName: 'Tyre', direction: 'out', date: '2026-10-20', sourceType: '', number: 'SOUT-002', qtyOut: 10, status: 'Completed' },
];
const empty = { search: '', from: '', to: '', warehouse: '', type: '', reference: '' };
test('running balances reconstruct each product independently from current stock', () => {
  const rows = normalizeLedger(movements, products);
  assert.deepEqual(rows.map((row) => [row._id, row.balance]), [['c', 120], ['b', 130], ['a', 150]]);
  const scope = ledgerScope(rows, products, empty);
  assert.deepEqual(scope.stats, { opening: 100, closing: 120, totalIn: 50, totalOut: 30, adjustments: 1 });
  assert.equal(scope.stats.opening + scope.stats.totalIn - scope.stats.totalOut, scope.stats.closing);
});
test('date-range balances account for movements before and after the period', () => {
  const rows = normalizeLedger(movements, products);
  const scope = ledgerScope(rows, products, { ...empty, from: '2026-10-05', to: '2026-10-15' });
  assert.deepEqual(scope.rows.map((row) => row._id), ['b']);
  assert.deepEqual(scope.stats, { opening: 150, closing: 130, totalIn: 0, totalOut: 20, adjustments: 0 });
});
test('pending entries never affect stock quantities or balances', () => {
  const rows = normalizeLedger([...movements, { _id: 'draft', productId: 'tyre', date: '2026-10-22', qtyIn: 999, direction: 'in', status: 'Pending' }], products);
  assert.equal(rows[0].balance, null); assert.equal(rows[0].qtyIn, 0);
  assert.equal(ledgerScope(rows, products, empty).stats.closing, 120);
  assert.equal(ledgerScope(rows, products, empty).stats.totalIn, 50);
});
test('SKU search, warehouse, transaction type and reference filters preserve period balances', () => {
  const rows = normalizeLedger(movements, products);
  const scope = ledgerScope(rows, products, { ...empty, search: 'tyr-001', warehouse: 'Main Warehouse', type: 'Sales', reference: 'inv-001' });
  assert.deepEqual(scope.rows.map((row) => row._id), ['b']); assert.equal(scope.stats.opening, 100); assert.equal(scope.stats.closing, 120);
  assert.equal(ledgerScope(rows, products, { ...empty, search: 'R15' }).rows.length, 3);
  assert.equal(ledgerScope(rows, products, { ...empty, search: '12345' }).rows.length, 3);
});
test('matching product IDs distinguish products with the same name', () => {
  const catalogue = [...products, { ...products[0], _id: 'tyre-2', code: 'TYR-002', stock: 7 }];
  const rows = normalizeLedger([...movements, { _id: 'd', productId: 'tyre-2', productName: 'Tyre', date: '2026-10-23', qtyOut: 3, direction: 'out', status: 'Completed' }], catalogue);
  assert.equal(rows.find((row) => row._id === 'd').balance, 7); assert.equal(rows.find((row) => row._id === 'c').balance, 120);
});
test('unmatched or ambiguous legacy records do not receive fabricated balances', () => {
  const catalogue = [...products, { ...products[0], _id: 'tyre-2', stock: 7 }];
  const rows = normalizeLedger([{ _id: 'legacy', productName: 'Tyre', date: '2026-10-22', qtyIn: 4, direction: 'in', status: 'Completed' }], catalogue);
  assert.equal(rows[0].balance, null); assert.equal(ledgerScope(rows, catalogue, empty).stats.opening, null);
  assert.equal(normalizeLedger([{ _id: 'legacy', productName: 'Tyre', date: '2026-10-22', qtyIn: 4, status: 'Completed' }], products)[0].balance, 120);
});
test('transaction classifications and dates use recorded sources and India calendar dates', () => {
  assert.equal(movementType({ sourceType: 'purchase-entry' }), 'Purchase');
  assert.equal(movementType({ sourceType: 'sales-return' }), 'Sales Return');
  assert.equal(movementType({ sourceType: '', direction: 'out' }), 'Adjustment');
  assert.equal(movementType({ sourceType: 'stock-transfer', direction: 'in' }), 'Transfer In');
  assert.equal(ledgerDay('2026-10-21T20:00:00Z'), '2026-10-22');
  assert.equal(ledgerDay('bad-date'), '');
});
