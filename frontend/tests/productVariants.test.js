import assert from 'node:assert/strict';
import test from 'node:test';
import { hasNewDuplicateVariants, productVariantKey, productStockAdjustment, productHasVariants, singleProductVariants, productInventoryOptions } from '../../backend/src/utils/productVariants.js';

const rows = [{ _id: 'a', modelName: 'Speaker', barcode: '123', stock: 0 }, { _id: 'b', modelName: 'Speaker', barcode: '123', stock: 4 }];
test('inventory selections retain the product and exact variant IDs without exposing legacy single rows as separate items', () => {
  const single = { _id: 'parent', description: 'Speaker', stock: 4, variants: rows };
  assert.equal(productInventoryOptions(single).length, 1);
  assert.equal(productInventoryOptions(single)[0].stock, 4);
  const options = productInventoryOptions({ ...single, variantMode: 'variants', variants: rows.map((row, index) => ({ ...row, size: index ? 'Large' : 'Small', stock: 2 })) });
  assert.deepEqual(options.map(row => [row.productId, row.variantId, row.stock]), [['parent', 'a', 2], ['parent', 'b', 2]]);
  assert.notEqual(options[0].optionId, options[1].optionId);
  assert.match(options[1].description, /Large/);
});
test('single products and identical imported rows open as single products', () => {
  assert.equal(productHasVariants({ description: 'Speaker', productType: 'Standard', variants: [] }), false);
  assert.equal(productHasVariants({ description: 'Speaker', productType: 'Standard', variants: rows }), false);
  assert.equal(productHasVariants({ description: 'Speaker', productType: 'Serialized', variants: [rows[0]] }), false);
  assert.equal(productHasVariants({ description: 'Renamed', variantMode: 'single', variants: rows }), false);
});
test('real variants remain visible for one option, distinct attributes and older Standard products', () => {
  assert.equal(productHasVariants({ description: 'Speaker', productType: 'Matrix', variants: [rows[0]] }), true);
  assert.equal(productHasVariants({ description: 'Speaker', variantMode: 'variants', variants: [rows[0]] }), true);
  assert.equal(productHasVariants({ description: 'Shirt', productType: 'Standard', variants: [{ size: 'M' }] }), true);
  assert.equal(productHasVariants({ description: 'Speaker', productType: 'Standard', variants: [{ ...rows[0], colour: 'Black' }, { ...rows[1], colour: 'White' }] }), true);
  assert.equal(productHasVariants({ description: 'Speaker', variantMode: 'single', variants: [{ ...rows[0], storage: '128 GB' }, { ...rows[1], storage: '256 GB' }] }), true);
  assert.equal(productHasVariants({ itemType: 'Service', variants: rows }), false);
  assert.equal(productHasVariants({ productType: 'Bundle', variants: rows }), false);
});
test('a single quantity edit retains every legacy row ID and adjusts the total without mutation', () => {
  const product = { description: 'Speaker', stock: 4, variants: rows };
  assert.deepEqual(singleProductVariants(product, 4), rows);
  assert.deepEqual(singleProductVariants(product, 0).map(row => [row._id, row.stock]), [['a', 0], ['b', 0]]);
  assert.deepEqual(singleProductVariants(product, 6).map(row => [row._id, row.stock]), [['a', 0], ['b', 6]]);
  assert.deepEqual(singleProductVariants({ ...product, variants: rows.map(row => ({ ...row, stock: 2 })) }, 1).map(row => row.stock), [1, 0]);
  assert.deepEqual(rows.map(row => row.stock), [0, 4]);
});
test('legacy duplicate rows may retain their distinct IDs during metadata edits', () => {
  assert.equal(hasNewDuplicateVariants(rows.map(v => ({ ...v, rate: 300, stock: 999 })), rows), false);
  assert.equal(hasNewDuplicateVariants(rows), true);
  assert.equal(hasNewDuplicateVariants([...rows, { modelName: 'Speaker', barcode: '123' }], rows), true);
  assert.equal(hasNewDuplicateVariants(rows.map(({ _id, ...v }) => v), rows), true);
  assert.equal(hasNewDuplicateVariants([rows[0], rows[0]], rows), true);
});
test('real size, color, length and electronic specifications identify distinct variants', () => {
  for (const field of ['colour', 'length', 'storage', 'processor', 'graphics']) {
    assert.equal(hasNewDuplicateVariants([{ modelName: 'Model', [field]: 'A' }, { modelName: 'Model', [field]: 'B' }]), false);
  }
  assert.equal(productVariantKey({ modelName: ' Phone ', ram: '6 GB', storage: '128 GB' }), productVariantKey({ modelName: 'phone', ram: '6GB', storage: '128GB' }));
});

test('stock edit intent distinguishes zero and variant redistribution from metadata changes', () => {
  const original = { stock: 4, variants: rows };
  assert.equal(productStockAdjustment(original, { ...original, description: 'Renamed' }), undefined);
  const zero = productStockAdjustment(original, { stock: 0, variants: rows.map(row => ({ ...row, stock: 0 })) });
  assert.deepEqual(zero, { expectedStock: 4, expectedVariants: [{ _id: 'a', stock: 0 }, { _id: 'b', stock: 4 }] });
  assert.ok(productStockAdjustment(original, { stock: 4, variants: [{ ...rows[0], stock: 2 }, { ...rows[1], stock: 2 }] }));
  assert.deepEqual(productStockAdjustment({ stock: 4 }, { stock: 0 }), { expectedStock: 4, expectedVariants: [] });
});
