import { Product } from '../models/Product.js';
import { Types } from 'mongoose';
import { Warehouse } from '../models/Warehouse.js';
import { inventoryReportForRequest } from './inventoryStockService.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { INVENTORY_STOCK_STATUSES as statuses, effectiveStockThresholds, inventoryStockStatusKey as statusKey, inventoryStockStatus, stockDate } from './inventoryStockCalculation.js';
import { scopedOwnerQuery } from '../utils/tenantScope.js';
import { resolveBranchScope } from '../utils/branchScope.js';
import { httpError } from '../utils/httpError.js';

const rounded = (value) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
const valueTotal = (rows) => rows.some((row) => row.closingValue == null) ? null : Math.round(rows.reduce((sum, row) => sum + row.closingValue, 0) * 100) / 100;
const total = (rows, field) => rounded(rows.reduce((sum, row) => sum + Number(row[field] || 0), 0));

function movementTotals(events) {
  const transfers = new Map();
  let inwardQty = 0;
  let outwardQty = 0;
  for (const event of events) {
    if (event.direction === 'in') inwardQty += Number(event.quantity || 0);
    else outwardQty += Number(event.quantity || 0);
    if (['stock-transfer', 'stock-transfer-reversal'].includes(event.sourceType) && event.sourceId) {
      const key = `${event.sourceType}:${event.sourceId}`;
      const flow = transfers.get(key) || { in: 0, out: 0 };
      flow[event.direction] += Number(event.quantity || 0);
      transfers.set(key, flow);
    }
  }
  for (const flow of transfers.values()) { const internal = Math.min(flow.in, flow.out); inwardQty -= internal; outwardQty -= internal; }
  return { inwardQty: rounded(inwardQty), outwardQty: rounded(outwardQty) };
}

