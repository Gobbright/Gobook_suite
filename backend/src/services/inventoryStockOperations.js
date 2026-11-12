import { createHash, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { Product } from '../models/Product.js';
import { Warehouse } from '../models/Warehouse.js';
import { StockIn } from '../models/StockIn.js';
import { StockOut } from '../models/StockOut.js';
import { InventoryTransfer } from '../models/InventoryTransfer.js';
import { InventoryReservation } from '../models/InventoryReservation.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { AppUser } from '../models/AppUser.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { inventoryBaseQuantity, stockDate } from './inventoryStockCalculation.js';
import { loadInventoryStock } from './inventoryStockService.js';
import { scopedOwnerQuery } from '../utils/tenantScope.js';
import { resolveBranchScope } from '../utils/branchScope.js';
import { httpError } from '../utils/httpError.js';

const clean = (value) => String(value ?? '').trim();
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function assertInventoryPermission(req) {
  const actor = await AppUser.findById(req.user.id).select('role accountType status permissions').lean();
  if (!actor || actor.status !== 'Active' || !(actor.accountType === 'owner' || actor.role === 'Super Admin' || actor.permissions?.actions?.edit === true)) throw httpError(403, 'Inventory alteration permission is required');
}

async function productForRequest(req, productId, variantId) {
  const product = await Product.findOne({ ...await scopedOwnerQuery(req, { model: Product, ownerField: 'userId' }), _id: productId }).lean();
  if (!product || product.status !== 'Active' || product.itemType === 'Service' || product.trackInventory === false) throw httpError(400, 'Select an active inventory product');
  if (product.variants?.length && !product.variants.some((variant) => String(variant._id) === String(variantId))) throw httpError(400, 'Select a valid product variant');
  if (!product.variants?.length && variantId) throw httpError(400, 'This product does not have that variant');
  return product;
}

async function assertLocation(req, warehouse, branch) {
  const scope = await resolveBranchScope(req);
  if (scope.branch && scope.branch !== branch) throw httpError(403, 'The inventory location is outside your permitted branch');
  const found = await Warehouse.findOne({ ...await scopedOwnerQuery(req, { model: Warehouse, ownerField: 'userId' }), name: warehouse, branch, status: 'Active' }).lean();
  if (!found || clean(found.branch) !== branch) throw httpError(400, 'Select an active warehouse in the specified branch');
}

async function costMethod(req) {
  const owner = req.user.businessId ? await AppUser.findOne({ businessId: req.user.businessId, accountType: 'owner' }).select('_id').lean() : null;
  return (await BusinessSettings.findOne({ userId: owner?._id || req.user.id }).lean())?.inventoryCostingMethod || 'selling-price';
}

async function locationStock(req, product, location) {
  const report = await loadInventoryStock({ products: [product], groupBy: 'batch', ...location, costingMethod: await costMethod(req) });
  report.data = report.data.filter((row) => row.branch === location.branch && row.warehouse === location.warehouse);
  return report;
}

function validateRequest(body) {
  if (!Types.ObjectId.isValid(String(body.productId || '')) || body.variantId && !Types.ObjectId.isValid(String(body.variantId))) throw httpError(400, 'Select valid product and variant identifiers');
  for (const field of ['requestId', 'referenceNo', 'branch', 'warehouse', 'fromBranch', 'toBranch', 'fromWarehouse', 'toWarehouse', 'batchNumber', 'unit']) {
    if (body[field] != null && typeof body[field] !== 'string') throw httpError(400, `Invalid inventory field: ${field}`);
  }
  if (!/^[\w.-]{8,100}$/.test(body.requestId || '')) throw httpError(400, 'A stable requestId of 8–100 letters, digits, dots, dashes or underscores is required');
  if (!clean(body.referenceNo) || clean(body.referenceNo).length > 100) throw httpError(400, 'A reference number of at most 100 characters is required');
}

function exactStock(report, variantId, batchNumber) {
  const rows = report.data.filter((row) => row.variantId === clean(variantId) && row.batch === clean(batchNumber));
  return { available: rows.reduce((sum, row) => sum + row.availableQty, 0), rows };
}

async function touchProduct(product) {
  const result = await Product.updateOne({ _id: product._id, userId: product.userId }, { $inc: { inventoryRevision: 1 } });
  if (result.matchedCount !== 1) throw httpError(409, 'Inventory product changed; refresh and retry');
}

export function reserveInventory(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    const body = req.body || {};
    validateRequest(body);
    const product = await productForRequest(req, body.productId, body.variantId);
    const branch = clean(body.branch);
    const warehouse = clean(body.warehouse);
    await assertLocation(req, warehouse, branch);
    const quantity = inventoryBaseQuantity({ qty: body.quantity, unit: body.unit }, product).quantity;
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) throw httpError(400, 'Reservation expiry must be in the future');
    const details = { productId: String(product._id), variantId: clean(body.variantId), branch, warehouse, batchNumber: clean(body.batchNumber), quantity, referenceNo: clean(body.referenceNo), expiresAt: expiresAt?.toISOString() || null };
    const signature = fingerprint(details);
    const existing = await InventoryReservation.findOne({ userId: product.userId, requestId: body.requestId });
    if (existing) {
      if (existing.fingerprint !== signature) throw httpError(409, 'requestId was already used for a different reservation');
      return existing;
    }
    const report = await locationStock(req, product, { branch, warehouse });
    if (exactStock(report, body.variantId, body.batchNumber).available + 1e-8 < quantity) throw httpError(409, 'Insufficient available stock for this reservation');
    await touchProduct(product);
    return InventoryReservation.create({ ...details, userId: product.userId, businessId: req.user.businessId, createdByUserId: req.user.id,
      variantId: body.variantId || undefined, requestId: body.requestId, fingerprint: signature, date: new Date(), expiresAt, unit: product.baseUnit || product.unit });
  });
}

