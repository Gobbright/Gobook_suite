import mongoose, { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { Product } from '../models/Product.js';
import { Warehouse } from '../models/Warehouse.js';
import { AppUser } from '../models/AppUser.js';
import { StockAlert } from '../models/StockAlert.js';
import { AuditLog } from '../models/AuditLog.js';
import { inventoryReportForRequest } from './inventoryStockService.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { effectiveStockThresholds } from './inventoryStockCalculation.js';
export { effectiveStockThresholds } from './inventoryStockCalculation.js';
import { assertInventoryPermission } from './inventoryStockOperations.js';
import { scopedOwnerQuery, scopedOwnerValues, isBusinessSuperAdmin } from '../utils/tenantScope.js';
import { resolveBranchScope } from '../utils/branchScope.js';
import { httpError } from '../utils/httpError.js';

export const STOCK_ALERT_TYPES = ['Out of Stock', 'Low Stock', 'Overstock', 'Reorder Required'];
const rounded = (value) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
const identity = (row) => ({ userId: row.userId, productId: row.productId, branch: row.branch || '', warehouse: row.warehouse || '', alertType: row.alertType });
const key = (row) => JSON.stringify(Object.values(identity(row)).map(String));

export function calculateStockAlerts(rows) {
  const alerts = [];
  for (const row of rows) {
    if (row.status !== 'Active' || row.itemType === 'Service' || row.trackInventory === false) continue;
    const thresholds = effectiveStockThresholds(row, row.branch, row.warehouse);
    if (!thresholds.enabled) continue;
    const targetStock = thresholds.maxStockLevel > 0 ? thresholds.maxStockLevel : thresholds.minStockLevel;
    const shortfall = Math.max(0, targetStock - row.availableQty);
    const reorderQty = shortfall > 0 ? rounded(Math.max(shortfall, Number(row.minOrderQty || 0))) : 0;
    const types = [];
    if (row.availableQty <= 0) types.push('Out of Stock');
    if (row.availableQty > 0 && row.availableQty <= thresholds.minStockLevel) types.push('Low Stock');
    if (thresholds.maxStockLevel > 0 && row.physicalQty > thresholds.maxStockLevel) types.push('Overstock');
    if (row.availableQty <= thresholds.reorderLevel && reorderQty > 0) types.push('Reorder Required');
    const { references, costLayers, variants, warehouseStockLevels, ...snapshot } = row;
    for (const alertType of types) alerts.push({ ...snapshot, ...thresholds, productId: row.productId, alertType, alertStatus: alertType,
      stock: row.physicalQty, targetStock, reorderQty: alertType === 'Overstock' ? 0 : reorderQty,
      preferredSupplier: row.preferredSupplier || row.supplier || row.supplierMappings?.[0]?.supplier || '' });
  }
  return alerts;
}

async function lockAlertOwners(req) {
  const owners = (await scopedOwnerValues(req, 'userId')).map((value) => new Types.ObjectId(String(value)));
  const session = mongoose.transactionAsyncLocalStorage?.getStore()?.session;
  await AppUser.collection.updateMany({ _id: { $in: owners } }, { $inc: { stockAlertsRevision: 1 } }, { session });
}

async function refreshStockAlerts(req) {
  await lockAlertOwners(req);
  const scope = await resolveBranchScope(req);
  const report = await inventoryReportForRequest({ ...req, query: { groupBy: 'location', branch: scope.branch } });
  const candidates = calculateStockAlerts(report.data);
  const filter = { ...await scopedOwnerQuery(req, { ownerField: 'userId' }), unresolved: true, ...(scope.branch ? { branch: scope.branch } : {}) };
  const previous = await StockAlert.find(filter);
  const byKey = new Map(previous.map((row) => [key(row), row]));
  const current = new Set();
  const operations = [];
  const now = new Date();
  for (const row of candidates) {
    const marker = key(row); current.add(marker);
    const fingerprint = createHash('sha256').update(JSON.stringify([row.physicalQty, row.reservedQty, row.minStockLevel, row.maxStockLevel, row.reorderLevel, row.reorderQty])).digest('hex');
    const previousRow = byKey.get(marker);
    const changed = previousRow?.fingerprint !== fingerprint;
    const values = { fingerprint, snapshot: row, lastSeenAt: now, ...(changed ? { state: 'Open', reviewedAt: null, reviewedBy: null } : {}) };
    operations.push({ updateOne: { filter: { ...identity(row), unresolved: true }, update: { $set: values, $setOnInsert: { ...identity(row), businessId: req.user.businessId, unresolved: true } }, upsert: true } });
  }
  const resolved = previous.filter((row) => !current.has(key(row))).map((row) => row._id);
  if (resolved.length) operations.push({ updateMany: { filter: { _id: { $in: resolved }, unresolved: true }, update: { $set: { unresolved: false, state: 'Resolved', resolvedAt: now } } } });
  if (operations.length) await StockAlert.bulkWrite(operations, { ordered: true, session: mongoose.transactionAsyncLocalStorage?.getStore()?.session });
  const saved = await StockAlert.find(filter).lean();
  const results = saved.map((row) => ({ ...row.snapshot, _id: String(row._id), state: row.state, reviewedAt: row.reviewedAt, reviewedBy: row.reviewedBy, createdAt: row.createdAt, updatedAt: row.updatedAt }));
  return { data: results, warnings: report.warnings, refreshedAt: now };
}

export function stockAlertsForRequest(req) {
  return inventoryTransaction(async () => {
    const query = req.query || {};
    for (const name of ['search', 'warehouse', 'branch', 'brand', 'category', 'type', 'reviewed', 'supplier', 'sort', 'itemType']) if (query[name] != null && typeof query[name] !== 'string') throw httpError(400, `Invalid alert filter: ${name}`);
    if (query.type && !STOCK_ALERT_TYPES.includes(query.type)) throw httpError(400, 'Invalid stock alert type');
    if (query.reviewed && !['Open', 'Reviewed'].includes(query.reviewed)) throw httpError(400, 'Invalid review state');
    const page = Number(query.page || 1); const limit = Number(query.limit || 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw httpError(400, 'Invalid alert pagination');
    const refreshed = await refreshStockAlerts(req);
    const options = (field) => [...new Set(refreshed.data.map((row) => row[field]).filter(Boolean))].sort();
    let rows = query.itemType === 'Service' ? [] : refreshed.data.filter((row) => (!query.search || [row.description, row.code, row.barcode, row.partNumber, row.preferredSupplier].join(' ').toLowerCase().includes(query.search.toLowerCase()))
      && ['warehouse', 'brand', 'category'].every((field) => !query[field] || row[field] === query[field]) && (!query.supplier || row.preferredSupplier === query.supplier)
      && (!query.type || row.alertType === query.type) && (!query.reviewed || row.state === query.reviewed));
    const stats = { lowStock: rows.filter((row) => row.alertType === 'Low Stock').length, outOfStock: rows.filter((row) => row.alertType === 'Out of Stock').length,
      overstock: rows.filter((row) => row.alertType === 'Overstock').length, reorderRequired: rows.filter((row) => row.alertType === 'Reorder Required').length, reviewed: rows.filter((row) => row.state === 'Reviewed').length };
    const sort = query.sort || 'priority';
    if (!['priority', 'name', 'stock'].includes(sort)) throw httpError(400, 'Invalid alert sorting');
    rows.sort((first, second) => (sort === 'name' ? first.description.localeCompare(second.description) : sort === 'stock' ? first.availableQty - second.availableQty : ['Out of Stock', 'Low Stock', 'Reorder Required', 'Overstock'].indexOf(first.alertType) - ['Out of Stock', 'Low Stock', 'Reorder Required', 'Overstock'].indexOf(second.alertType)) || first._id.localeCompare(second._id));
    return { ...refreshed, stats, data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit,
      filterOptions: { warehouse: options('warehouse'), branch: options('branch'), brand: options('brand'), category: options('category'), supplier: options('preferredSupplier') } };
  });
}

async function productForConfig(req) {
  if (!Types.ObjectId.isValid(req.params.productId)) throw httpError(400, 'Invalid product');
  const product = await Product.findOne({ ...await scopedOwnerQuery(req, { ownerField: 'userId' }), _id: req.params.productId });
  if (!product || product.itemType === 'Service' || product.trackInventory === false) throw httpError(404, 'Inventory product not found');
  return product;
}

export async function getStockAlertConfig(req) {
  const product = await productForConfig(req);
  const scope = await resolveBranchScope(req);
  const warehouses = await Warehouse.find({ ...await scopedOwnerQuery(req, { ownerField: 'userId' }), ...(scope.branch ? { branch: scope.branch } : {}) }).select('name branch status').lean();
  return { product: { _id: product._id, description: product.description, code: product.code, minStockLevel: product.minStockLevel, maxStockLevel: product.maxStockLevel,
    reorderLevel: product.reorderLevel, minOrderQty: product.minOrderQty, stockAlertsEnabled: product.stockAlertsEnabled !== false },
    warehouseStockLevels: product.warehouseStockLevels.filter((row) => !scope.branch || row.branch === scope.branch), warehouses,
    canEditProduct: isBusinessSuperAdmin(scope.actor) };
}

export function saveStockAlertConfig(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    const product = await productForConfig(req);
    const scope = await resolveBranchScope(req);
    const body = req.body || {};
    if (!['product', 'warehouse'].includes(body.scope)) throw httpError(400, 'Choose product or warehouse thresholds');
    if (body.scope === 'product' && !isBusinessSuperAdmin(scope.actor)) throw httpError(403, 'Company-wide product thresholds require an owner');
    if (typeof body.enabled !== 'boolean') throw httpError(400, 'Set a valid alert enabled flag');
    const levels = {};
    for (const field of ['minStockLevel', 'maxStockLevel', 'reorderLevel']) {
      const value = body[field];
      if (body.scope === 'warehouse' && value === null) { levels[field] = null; continue; }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw httpError(400, 'Thresholds must be nonnegative finite numbers');
      levels[field] = value;
    }
    if (body.scope === 'warehouse') {
      if (typeof body.warehouse !== 'string' || typeof body.branch !== 'string') throw httpError(400, 'Choose a valid warehouse and branch');
      if (scope.branch && scope.branch !== body.branch) throw httpError(403, 'Warehouse is outside your permitted branch');
      const warehouse = await Warehouse.findOne({ ...await scopedOwnerQuery(req, { ownerField: 'userId' }), name: body.warehouse, branch: body.branch }).select('status').lean();
      if (!warehouse || warehouse.status !== 'Active' && body.enabled) throw httpError(400, 'Select an active authorized warehouse, or disable alerts for the inactive warehouse');
    }
    const effective = { minStockLevel: levels.minStockLevel ?? product.minStockLevel, maxStockLevel: levels.maxStockLevel ?? product.maxStockLevel, reorderLevel: levels.reorderLevel ?? product.reorderLevel };
    if (effective.maxStockLevel > 0 && (effective.maxStockLevel < effective.minStockLevel || effective.reorderLevel > effective.maxStockLevel)) throw httpError(400, 'Maximum must cover minimum and reorder levels');
    const previous = { minStockLevel: product.minStockLevel, maxStockLevel: product.maxStockLevel, reorderLevel: product.reorderLevel, stockAlertsEnabled: product.stockAlertsEnabled, warehouseStockLevels: product.toObject().warehouseStockLevels };
    if (body.scope === 'product') { Object.assign(product, levels); product.stockAlertsEnabled = body.enabled; }
    else {
      const next = { warehouse: body.warehouse, branch: body.branch, ...levels, enabled: body.enabled };
      product.warehouseStockLevels = [...product.warehouseStockLevels.filter((row) => row.warehouse !== body.warehouse || row.branch !== body.branch), next];
    }
    for (const location of product.warehouseStockLevels) {
      const thresholds = effectiveStockThresholds(product, location.branch, location.warehouse);
      if (thresholds.maxStockLevel > 0 && (thresholds.minStockLevel > thresholds.maxStockLevel || thresholds.reorderLevel > thresholds.maxStockLevel)) throw httpError(400, 'These defaults conflict with an existing warehouse threshold');
    }
    await product.save();
    await AuditLog.create({ action: 'update', modelName: 'StockAlertThresholds', documentId: product._id, businessId: req.user.businessId, performedBy: { userId: req.user.id }, meta: { previous, changes: body } });
    await refreshStockAlerts(req);
    return getStockAlertConfig(req);
  });
}