export function buildInventoryDashboard(report, query = {}) {
  const from = stockDate(query.dateFrom || query.from);
  const to = stockDate(query.dateTo || query.to, true) ?? Date.now();
  if (from != null && from > to) throw httpError(400, 'From Date must not follow To Date');
  const movementFrom = stockDate(query.movementFrom);
  const movementTo = stockDate(query.movementTo, true);
  if (movementFrom != null && movementTo != null && movementFrom > movementTo) throw httpError(400, 'Invalid movement date range');
  if (query.movementDirection && !['in', 'out'].includes(query.movementDirection)) throw httpError(400, 'Invalid stock movement direction');
  if (query.stockStatus && ![...statuses.map((status) => status.key), 'reserved', 'zero'].includes(query.stockStatus)) throw httpError(400, 'Invalid dashboard stock status');
  if (query.zeroStock && !['0', '1'].includes(query.zeroStock)) throw httpError(400, 'Invalid zero stock filter');
  const byProduct = new Map();
  for (const row of report.data) {
    if ((query.warehouseMissing === '1' && row.warehouse) || (query.categoryMissing === '1' && row.category)) continue;
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, []);
    byProduct.get(row.productId).push(row);
  }
  let products = [...byProduct.values()].map((locations) => {
    const first = locations[0];
    const references = locations.flatMap((row) => row.references || []);
    const quantity = total(locations, 'physicalQty');
    const reservedQty = total(locations, 'reservedQty');
    const closingValue = valueTotal(locations);
    const period = references.filter((reference) => (from == null || new Date(reference.date).getTime() >= from) && new Date(reference.date).getTime() <= to);
    const flows = movementTotals(period);
    const thresholds = new Set(locations.map((row) => JSON.stringify([row.branch, row.warehouse]))).size === 1 ? effectiveStockThresholds(first, first.branch, first.warehouse) : {};
    return { ...first, ...thresholds, _id: first.productId, physicalQty: quantity, stock: quantity, reservedQty, availableQty: rounded(quantity - reservedQty),
      openingQty: total(locations, 'openingQty'), ...flows, stockInQty: flows.inwardQty, stockOutQty: flows.outwardQty,
      closingValue, stockValue: closingValue, references,
      warehouse: new Set(locations.map((row) => row.warehouse)).size === 1 ? first.warehouse : '',
      branch: new Set(locations.map((row) => row.branch)).size === 1 ? first.branch : '',
      locations: locations.map((row) => ({ branch: row.branch, warehouse: row.warehouse, physicalQty: row.physicalQty })),
    };
  });
  products = products.filter((row) => (!query.stockStatus || (query.stockStatus === 'reserved' ? row.reservedQty > 0 : query.stockStatus === 'zero' ? row.physicalQty === 0 : statusKey(row) === query.stockStatus))
    && (query.zeroStock !== '1' || row.physicalQty === 0)
    && (!(movementFrom != null || movementTo != null || query.movementDirection) || row.references.some((reference) => {
      const date = new Date(reference.date).getTime();
      return (from == null || date >= from) && date <= to && (movementFrom == null || date >= movementFrom) && (movementTo == null || date <= movementTo) && (!query.movementDirection || reference.direction === query.movementDirection);
    })));
  const selected = new Set(products.map((row) => row.productId));
  const locations = report.data.filter((row) => selected.has(row.productId) && !(query.warehouseMissing === '1' && row.warehouse) && !(query.categoryMissing === '1' && row.category));
  function groups(field) {
    const grouped = new Map();
    for (const row of locations) {
      const key = row[field] || '';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }
    return [...grouped].map(([key, rows]) => ({ key, name: key || 'Unassigned', quantity: total(rows, 'physicalQty'), value: valueTotal(rows), products: new Set(rows.map((row) => row.productId)).size }));
  }
  const seen = new Set();
  const events = products.flatMap((row) => row.references).filter((reference) => {
    const time = new Date(reference.date).getTime();
    const key = `${reference.direction}:${reference.movementId}`;
    if (seen.has(key) || from != null && time < from || time > to) return false;
    seen.add(key);
    return true;
  });
  const firstDate = from ?? events.reduce((earliest, event) => Math.min(earliest, new Date(event.date).getTime()), to);
  const monthly = to - firstDate > 62 * 86400000;
  const trend = new Map();
  for (const event of events) {
    const day = new Date(event.date).toISOString().slice(0, 10);
    const key = monthly ? day.slice(0, 7) : day;
    if (!trend.has(key)) trend.set(key, { label: key, from: monthly ? `${key}-01` : key, to: monthly ? new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10) : key, events: [] });
    const point = trend.get(key);
    point.events.push(event);
  }
  return {
    stats: { totalProducts: products.length, totalQty: total(products, 'physicalQty'), totalValue: valueTotal(products), reservedQty: total(products, 'reservedQty'),
      lowStock: products.filter((row) => statusKey(row) === 'low').length, outOfStock: products.filter((row) => statusKey(row) === 'out').length },
    warehouses: groups('warehouse'), categories: groups('category'),
    distribution: statuses.map((status) => ({ ...status, count: products.filter((row) => statusKey(row) === status.key).length })),
    trend: [...trend.values()].sort((left, right) => left.label.localeCompare(right.label)).map(({ events: pointEvents, ...point }) => ({ ...point, ...movementTotals(pointEvents) })),
    data: products.map(({ references, costLayers, ...row }) => ({ ...row, stockStatus: statuses.find((status) => status.key === statusKey(row)).name })),
    costingMethod: report.costingMethod, warnings: report.warnings, from: report.from, to: report.to,
  };
}

export function sortInventoryProducts(rows, query) {
  const fields = { description: 'description', sku: 'code', brand: 'brand', category: 'category', warehouse: 'warehouse', branch: 'branch', physicalQty: 'physicalQty', reservedQty: 'reservedQty', availableQty: 'availableQty', minStockLevel: 'minStockLevel', maxStockLevel: 'maxStockLevel', stockValue: 'stockValue', stockStatus: 'stockStatus' };
  const legacy = { 'value-desc': ['stockValue', 'desc'], 'value-asc': ['stockValue', 'asc'], quantity: ['physicalQty', 'desc'], name: ['description', 'asc'] };
  const [key, direction] = query.sortBy ? [query.sortBy, query.sortDirection || 'asc'] : legacy[query.sort || 'value-desc'] || [];
  if (!fields[key] || !['asc', 'desc'].includes(direction)) throw httpError(400, 'Invalid dashboard sorting');
  const field = fields[key];
  const numeric = ['physicalQty', 'reservedQty', 'availableQty', 'minStockLevel', 'maxStockLevel', 'stockValue'].includes(field);
  return rows.sort((left, right) => {
    const first = left[field]; const second = right[field];
    if (first == null || second == null) return first == null && second != null ? 1 : second == null && first != null ? -1 : String(left.productId).localeCompare(String(right.productId));
    const compared = numeric ? Number(first) - Number(second) : String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' });
    return compared * (direction === 'desc' ? -1 : 1) || String(left.productId).localeCompare(String(right.productId));
  });
}

