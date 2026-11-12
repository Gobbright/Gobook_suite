import test from 'node:test';
import assert from 'node:assert/strict';
import { ELECTRONICS_PURCHASE_FILTER_GROUPS, emptyElectronicsPurchaseFilters, electronicsPurchaseValues, matchesElectronicsPurchase } from '../src/features/categories/common/modules/reports/electronicsPurchaseReportFilters.js';

const products = [
  { _id: 'phone', category: 'Mobiles', brand: 'Samsung', modelNumber: 'Galaxy S24', storage: '128GB', serialNumber: 'MASTER-SERIAL' },
  { _id: 'laptop', category: 'Laptops', brand: 'Dell', modelNumber: 'Inspiron', ram: '16GB', processor: 'Intel Core i7' },
];
const record = { documentType: 'purchase-entry', extra: { goodsReceiptStatus: 'Fully Received', qualityInspection: 'Passed', itcStatus: 'Eligible' }, items: [
  { productId: 'phone', serialNumber: 'DEVICE-SERIAL', imei1: '123456789012345', imei2: '987654321012345', condition: 'New', qty: 2, rate: 20000, discount: 5 },
  { productId: 'laptop', serialNumber: 'LAPTOP-SERIAL', qty: 1, rate: 60000, condition: 'Refurbished' },
] };
const matches = (filters, source = record, catalog = products) => matchesElectronicsPurchase(source, { ...emptyElectronicsPurchaseFilters(), ...filters }, catalog);

test('electronics purchase combines brand, model and condition on one purchased item', () => {
  assert.equal(matches({ brand: 'Samsung', productModel: 'Galaxy', productCondition: 'New' }), true);
  assert.equal(matches({ brand: 'Samsung', productCondition: 'Refurbished' }), false);
  assert.equal(matches({ productModel: 'Inspiron', processor: 'Intel' }), true);
});
test('IMEI 1 and IMEI 2 match without treating serial numbers as IMEIs', () => {
  assert.equal(matches({ imei: '123456789012345' }), true);
  assert.equal(matches({ imei: '987654321012345' }), true);
  assert.equal(matches({ imei: 'DEVICE-SERIAL' }), false);
  assert.equal(matches({ serialNumber: 'DEVICE-SERIAL', imei: '987654321012345' }), true);
  assert.equal(matches({ serialNumber: 'LAPTOP-SERIAL', imei: '987654321012345' }), false);
  assert.equal(matches({ serialNumber: 'MASTER-SERIAL' }), false);
});
test('storage and RAM tolerate recorded spacing and match only the purchased variant', () => {
  assert.equal(matches({ storage: '128 GB' }), true);
  assert.equal(matches({ ram: '16 GB', brand: 'Dell' }), true);
  assert.equal(matches({ ram: '16 GB', brand: 'Samsung' }), false);
  const product = { _id: 'configurable', variants: [{ modelName: 'Base', ram: '8GB', storage: '128GB' }, { modelName: 'Pro', ram: '32GB', storage: '1TB' }] };
  const source = { items: [{ productId: 'configurable', size: 'Base' }] };
  assert.equal(matches({ ram: '8GB', productModel: 'Base' }, source, [product]), true);
  assert.equal(matches({ ram: '32 GB' }, source, [product]), false);
});
test('procurement and numeric filters apply with device filters', () => {
  assert.equal(matches({ brand: 'Samsung', goodsReceiptStatus: 'Fully Received', qualityInspection: 'Passed', itcStatus: 'Eligible', minQty: '2', maxRate: '20000', discountPercent: '5', discountAmount: '2000' }), true);
  assert.equal(matches({ brand: 'Dell', minQty: '2' }), false);
  assert.equal(matches({ maxQty: '0' }), false);
  assert.equal(matches({ stockUpdateStatus: 'Not Updated' }), false);
});
test('warranty, screen size and supplier category use recorded data', () => {
  const source = { supplier: { category: 'Distributor' }, items: [{ screenSize: '15.6 inch', warrantyPeriod: '12 months', warrantyStatus: 'Under Warranty' }] };
  assert.equal(matches({ screenSize: '15.6', warrantyPeriod: '12', warrantyStatus: 'Under Warranty', supplierCategory: 'Distributor' }, source), true);
  assert.equal(matches({ warrantyStatus: 'Expired' }, source), false);
  assert.deepEqual(electronicsPurchaseValues('warrantyStatus', {}), []);
});
test('empty filter state includes every electronics and procurement field', () => {
  const filters = emptyElectronicsPurchaseFilters();
  assert.equal(Object.keys(filters).length, ELECTRONICS_PURCHASE_FILTER_GROUPS.flatMap(([, fields]) => fields).length);
  assert.equal(Object.values(filters).every((value) => value === ''), true);
  assert.equal(matches({}, {}), true);
  assert.equal(matches({ imei: '123' }, {}), false);
});