export function releaseInventory(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    if (!clean(req.body?.reason)) throw httpError(400, 'A reservation release reason is required');
    const reservation = await InventoryReservation.findOne({ ...await scopedOwnerQuery(req, { model: InventoryReservation, ownerField: 'userId' }), _id: req.params.id });
    if (!reservation) throw httpError(404, 'Reservation not found');
    await assertLocation(req, reservation.warehouse, reservation.branch);
    if (reservation.status === 'Released') return reservation;
    if (reservation.status !== 'Active') throw httpError(409, 'Only active reservations can be released');
    reservation.status = 'Released';
    reservation.releasedAt = new Date();
    reservation.releasedByUserId = req.user.id;
    reservation.releaseReason = clean(req.body.reason).slice(0, 500);
    await reservation.save();
    return reservation;
  });
}

export function createInventoryTransfer(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    const body = req.body || {};
    validateRequest(body);
    const product = await productForRequest(req, body.productId, body.variantId);
    const fromBranch = clean(body.fromBranch);
    const toBranch = clean(body.toBranch);
    const fromWarehouse = clean(body.fromWarehouse);
    const toWarehouse = clean(body.toWarehouse);
    await assertLocation(req, fromWarehouse, fromBranch);
    await assertLocation(req, toWarehouse, toBranch);
    if (fromWarehouse === toWarehouse && fromBranch === toBranch) throw httpError(400, 'Transfer source and destination must differ');
    const date = stockDate(body.date);
    if (date === null || date > Date.now()) throw httpError(400, 'Select a valid non-future transfer date');
    const details = { productId: String(product._id), variantId: clean(body.variantId), batchNumber: clean(body.batchNumber), fromBranch, toBranch, fromWarehouse, toWarehouse,
      quantity: inventoryBaseQuantity({ qty: body.quantity, unit: body.unit }, product).quantity, referenceNo: clean(body.referenceNo), date: new Date(date).toISOString() };
    const signature = fingerprint(details);
    const existing = await InventoryTransfer.findOne({ userId: product.userId, requestId: body.requestId });
    if (existing) {
      if (existing.fingerprint !== signature) throw httpError(409, 'requestId was already used for a different transfer');
      return existing;
    }
    return InventoryTransfer.create({ ...details, variantId: body.variantId || undefined, userId: product.userId, businessId: req.user.businessId, createdByUserId: req.user.id,
      requestId: body.requestId, fingerprint: signature, unit: product.baseUnit || product.unit });
  });
}

async function transferLegs(transfer, { reverse = false, unitCost, costLayers, estimated = false } = {}) {
  const sourceType = reverse ? 'stock-transfer-reversal' : 'stock-transfer';
  const quantity = transfer.quantity;
  const pair = randomUUID();
  const common = { userId: transfer.userId, businessId: transfer.businessId, productId: transfer.productId, variantId: transfer.variantId,
    batchNumber: transfer.batchNumber, baseQty: quantity, totalQty: quantity, itemCount: 1, sourceType, sourceId: transfer._id, sourceLineId: '0',
    sourceNo: transfer.referenceNo, referenceNo: transfer.referenceNo, status: 'Completed', date: reverse ? new Date() : transfer.date,
    unit: transfer.unit, baseUnit: transfer.unit, conversionFactor: 1, enteredQuantity: quantity,
    unitCost, costLayers, costEstimated: estimated, totalValue: unitCost * quantity };
  await StockOut.create({ ...common, stockOutNo: `TR-OUT-${pair}`, movementKey: `${sourceType}:${transfer._id}:out`,
    branch: reverse ? transfer.toBranch : transfer.fromBranch, warehouse: reverse ? transfer.toWarehouse : transfer.fromWarehouse, to: transfer.referenceNo });
  await StockIn.create({ ...common, stockInNo: `TR-IN-${pair}`, movementKey: `${sourceType}:${transfer._id}:in`,
    branch: reverse ? transfer.fromBranch : transfer.toBranch, warehouse: reverse ? transfer.fromWarehouse : transfer.toWarehouse, supplier: transfer.referenceNo });
}