export function reviewStockAlerts(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    if (!Array.isArray(req.body?.ids) || !req.body.ids.length || req.body.ids.length > 100 || new Set(req.body.ids).size !== req.body.ids.length || req.body.ids.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id))) throw httpError(400, 'Select between 1 and 100 distinct valid alerts');
    const refreshed = await refreshStockAlerts(req);
    const allowed = new Set(refreshed.data.map((row) => row._id));
    if (req.body.ids.some((id) => !allowed.has(id))) throw httpError(409, 'Some alerts changed, resolved or are outside your scope. Refresh first.');
    await StockAlert.updateMany({ _id: { $in: req.body.ids }, unresolved: true }, { $set: { state: 'Reviewed', reviewedAt: new Date(), reviewedBy: req.user.id } });
    await AuditLog.create({ action: 'update', modelName: 'StockAlertReview', businessId: req.user.businessId, performedBy: { userId: req.user.id }, meta: { ids: req.body.ids } });
    return { reviewed: req.body.ids.length };
  });
}

export function stockAlertPurchaseOrderSeed(req) {
  return inventoryTransaction(async () => {
    const actor = await AppUser.findById(req.user.id).lean();
    if (!actor || actor.status !== 'Active' || !(isBusinessSuperAdmin(actor) || actor.permissions?.actions?.create)) throw httpError(403, 'Purchase-order creation permission is required');
    const refreshed = await refreshStockAlerts(req);
    const alert = refreshed.data.find((row) => row._id === req.params.id);
    if (!alert || alert.alertType === 'Overstock' || alert.reorderQty <= 0) throw httpError(409, 'This alert no longer requires a purchase. Refresh alerts or configure a reorder target.');
    const product = await Product.findById(alert.productId).lean();
    return { branch: alert.branch, extra: { warehouse: alert.warehouse, stockAlertId: alert._id, stockAlertBranch: alert.branch }, preferredSupplier: alert.preferredSupplier,
      note: `Reorder from ${alert.alertType}: ${alert.reorderQty} ${product.baseUnit || product.unit}. Select the supplier${product.variants?.length ? ' and required variants' : ''} before saving.`,
      items: [{ productId: product._id, productCode: product.code, description: product.description, itemType: 'Product', hsn: product.hsn, barcode: product.barcode,
        brand: product.brand, category: product.category, partNumber: product.partNumber, qty: alert.reorderQty, unit: product.baseUnit || product.unit,
        rate: product.purchasePrice || 0, gstRate: product.gstRate || 0, discount: 0, discountType: 'percent' }] };
  });
}
