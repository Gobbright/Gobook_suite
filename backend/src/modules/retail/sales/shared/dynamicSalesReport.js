import { Invoice } from '../../../../models/Invoice.js';
import { Product } from '../../../../models/Product.js';
import { branchScopedAggregateMatch } from '../../../../utils/branchScope.js';
import { httpError } from '../../../../utils/httpError.js';
import { compileReportFilters } from '../../../../services/reportFilters.js';
import { REPORT_FILTER_CONFIGS, publicReportFields } from '../../../../services/reportFilterConfig.js';
import { PURCHASE_DOCUMENT_TYPES, purchaseFilterStages, purchaseProductProjection } from '../../../../services/purchaseReportFields.js';
import { salesReportRows, salesTransactionRow } from '../../../../services/salesReportCalculations.js';
import { paymentStatusStages, escapeRegex } from './salesFilters.js';

const number = value => ({ $convert: { input: value, to: 'double', onNull: 0, onError: 0 } });
const fallback = (...values) => values.reduceRight((next, value) => next === undefined ? value : { $ifNull: [value, next] }, undefined);
const textFallback = (saved, master) => ({ $cond: [{ $ne: [{ $ifNull: [saved, ''] }, ''] }, saved, { $ifNull: [master, ''] }] });
const analyses = ['documents', 'transactions', 'invoice', 'item', 'category', 'brand', 'hourly', 'salesperson', 'channel', 'all', 'margin'];
const purchaseAnalyses = ['documents', 'transactions', 'invoice', 'item', 'category', 'brand', 'supplier', 'branch'];
const margins = ['product', 'invoice', 'customer', 'branch'];
const metrics = ['sales', 'discounts', 'profitability', 'below-cost'];
const numericKeys = ['quantity', 'sales', 'discount', 'cost', 'costedSales', 'margin', 'belowCostSales', 'tax', 'netAmount'];
const sortFields = ['name', 'invoices', ...numericKeys, 'invoiceNumber', 'invoiceDate', 'customer', 'supplier', 'product', 'rate', 'amount'];
export function validateReportQuery(query) {
  const page = Number(query.page ?? 1), limit = Number(query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw httpError(400, 'Invalid report pagination.');
  const analysis = query.analysis || 'invoice', marginBy = query.marginBy || 'product', metric = query.metric || 'sales', sort = query.sort || 'sales', direction = query.direction || 'desc';
  if (!(query.report === 'purchase' ? purchaseAnalyses : analyses).includes(analysis) || !margins.includes(marginBy) || !(query.report === 'purchase' ? ['sales', 'discounts'] : metrics).includes(metric) || !sortFields.includes(sort) || !['asc', 'desc'].includes(direction)) throw httpError(400, 'Invalid report view or sorting.');
  if (!['sales', 'purchase'].includes(query.report)) throw httpError(400, 'Unsupported invoice report.');
  return { page, limit, analysis, marginBy, metric, sort, direction };
}

export async function reportSourcePipeline(req) {
  const report = req.query.report;
  const { match, tree } = compileReportFilters(report, req.query.filters);
  const hasDocumentType = group => group.conditions.some(condition => ['documentType', 'purchaseType'].includes(condition.field) || (condition.conditions && hasDocumentType(condition)));
  const explicitTypes = hasDocumentType(tree);
  const types = report === 'purchase' ? explicitTypes || req.query.view === 'filter-options' ? PURCHASE_DOCUMENT_TYPES : ['purchase-entry']
    : explicitTypes ? ['invoice', 'bill-of-supply', 'quotation', 'sales-return', 'purchase-entry', 'supplier-return'] : ['invoice', 'bill-of-supply'];
  const [scope, productScope] = await Promise.all([
    branchScopedAggregateMatch(req, { model: Invoice, ownerField: 'userId' }),
    branchScopedAggregateMatch(req, { model: Product, ownerField: 'userId' }),
  ]);
  return [
    { $match: { $and: [scope, { documentType: { $in: types } }] } },
    ...(report === 'purchase' ? [
      { $lookup: { from: 'invoices', let: { orderId: { $convert: { input: '$extra.linkedPurchaseOrderId', to: 'objectId', onNull: null, onError: null } } }, pipeline: [
        { $match: { $and: [scope, { documentType: 'purchase-order', $expr: { $eq: ['$_id', '$$orderId'] } }] } }, { $project: { number: 1 } },
      ], as: '_purchaseOrders' } },
      { $set: { _purchaseOrder: { $arrayElemAt: ['$_purchaseOrders', 0] } } },
    ] : []),
    ...paymentStatusStages(req.user.id, { includeMethods: true }),
    { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', pipeline: [{ $match: productScope }, { $project: report === 'purchase' ? purchaseProductProjection : { description: 1, category: 1, brand: 1, purchasePrice: 1, variants: 1 } }], as: '_reportProducts' } },
    { $set: {
      invoiceTotal: number(fallback('$totals.finalTotal', '$totals.grandTotal', '$totals.total', '$totals.subTotal', 0)),
      _reportDate: textFallback('$meta.date', { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } }),
      _reportSalesperson: textFallback('$extra.salesPerson', '$extra.salesperson'),
      _reportStatus: { $cond: [{ $in: ['$documentType', ['sales-return', 'supplier-return', 'purchase-return']] }, 'returned', { $ifNull: ['$lifecycleStatus', 'posted'] }] },
      _reportPaymentModes: { $map: { input: { $filter: { input: { $concatArrays: [[{ $ifNull: ['$paymentMethod', ''] }], '$_reportReceiptMethods', { $map: { input: { $ifNull: ['$paymentSplits', []] }, as: 'split', in: textFallback('$$split.methodId', '$$split.method') } }] }, as: 'mode', cond: { $and: [{ $ne: ['$$mode', ''] }, { $ne: ['$$mode', null] }] } } }, as: 'mode', in: { $switch: { branches: [
        { case: { $in: [{ $toLower: '$$mode' }, ['cash']] }, then: 'Cash' },
        { case: { $in: [{ $toLower: '$$mode' }, ['card', 'online']] }, then: 'Card' },
        { case: { $in: [{ $toLower: '$$mode' }, ['upi']] }, then: 'UPI' },
        { case: { $in: [{ $toLower: '$$mode' }, ['bank', 'bank transfer']] }, then: 'Bank Transfer' },
        { case: { $in: [{ $toLower: '$$mode' }, ['credit']] }, then: 'Credit' },
      ], default: '$$mode' } } } },
      _reportItems: { $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: { $let: { vars: { product: { $arrayElemAt: [{ $filter: { input: '$_reportProducts', as: 'p', cond: { $eq: ['$$p._id', '$$item.productId'] } } }, 0] } }, in: { $mergeObjects: ['$$item', {
        productKey: { $ifNull: [{ $toString: '$$item.productId' }, '$$item.description'] },
        category: report === 'purchase' ? textFallback('$$item.category', textFallback('$$item.productCategory', '$$product.category')) : textFallback('$$item.category', '$$product.category'),
        brand: report === 'purchase' ? textFallback('$$item.brand', textFallback('$$item.manufacturer', textFallback('$$product.brand', '$$product.manufacturer'))) : textFallback('$$item.brand', '$$product.brand'),
        gstRate: number(report === 'purchase' ? fallback('$$item.gstRate', '$$item.taxRate', '$$item.taxPercent') : '$$item.gstRate'),
      }] } } } } },
    } },
    ...(report === 'purchase' ? purchaseFilterStages() : []),
    { $match: match },
  ];
}