export function inventoryDashboardForRequest(req) {
  return inventoryTransaction(async () => {
    const query = req.query || {};
    for (const key of ['stockStatus', 'zeroStock', 'movementFrom', 'movementTo', 'movementDirection', 'warehouseMissing', 'categoryMissing', 'sort', 'sortBy', 'sortDirection']) {
      if (query[key] != null && typeof query[key] !== 'string') throw httpError(400, `Invalid dashboard filter: ${key}`);
    }
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw httpError(400, 'Invalid dashboard pagination');
    const report = await inventoryReportForRequest({ ...req, query: { ...query, groupBy: 'location' } });
    const dashboard = buildInventoryDashboard(report, query);
    sortInventoryProducts(dashboard.data, query);
    const scope = await resolveBranchScope(req);
    const products = await Product.find({ ...await scopedOwnerQuery(req, { model: Product, ownerField: 'userId' }), itemType: { $ne: 'Service' }, trackInventory: { $ne: false } }).select('category brand branch warehouse').lean();
    const warehouses = await Warehouse.find({ ...await scopedOwnerQuery(req, { model: Warehouse, ownerField: 'userId' }), ...(scope.branch ? { branch: scope.branch } : {}) }).select('name branch').lean();
    const options = (rows, field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort();
    return { ...dashboard, data: dashboard.data.slice((page - 1) * limit, page * limit), total: dashboard.data.length, page, limit,
      filterOptions: { category: options(products, 'category'), brand: options(products, 'brand'), warehouse: options([...warehouses.map((row) => ({ warehouse: row.name })), ...report.data], 'warehouse'), branch: scope.branch ? [scope.branch] : options([...products, ...warehouses, ...report.data], 'branch') } };
  });
}

export function inventoryProductDetailsForRequest(req) {
  return inventoryTransaction(async () => {
    const productId = req.params.productId;
    if (!Types.ObjectId.isValid(productId)) throw httpError(400, 'Invalid inventory product');
    const report = await inventoryReportForRequest({ ...req, query: { ...req.query, productId, groupBy: 'batch', search: '', status: '', category: '', brand: '' } });
    report.data = report.data.filter((row) => !(req.query?.warehouseMissing === '1' && row.warehouse) && !(req.query?.categoryMissing === '1' && row.category));
    const summary = buildInventoryDashboard(report, { from: report.from, to: report.to }).data[0];
    if (!summary) throw httpError(404, 'No stock records for this product in the selected scope');
    const variants = summary.variants || [];
    const { variants: ignoredVariants, ...product } = summary;
    const data = report.data.map(({ references, costLayers, variants: ignoredRows, ...row }) => {
      const variant = variants.find((entry) => String(entry._id) === row.variantId);
      return { ...row, minStockLevel: variant?.minStockLevel ?? summary.minStockLevel,
        variantName: variant ? [variant.size, variant.modelName, variant.modelCode, variant.colour, variant.material].filter(Boolean).join(' / ') || variant.barcode || 'Variant'
          : row.variantId ? 'Historical variant (metadata unavailable)' : variants.length ? 'Unassigned variant' : 'Standard', barcode: row.variantId ? variant?.barcode || '' : summary.barcode,
        stockStatus: inventoryStockStatus({ ...row, minStockLevel: variant?.minStockLevel ?? summary.minStockLevel }) };
    });
    return { product, data, costingMethod: report.costingMethod, from: report.from, to: report.to,
      warnings: [...new Set([...report.warnings, ...report.data.flatMap((row) => row.warnings || [])])] };
  });
}