function takeLayers(rows, quantity, method) {
  const available = rows.reduce((sum, row) => sum + row.physicalQty, 0);
  const value = rows.reduce((sum, row) => sum + row.estimatedClosingValue, 0);
  if (method !== 'fifo') return [{ quantity, unitCost: available > 0 ? value / available : 0 }];
  let remaining = quantity;
  const selected = [];
  for (const layer of rows.flatMap((row) => row.costLayers).sort((left, right) => new Date(left.acquiredAt || 0) - new Date(right.acquiredAt || 0))) {
    const taken = Math.min(remaining, layer.quantity);
    if (taken > 0) selected.push({ ...layer, quantity: taken });
    remaining -= taken;
    if (remaining <= 1e-8) break;
  }
  if (remaining > 1e-8) throw httpError(409, 'Reconcile inventory cost history before transferring these goods');
  return selected;
}

export function transitionInventoryTransfer(req) {
  return inventoryTransaction(async () => {
    await assertInventoryPermission(req);
    const transfer = await InventoryTransfer.findOne({ ...await scopedOwnerQuery(req, { model: InventoryTransfer, ownerField: 'userId' }), _id: req.params.id });
    if (!transfer) throw httpError(404, 'Transfer not found');
    const action = req.body?.action;
    if (!['post', 'cancel'].includes(action)) throw httpError(400, 'Transfer action must be post or cancel');
    await assertLocation(req, transfer.fromWarehouse, transfer.fromBranch);
    await assertLocation(req, transfer.toWarehouse, transfer.toBranch);
    if (action === 'post' && transfer.status === 'Posted' || action === 'cancel' && transfer.status === 'Cancelled') return transfer;
    if (action === 'post' && transfer.status !== 'Draft') throw httpError(409, 'Only draft transfers can be posted');
    if (action === 'cancel' && !clean(req.body.reason)) throw httpError(400, 'A cancellation reason is required');
    const product = await productForRequest(req, transfer.productId, transfer.variantId);
    const method = await costMethod(req);
    if (action === 'post') {
      const latest = await Promise.all([StockIn.findOne({ userId: product.userId, productId: product._id, status: 'Completed' }).sort({ date: -1 }).lean(), StockOut.findOne({ userId: product.userId, productId: product._id, status: 'Completed' }).sort({ date: -1 }).lean()]);
      if (latest.some((row) => row && new Date(row.date).toISOString().slice(0, 10) > transfer.date.toISOString().slice(0, 10))) throw httpError(409, 'Backdated transfers require reconciliation of subsequent movements');
      const report = await locationStock(req, product, { branch: transfer.fromBranch, warehouse: transfer.fromWarehouse });
      if (report.warnings.includes('UNRECORDED_OPENING_BALANCE')) throw httpError(409, 'Reconcile opening stock movements before transferring legacy balances');
      const stock = exactStock(report, transfer.variantId, transfer.batchNumber);
      if (stock.available + 1e-8 < transfer.quantity) throw httpError(409, 'Insufficient available stock at the transfer source');
      const costLayers = takeLayers(stock.rows, transfer.quantity, method);
      const cost = costLayers.reduce((sum, layer) => sum + layer.quantity * layer.unitCost, 0) / transfer.quantity;
      await touchProduct(product);
      await transferLegs(transfer, { unitCost: cost, costLayers, estimated: stock.rows.some((row) => row.warnings.includes('ESTIMATED_HISTORICAL_COST')) });
      transfer.status = 'Posted'; transfer.postedAt = new Date(); transfer.postedByUserId = req.user.id;
    } else {
      if (transfer.status === 'Posted') {
        const subsequent = { userId: product.userId, productId: product._id, branch: transfer.toBranch, warehouse: transfer.toWarehouse,
          sourceId: { $ne: transfer._id }, status: 'Completed', createdAt: { $gt: transfer.postedAt },
          ...(transfer.variantId ? { variantId: transfer.variantId } : {}), ...(transfer.batchNumber ? { batchNumber: transfer.batchNumber } : {}) };
        if (await StockIn.exists(subsequent) || await StockOut.exists(subsequent)) throw httpError(409, 'Subsequent destination movements exist. Create a new return transfer instead of cancelling historical stock.');
        const report = await locationStock(req, product, { branch: transfer.toBranch, warehouse: transfer.toWarehouse });
        const stock = exactStock(report, transfer.variantId, transfer.batchNumber);
        if (stock.available + 1e-8 < transfer.quantity) throw httpError(409, 'Transferred stock is no longer available to reverse');
        const costLayers = takeLayers(stock.rows, transfer.quantity, method);
        const cost = costLayers.reduce((sum, layer) => sum + layer.quantity * layer.unitCost, 0) / transfer.quantity;
        await touchProduct(product);
        await transferLegs(transfer, { reverse: true, unitCost: cost, costLayers, estimated: stock.rows.some((row) => row.warnings.includes('ESTIMATED_HISTORICAL_COST')) });
      }
      transfer.status = 'Cancelled'; transfer.cancelledAt = new Date(); transfer.cancelledByUserId = req.user.id; transfer.cancelReason = clean(req.body.reason).slice(0, 500);
    }
    await transfer.save();
    return transfer;
  });
}