export async function dynamicSalesReport(req, res) {
  const fields = publicReportFields(req.query.report, req.user);
  if (req.query.view === 'filter-config') {
    if (!fields.length) throw httpError(400, 'Unsupported report configuration.');
    return res.json({ fields });
  }
  const view = validateReportQuery(req.query);
  const pipeline = await reportSourcePipeline(req);
  if (req.query.view === 'filter-options') {
    const definition = REPORT_FILTER_CONFIGS[req.query.report].find(field => field.key === req.query.field && field.options);
    if (!definition) throw httpError(400, 'This field has no searchable values.');
    if (typeof (req.query.q ?? '') !== 'string' || String(req.query.q || '').length > 100) throw httpError(400, 'Option search is too long.');
    if (definition.item) pipeline.push({ $unwind: '$_reportItems' });
    const path = definition.item ? `_reportItems.${definition.path}` : definition.path;
    if (definition.array) pipeline.push({ $unwind: `$${path}` });
    pipeline.push({ $project: { value: `$${path}`, label: definition.key === 'product' ? '$_reportItems.description' : `$${path}`, code: definition.key === 'product' ? '$_reportItems.productCode' : '' } },
      { $match: { value: { $nin: [null, ''] }, ...(req.query.q ? { $or: ['value', 'label', 'code'].map(key => ({ [key]: new RegExp(escapeRegex(req.query.q), 'i') })) } : {}) } },
      { $group: { _id: '$value', label: { $first: '$label' }, code: { $first: '$code' } } }, { $sort: { label: 1, _id: 1 } },
      { $facet: { data: [{ $skip: (view.page - 1) * view.limit }, { $limit: view.limit }, { $project: { _id: 0, value: '$_id', label: 1, code: 1 } }], count: [{ $count: 'total' }] } });
    const [result] = await Invoice.aggregate(pipeline).option({ maxTimeMS: 30000 });
    return res.json({ options: result.data, total: result.count[0]?.total || 0, page: view.page, limit: view.limit });
  }
  pipeline.push({ $unwind: { path: '$_reportItems', includeArrayIndex: '_reportLineIndex', preserveNullAndEmptyArrays: false } }, { $match: compileReportFilters(req.query.report, req.query.filters, { unwound: true }).match });
  const groups = new Map();
  // Stream matching lines on the server; clients receive one sorted report page.
  const cursor = Invoice.aggregate(pipeline).option({ maxTimeMS: 60000, allowDiskUse: true }).cursor({ batchSize: 250 });
  try {
    for await (const invoice of cursor) {
      const products = new Map(invoice._reportProducts.map(product => [String(product._id), product]));
      const transaction = salesTransactionRow(invoice, invoice._reportItems, products, invoice._reportLineIndex);
      const rows = view.analysis === 'documents' ? [{ ...transaction, id: transaction.invoiceId }]
        : view.analysis === 'transactions' ? [transaction] : salesReportRows([{ ...invoice, _reportItems: [invoice._reportItems] }], products, view.analysis, view.marginBy).map(row => ({ ...row, tax: transaction.tax, netAmount: transaction.netAmount }));
      for (const row of rows) {
        const key = row.id || row.name;
        const previous = groups.get(key) || { ...row, invoices: new Set(), ...Object.fromEntries(numericKeys.map(key => [key, 0])) };
        previous.invoices.add(String(invoice._id));
        if (view.analysis === 'documents') {
          previous.products ??= new Set();
          previous.rates ??= new Set();
          previous.products.add(row.product);
          previous.rates.add(row.rate);
        }
        numericKeys.forEach(key => { previous[key] += row[key]; });
        groups.set(key, previous);
      }
    }
  } finally { await cursor.close(); }
  const matchingGroups = [...groups.values()].filter(row => view.metric === 'discounts' ? row.discount > 0 : view.metric === 'profitability' ? row.costedSales > 0 : view.metric === 'below-cost' ? row.belowCostSales > 0 : true);
  const recordCount = new Set(matchingGroups.flatMap(row => [...row.invoices])).size;
  const data = matchingGroups.map(({ products, rates, ...row }) => ({ ...row, invoices: row.invoices.size,
    ...(view.analysis === 'documents' ? { product: [...products].join(', '), rate: rates.size === 1 ? [...rates][0] : null, amount: row.sales } : {}),
  }));
  const totals = Object.fromEntries(numericKeys.map(key => [key, data.reduce((sum, row) => sum + row[key], 0)]));
  const sign = view.direction === 'asc' ? 1 : -1;
  data.sort((a, b) => (typeof a[view.sort] === 'number' ? a[view.sort] - b[view.sort] : String(a[view.sort] || '').localeCompare(String(b[view.sort] || ''))) * sign || String(a.id || a.name).localeCompare(String(b.id || b.name)));
  return res.json({ data: data.slice((view.page - 1) * view.limit, view.page * view.limit), total: data.length, recordCount, totals, page: view.page, limit: view.limit, fields });
}
