import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStockAlerts, effectiveStockThresholds } from '../src/services/stockAlerts.js';

const row = (extra = {}) => ({ userId: 'owner', productId: 'product', status: 'Active', itemType: 'Product', trackInventory: true, physicalQty: 3, reservedQty: 1, availableQty: 2,
  warehouse: 'Main', branch: 'North', minStockLevel: 2, maxStockLevel: 10, reorderLevel: 4, ...extra });

test('stock alerts use available quantities and configured min/max targets, not guessed doubling', () => {
  const alerts = calculateStockAlerts([row()]);
  assert.deepEqual(alerts.map((alert) => alert.alertType), ['Low Stock', 'Reorder Required']);
  assert.equal(alerts[0].reorderQty, 8);
  assert.equal(alerts[0].physicalQty, 3);
  assert.equal(alerts[0].branch, 'North');
  assert.equal(calculateStockAlerts([row({ availableQty: 0, physicalQty: 1 })])[0].alertType, 'Out of Stock');
  assert.equal(calculateStockAlerts([row({ physicalQty: 12, availableQty: 11 })])[0].alertType, 'Overstock');
});

test('warehouse overrides inherit blanks and support explicit zero and disabled alerts', () => {
  const product = row({ warehouseStockLevels: [{ warehouse: 'Main', branch: 'North', minStockLevel: 5, maxStockLevel: null, reorderLevel: 0, enabled: true }] });
  assert.deepEqual(effectiveStockThresholds(product, 'North', 'Main'), { minStockLevel: 5, maxStockLevel: 10, reorderLevel: 0, enabled: true, thresholdSource: 'Warehouse override' });
  assert.equal(effectiveStockThresholds(product, 'South', 'Main').minStockLevel, 2);
  assert.equal(calculateStockAlerts([row({ stockAlertsEnabled: false })]).length, 0);
  assert.equal(calculateStockAlerts([row({ warehouseStockLevels: [{ warehouse: 'Main', branch: 'North', enabled: false }] })]).length, 0);
});

test('no target produces no invented purchase quantity, while configured MOQ and fractional units are respected', () => {
  const [out] = calculateStockAlerts([row({ physicalQty: 0, reservedQty: 0, availableQty: 0, minStockLevel: 0, maxStockLevel: 0, reorderLevel: 0 })]);
  assert.equal(out.reorderQty, 0);
  assert.equal(calculateStockAlerts([row({ maxStockLevel: 0, minStockLevel: 5, availableQty: 1, minOrderQty: 8 })])[0].reorderQty, 8);
  assert.equal(calculateStockAlerts([row({ minStockLevel: 1, maxStockLevel: 2.5, availableQty: 0.75 })])[0].reorderQty, 1.75);
  for (const extra of [{ status: 'Inactive' }, { itemType: 'Service' }, { trackInventory: false }]) assert.equal(calculateStockAlerts([row(extra)]).length, 0);
});
