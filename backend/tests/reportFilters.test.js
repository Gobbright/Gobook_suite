import assert from 'node:assert/strict';
import test from 'node:test';
import { compileReportFilters, validReportDate } from '../src/services/reportFilters.js';
import { publicReportFields } from '../src/services/reportFilterConfig.js';
import { validateReportQuery } from '../src/modules/retail/sales/shared/dynamicSalesReport.js';
import { salesReportRows } from '../src/services/salesReportCalculations.js';

const tree = (...conditions) => ({ logic: 'and', conditions });
const condition = (field, operator, value) => ({ field, operator, value });
test('report filters allowlist fields and operators, and never accept query objects', () => {
  for (const input of [tree(condition('$where', 'equals', 'x')), tree(condition('userId', 'equals', 'x')), tree(condition('amount', '$gt', 2)), tree(condition('customer', 'equals', { $ne: '' })), { $where: 'true' }, 'bad JSON', tree(condition('invoiceNumber', 'contains', ['x'])), tree(condition('amount', 'equals', Infinity)), tree(condition('reverseCharge', 'equals', 'true'))]) {
    assert.throws(() => compileReportFilters('sales', input), error => error.statusCode === 400);
  }
  assert.throws(() => compileReportFilters('sales', tree(...Array.from({ length: 31 }, () => condition('amount', 'equals', 1)))), /at most 30/);
});
test('values use escaped regular expressions and scalar zero is retained', () => {
  const query = compileReportFilters('sales', tree({ field: 'customer', operator: 'equals', values: ['ABC.*', 'Shop (1)'] }, condition('amount', 'equals', 0))).match;
  const expressions = query.$and[0]['customer.name'].$in;
  assert.equal(expressions[0].test('ABC.*'), true);
  assert.equal(expressions[0].test('ABC everything'), false);
  assert.deepEqual(query.$and[1], { invoiceTotal: { $in: [0] } });
});
test('product, brand and GST fields must match the same invoice item', () => {
  const filters = tree(condition('product', 'equals', 'product-a'), condition('brand', 'equals', 'Dell'), { field: 'gstRate', operator: 'equals', values: [0, 18] });
  const match = compileReportFilters('sales', filters).match;
  assert.equal(match.$and[0]._reportItems.$elemMatch.$and.length, 3);
  const lineMatch = compileReportFilters('sales', filters, { unwound: true }).match;
  assert.ok(lineMatch.$and[0]['_reportItems.productKey']);
  assert.deepEqual(lineMatch.$and[2], { '_reportItems.gstRate': { $in: [0, 18] } });
});
test('AND/OR grouping and no-value conditions compile safely', () => {
  const filters = { logic: 'or', conditions: [condition('customer', 'isEmpty'), tree(condition('amount', 'greaterThan', 100), condition('brand', 'isNotEmpty'))] };
  assert.equal(compileReportFilters('sales', filters).match.$or.length, 2);
  assert.throws(() => compileReportFilters('sales', { logic: '$or', conditions: [] }), /Invalid/);
});
test('date and number ranges reject reversed, missing, impossible or invalid values', () => {
  for (const date of ['2026-02-30', '2026-13-01', 'not-a-date', { $gt: '' }, '2026-11-13T00:00:00Z']) assert.equal(validReportDate(date), false);
  assert.equal(validReportDate('2024-02-29'), true);
  assert.equal(validReportDate('2026-02-29'), false);
  for (const filter of [{ field: 'amount', operator: 'between', min: 10, max: 0 }, { field: 'amount', operator: 'between', min: '', max: 2 }, condition('date', 'equals', '2026-02-30')]) assert.throws(() => compileReportFilters('sales', tree(filter)), /minimum|finite|valid/);
  assert.deepEqual(compileReportFilters('sales', tree({ field: 'date', operator: 'between', min: '2026-11-01', max: '2026-11-13' })).match, { $and: [{ _reportDate: { $gte: '2026-11-01', $lte: '2026-11-13' } }] });
});
test('report configurations expose only relevant fields and hide database paths', () => {
  assert.ok(publicReportFields('sales').some(field => field.key === 'customer'));
  assert.ok(publicReportFields('purchase').some(field => field.key === 'supplier'));
  assert.equal(publicReportFields('purchase').some(field => field.key === 'customer'), false);
  assert.equal(publicReportFields('stockSummary').some(field => field.key === 'date'), false);
  for (const report of ['sales', 'purchase', 'stockSummary', 'stockMovement', 'ledger', 'gst']) assert.ok(publicReportFields(report).every(field => !Object.hasOwn(field, 'path')));
});
test('pagination, sort and breakdown are validated before a database read', () => {
  for (const patch of [{ page: 0 }, { limit: 501 }, { page: 'Infinity' }, { sort: '$where' }, { direction: 'sideways' }, { analysis: 'unknown' }, { report: 'arbitrary' }]) assert.throws(() => validateReportQuery({ report: 'sales', ...patch }), error => error.statusCode === 400);
  assert.equal(validateReportQuery({ report: 'purchase', analysis: 'supplier' }).analysis, 'supplier');
  assert.throws(() => validateReportQuery({ report: 'purchase', analysis: 'margin' }), /Invalid report view/);
  assert.throws(() => validateReportQuery({ report: 'purchase', metric: 'profitability' }), /Invalid report view/);
});
test('server calculations retain allocated discounts, cost and quantity across filtered lines', () => {
  const invoice = { _id: 'invoice-a', number: 'INV-A', totals: { addDiscAmt: 30 }, items: [{ description: 'Laptop', qty: 2, rate: 100, discount: 10, purchasePrice: 50 }, { description: 'Mouse', qty: 1, rate: 120, purchasePrice: 70 }] };
  const rows = salesReportRows([invoice], new Map(), 'invoice', 'product');
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].sales, 270);
  assert.equal(rows[0].discount, 50);
  assert.equal(rows[0].cost, 170);
  assert.equal(rows[0].margin, 100);
  const filtered = salesReportRows([{ ...invoice, _reportItems: [invoice.items[0]] }], new Map(), 'invoice', 'product');
  assert.equal(filtered[0].sales, 162);
  assert.equal(filtered[0].discount, 38);
});
