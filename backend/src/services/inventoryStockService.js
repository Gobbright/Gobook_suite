import { Product } from '../models/Product.js';
import { StockIn } from '../models/StockIn.js';
import { StockOut } from '../models/StockOut.js';
import { Invoice } from '../models/Invoice.js';
import { OnlineOrder } from '../models/OnlineOrder.js';
import { InventoryTransfer } from '../models/InventoryTransfer.js';
import { InventoryReservation } from '../models/InventoryReservation.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { AppUser } from '../models/AppUser.js';
import { calculateInventoryStock, inventoryStockStatus, stockDate } from './inventoryStockCalculation.js';
import { resolveBranchScope } from '../utils/branchScope.js';
import { scopedOwnerQuery } from '../utils/tenantScope.js';
import { httpError } from '../utils/httpError.js';
import { inventoryTransaction } from './inventoryTransaction.js';

export async function loadInventoryStock({ products, from, to, branch, warehouse, variantId, batch, groupBy, costingMethod, now }) {
  const ids = products.map((product) => product._id);
  const owners = [...new Set(products.map((product) => String(product.userId)))];
  const match = { userId: { $in: owners }, productId: { $in: ids }, status: 'Completed' };
  const [incoming, outgoing, reservations] = await Promise.all([
    StockIn.find(match).lean(), StockOut.find(match).lean(),
    InventoryReservation.find({ userId: { $in: owners }, productId: { $in: ids } }).lean(),
  ]);
  const movements = [...incoming.map((row) => ({ ...row, direction: 'in' })), ...outgoing.map((row) => ({ ...row, direction: 'out' }))];
  const sourceIds = [...new Set(movements.filter((row) => row.sourceId).map((row) => String(row.sourceId)))];
  const [invoices, orders, transfers] = await Promise.all([
    Invoice.find({ userId: { $in: owners }, _id: { $in: sourceIds } }, { lifecycleStatus: 1, returnStatus: 1, documentType: 1 }).lean(),
    OnlineOrder.find({ userId: { $in: owners }, _id: { $in: sourceIds } }, { status: 1 }).lean(),
    InventoryTransfer.find({ userId: { $in: owners }, _id: { $in: sourceIds } }, { status: 1 }).lean(),
  ]);
  const excluded = new Set([
    ...invoices.filter((row) => ['draft', 'cancelled'].includes(row.lifecycleStatus) || row.documentType === 'sales-return' && ['requested', 'received'].includes(row.returnStatus)),
    ...orders.filter((row) => ['Pending', 'Cancelled'].includes(row.status)), ...transfers.filter((row) => row.status !== 'Posted'),
  ].map((row) => String(row._id)));
  const warnings = [];
  const resolved = movements.map((row) => ({ ...row, excluded: excluded.has(String(row.sourceId)) }));
  const result = calculateInventoryStock({ products, movements: resolved, reservations, from, to, branch, warehouse, variantId, batch, groupBy, costingMethod, now });
  if (movements.some((row) => !row.sourceId && row.sourceType)) warnings.push('MISSING_SOURCE_REFERENCE');
  return { ...result, warnings: [...new Set([...result.warnings, ...warnings])] };
}

async function inventoryReportInTransaction(req) {
  const query = req.query || {};
  stockDate(query.dateFrom || query.from);
  stockDate(query.dateTo || query.to, true);
  const scope = await resolveBranchScope(req);
  const filter = await scopedOwnerQuery(req, { model: Product, ownerField: 'userId' });
  const products = await Product.find(filter).lean();
  let ownerId = req.user.id;
  if (req.user.businessId) ownerId = (await AppUser.findOne({ businessId: req.user.businessId, accountType: 'owner' }).select('_id').lean())?._id || ownerId;
  const settings = await BusinessSettings.findOne({ userId: ownerId }, { inventoryCostingMethod: 1 }).lean();
  const costingMethod = settings?.inventoryCostingMethod || 'selling-price';
  for (const key of ['branch', 'warehouse', 'variantId', 'batch', 'groupBy', 'search', 'category', 'brand', 'status', 'productId', 'itemType']) {
    if (query[key] !== undefined && typeof query[key] !== 'string') throw httpError(400, `Invalid stock filter: ${key}`);
  }
  for (const key of ['warehouseMissing', 'branchMissing', 'variantMissing', 'batchMissing']) {
    if (query[key] != null && !['0', '1'].includes(query[key])) throw httpError(400, `Invalid stock filter: ${key}`);
  }
  const selected = products.filter((product) => (!query.productId || String(product._id) === query.productId)
    && (query.itemType === 'Service' ? product.itemType === 'Service' : product.itemType !== 'Service')
    && (!query.category || query.category === 'All Categories' || product.category === query.category)
    && (!query.brand || product.brand === query.brand)
    && (!query.search || [product.description, product.code, product.sku, product.partNumber, product.barcode, product.hsn, ...(product.variants || []).flatMap((variant) => [variant.barcode, variant.modelCode])].join(' ').toLowerCase().includes(query.search.toLowerCase())));
  const result = await loadInventoryStock({ products: selected, from: query.dateFrom || query.from, to: query.dateTo || query.to, branch: scope.branch,
    warehouse: query.warehouse, variantId: query.variantId, batch: query.batch, groupBy: query.groupBy || 'product', costingMethod });
  const byId = new Map(selected.map((product) => [String(product._id), product]));
  result.data = result.data.filter((row) => {
    for (const [flag, field] of [['warehouseMissing', 'warehouse'], ['branchMissing', 'branch'], ['variantMissing', 'variantId'], ['batchMissing', 'batch']]) {
      if (query[flag] === '1' && row[field]) return false;
    }
    const product = byId.get(row.productId);
    if (query.status === 'active') return product.status === 'Active';
    if (query.status === 'inactive') return product.status === 'Inactive';
    if (query.status === 'out') return product.status === 'Active' && row.availableQty <= 0;
    if (query.status === 'low') return product.status === 'Active' && row.availableQty > 0 && row.availableQty <= Number(product.minStockLevel || 0);
    return true;
  }).map((row) => ({ ...byId.get(row.productId), ...row, _id: query.groupBy && query.groupBy !== 'product' ? JSON.stringify([row.productId, row.branch, row.warehouse, row.variantId, row.batch]) : row.productId,
    stock: row.physicalQty, stockInQty: row.inwardQty, stockOutQty: row.outwardQty, stockValue: row.closingValue,
    stockStatus: inventoryStockStatus({ ...byId.get(row.productId), ...row }) }));
  return result;
}

export function inventoryReportForRequest(req) {
  return inventoryTransaction(() => inventoryReportInTransaction(req));
}
