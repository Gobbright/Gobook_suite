import { httpError } from '../utils/httpError.js';

export const INVENTORY_COSTING_METHODS = ['selling-price', 'weighted-average', 'fifo'];
export const INVENTORY_STOCK_STATUSES = [{ key: 'healthy', name: 'In Stock' }, { key: 'low', name: 'Low Stock' }, { key: 'out', name: 'Out of Stock' }, { key: 'inactive', name: 'Inactive' }, { key: 'overstock', name: 'Overstock' }];

export function effectiveStockThresholds(product, branch, warehouse) {
  const override = product.warehouseStockLevels?.find((row) => row.branch === branch && row.warehouse === warehouse);
  const minimum = Number(override?.minStockLevel ?? product.minStockLevel ?? 0);
  const maximum = Number(override?.maxStockLevel ?? product.maxStockLevel ?? 0);
  const configuredReorder = override?.reorderLevel ?? (Number(product.reorderLevel) > 0 ? product.reorderLevel : null);
  return { minStockLevel: minimum, maxStockLevel: maximum, reorderLevel: Number(configuredReorder ?? minimum),
    enabled: product.stockAlertsEnabled !== false && override?.enabled !== false, thresholdSource: override ? 'Warehouse override' : 'Product default' };
}

export function inventoryStockStatusKey(row) {
  if (row.status === 'Inactive') return 'inactive';
  if (row.availableQty <= 0) return 'out';
  if (row.availableQty <= Number(row.minStockLevel || 0)) return 'low';
  if (Number(row.maxStockLevel) > 0 && row.physicalQty > Number(row.maxStockLevel)) return 'overstock';
  return 'healthy';
}

export function inventoryStockStatus(row) {
  return INVENTORY_STOCK_STATUSES.find((status) => status.key === inventoryStockStatusKey(row)).name;
}
const text = (value) => String(value ?? '').trim();
const rounded = (value) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const transferTypes = new Set(['stock-transfer', 'stock-transfer-reversal']);

export function stockDate(value, end = false) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(400, 'Stock dates must use YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw httpError(400, 'Invalid stock date');
  return date.getTime() + (end ? 86400000 - 1 : 0);
}

export function inventoryBaseQuantity(item, product) {
  const quantity = Number(item.qty ?? item.totalQty);
  const baseUnit = text(product.baseUnit || product.unit || item.unit || 'Nos');
  const unit = text(item.unit || baseUnit);
  const factor = Number(unit.toLowerCase() === baseUnit.toLowerCase() ? 1
    : unit.toLowerCase() === text(product.purchaseUnit).toLowerCase() && text(product.conversionToUnit).toLowerCase() === baseUnit.toLowerCase() ? product.conversionQty : NaN);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(factor) || factor <= 0) throw httpError(400, `Invalid quantity or unit conversion for ${product.description || 'product'}`);
  if (item.conversionFactor != null && (!Number.isFinite(Number(item.conversionFactor)) || Math.abs(Number(item.conversionFactor) - factor) > 1e-8)) throw httpError(400, 'Unit conversion does not match the product configuration');
  return { quantity: rounded(quantity * factor), enteredQuantity: quantity, conversionFactor: factor, unit, baseUnit };
}

function consume(state, quantity, method) {
  if (quantity > state.qty + 1e-7) {
    state.warnings.add('INSUFFICIENT_COST_HISTORY');
    state.complete = false;
  }
  let remaining = quantity;
  let cost = 0;
  const layers = [];
  if (method === 'weighted-average') {
    const unitCost = state.qty > 0 ? state.value / state.qty : 0;
    cost = Math.min(Math.max(state.qty, 0), quantity) * unitCost;
    layers.push({ quantity: Math.min(Math.max(state.qty, 0), quantity), unitCost });
  } else {
    for (const layer of state.layers) {
      const taken = Math.min(layer.quantity, remaining);
      if (taken > 0) {
        cost += taken * layer.unitCost;
        layers.push({ quantity: taken, unitCost: layer.unitCost, acquiredAt: layer.acquiredAt });
        layer.quantity = rounded(layer.quantity - taken);
        remaining = rounded(remaining - taken);
      }
      if (remaining <= 0) break;
    }
    state.layers = state.layers.filter((layer) => layer.quantity > 1e-8);
  }
  state.qty = rounded(state.qty - quantity);
  state.value = Math.max(0, state.value - cost);
  return { cost, layers };
}

export function calculateInventoryStock({ products = [], movements = [], reservations = [], from, to, branch = '', warehouse = '', variantId = '', batch = '', groupBy = 'product', costingMethod = 'selling-price', now = new Date() } = {}) {
  if (!INVENTORY_COSTING_METHODS.includes(costingMethod)) throw httpError(400, 'Unsupported inventory costing method');
  if (!['product', 'location', 'variant', 'batch'].includes(groupBy)) throw httpError(400, 'Invalid stock grouping');
  const fromTime = stockDate(from);
  const toTime = stockDate(to, true) ?? new Date(now).getTime();
  if (fromTime !== null && fromTime > toTime) throw httpError(400, 'From Date must not follow To Date');
  const productMap = new Map(products.map((product) => [text(product._id), product]));
  const warnings = new Set();
  const seen = new Map();
  const events = [];
  const rawNet = new Map();
  for (const movement of movements) {
    if (movement.status !== 'Completed') continue;
    const product = productMap.get(text(movement.productId));
    if (!product || product.itemType === 'Service' || product.trackInventory === false) continue;
    const quantity = Number(movement.baseQty ?? movement.totalQty);
    const time = new Date(movement.date).getTime();
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(time)) throw httpError(409, 'Inventory contains an invalid completed movement; reconciliation is required');
    const direction = movement.direction;
    if (!['in', 'out'].includes(direction)) throw httpError(409, 'Invalid inventory movement direction');
    const identity = movement.movementKey ? `${text(movement.userId)}:${direction}:${movement.movementKey}` : `${direction}:${text(movement._id)}`;
    const signature = JSON.stringify([text(movement.productId), text(movement.variantId), quantity, movement.branch || '', movement.warehouse || '', time,
      movement.batchNumber || movement.batchSerialNo || '', movement.baseUnit, movement.sourceType, text(movement.sourceId), movement.sourceLineId,
      movement.totalValue, movement.unitCost, movement.costEstimated, movement.costLayers, text(movement.costSourceId), movement.costSourceLineId]);
    if (seen.has(identity)) {
      if (seen.get(identity) !== signature) throw httpError(409, 'Conflicting duplicate inventory movement');
      warnings.add('DUPLICATE_MOVEMENT_IGNORED');
      continue;
    }
    seen.set(identity, signature);
    const productKey = text(product._id);
    rawNet.set(productKey, rounded((rawNet.get(productKey) || 0) + (direction === 'in' ? 1 : -1) * quantity));
    if (movement.excluded) continue;
    events.push({ ...movement, quantity, time, product, branch: text(movement.branch), warehouse: text(movement.warehouse), variantId: text(movement.variantId), batch: text(movement.batchNumber || movement.batchSerialNo) });
  }
  const buckets = new Map();
  const issuedCosts = new Map();
  function bucketFor(event) {
    const key = JSON.stringify([text(event.product._id), event.branch, event.warehouse, event.variantId, event.batch]);
    if (!buckets.has(key)) buckets.set(key, {
      key, product: event.product, productId: text(event.product._id), branch: event.branch, warehouse: event.warehouse,
      variantId: event.variantId, batch: event.batch, unit: event.product.baseUnit || event.product.unit || 'Nos',
      qty: 0, value: 0, layers: [], complete: true, warnings: new Set(), openingQty: 0, openingValue: 0,
      inwardQty: 0, outwardQty: 0, inwardValue: 0, outwardValue: 0, transferInQty: 0, transferOutQty: 0, reservedQty: 0, references: [], transferFlows: new Map(),
    });
    return buckets.get(key);
  }
  const recordedProducts = new Set(events.map((event) => text(event.productId)));
  const recordedVariants = new Set(events.map((event) => JSON.stringify([text(event.productId), event.variantId])));
  for (const product of products) {
    if (product.itemType === 'Service' || product.trackInventory === false) continue;
    const hasExisting = recordedProducts.has(text(product._id));
    const residual = rounded(Number(product.stock || 0) - (rawNet.get(text(product._id)) || 0));
    if (Math.abs(residual) > 1e-7) {
      warnings.add('UNRECORDED_OPENING_BALANCE');
      events.push({ product, productId: product._id, quantity: Math.abs(residual), direction: residual > 0 ? 'in' : 'out',
        time: -Infinity, date: null, branch: hasExisting ? '' : text(product.branch), warehouse: hasExisting ? '' : text(product.warehouse), variantId: '', batch: '', sourceType: 'legacy-opening', inferred: true });
    }
    if (!hasExisting && residual === 0 && !product.variants?.length) bucketFor({ product, branch: text(product.branch), warehouse: text(product.warehouse), variantId: '', batch: '' });
    for (const variant of product.variants || []) {
      if (!recordedVariants.has(JSON.stringify([text(product._id), text(variant._id)]))) bucketFor({ product, branch: text(product.branch), warehouse: text(product.warehouse), variantId: text(variant._id), batch: '' });
    }
    for (const location of product.warehouseStockLevels || []) {
      bucketFor({ product, branch: text(location.branch), warehouse: text(location.warehouse), variantId: '', batch: '' });
    }
  }
  events.sort((left, right) => left.time - right.time || new Date(left.createdAt || 0) - new Date(right.createdAt || 0) || Number(left.direction === 'out') - Number(right.direction === 'out') || text(left._id).localeCompare(text(right._id)));
  for (const event of events) {
    if (event.time > toTime) continue;
    const state = bucketFor(event);
    if (!event.warehouse) state.warnings.add('UNASSIGNED_WAREHOUSE');
    if (!event.variantId && event.product.variants?.length) state.warnings.add('UNASSIGNED_VARIANT');
    let cost;
    if (event.direction === 'in') {
      let restoredLayers;
      const issue = event.costSourceId && issuedCosts.get(JSON.stringify([text(event.costSourceId), text(event.costSourceLineId), text(event.productId), event.variantId]));
      if (issue && issue.layers.reduce((sum, layer) => sum + layer.quantity, 0) + 1e-8 >= event.quantity) {
        let remaining = event.quantity;
        restoredLayers = [];
        for (const layer of issue.layers) {
          const taken = Math.min(remaining, layer.quantity);
          if (taken > 0) restoredLayers.push({ ...layer, quantity: taken });
          layer.quantity -= taken;
          remaining -= taken;
          if (remaining <= 1e-8) break;
        }
        if (!issue.complete) { state.complete = false; state.warnings.add('ESTIMATED_HISTORICAL_COST'); }
      }
      if (event.costEstimated && !restoredLayers) { state.complete = false; state.warnings.add('ESTIMATED_HISTORICAL_COST'); }
      const variant = event.product.variants?.find((entry) => text(entry._id) === event.variantId);
      let unitCost = Number(event.unitCost);
      if (event.unitCost == null) {
        if (['purchase-entry'].includes(event.sourceType) && event.quantity > 0) unitCost = Number(event.totalValue) / event.quantity;
        else {
          unitCost = Number(variant?.purchasePrice ?? event.product.purchasePrice) || 0;
          if (!restoredLayers && !event.costLayers?.length) {
            state.warnings.add('ESTIMATED_HISTORICAL_COST');
            state.complete = false;
          }
        }
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) throw httpError(409, 'Invalid inventory unit cost');
      const costLayers = restoredLayers || (event.costLayers?.length ? event.costLayers : [{ quantity: event.quantity, unitCost, acquiredAt: event.date }]);
      if (Math.abs(costLayers.reduce((sum, layer) => sum + Number(layer.quantity), 0) - event.quantity) > 1e-6) throw httpError(409, 'Inventory cost layers do not match movement quantity');
      cost = 0;
      for (const layer of costLayers) {
        if (!Number.isFinite(Number(layer.unitCost)) || Number(layer.unitCost) < 0 || !Number.isFinite(Number(layer.quantity)) || Number(layer.quantity) <= 0) throw httpError(409, 'Invalid inventory cost layer');
        cost += Number(layer.quantity) * Number(layer.unitCost);
        state.layers.push({ quantity: Number(layer.quantity), unitCost: Number(layer.unitCost), acquiredAt: layer.acquiredAt || event.date });
      }
      state.layers.sort((left, right) => new Date(left.acquiredAt || 0) - new Date(right.acquiredAt || 0));
      state.qty = rounded(state.qty + event.quantity);
      state.value += cost;
    } else {
      const issued = consume(state, event.quantity, costingMethod);
      cost = issued.cost;
      if (event.sourceId && event.sourceLineId != null) issuedCosts.set(JSON.stringify([text(event.sourceId), text(event.sourceLineId), text(event.productId), event.variantId]), { layers: issued.layers, complete: state.complete });
    }
    const beforePeriod = event.inferred || fromTime !== null && event.time < fromTime;
    if (beforePeriod) {
      state.openingQty = state.qty;
      state.openingValue = state.value;
    } else {
      state[event.direction === 'in' ? 'inwardQty' : 'outwardQty'] += event.quantity;
      state[event.direction === 'in' ? 'inwardValue' : 'outwardValue'] += cost;
      if (transferTypes.has(event.sourceType)) {
        state[event.direction === 'in' ? 'transferInQty' : 'transferOutQty'] += event.quantity;
        if (event.sourceId) {
          const identity = `${event.sourceType}:${event.sourceId}`;
          const flow = state.transferFlows.get(identity) || { inQty: 0, outQty: 0, inValue: 0, outValue: 0 };
          flow[event.direction === 'in' ? 'inQty' : 'outQty'] += event.quantity;
          flow[event.direction === 'in' ? 'inValue' : 'outValue'] += cost;
          state.transferFlows.set(identity, flow);
        } else state.warnings.add('MISSING_TRANSFER_REFERENCE');
      }
    }
    if (!event.inferred) state.references.push({ movementId: text(event._id), direction: event.direction, quantity: event.quantity, sourceType: event.sourceType, sourceId: text(event.sourceId), sourceLineId: text(event.sourceLineId), sourceNo: event.sourceNo || '', date: event.date });
  }
  for (const reservation of reservations) {
    const created = new Date(reservation.date || reservation.createdAt).getTime();
    const ended = reservation.releasedAt || reservation.consumedAt || reservation.cancelledAt;
    if (!Number.isFinite(created) || created > toTime || ended && new Date(ended).getTime() <= toTime || reservation.expiresAt && new Date(reservation.expiresAt).getTime() <= toTime) continue;
    if (reservation.status !== 'Active' && !ended) continue;
    const product = productMap.get(text(reservation.productId));
    if (!product) continue;
    const quantity = Number(reservation.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(409, 'Invalid stock reservation quantity');
    bucketFor({ product, branch: text(reservation.branch), warehouse: text(reservation.warehouse), variantId: text(reservation.variantId), batch: text(reservation.batchNumber) }).reservedQty += quantity;
  }
  const grouped = new Map();
  for (const state of buckets.values()) {
    if (branch && state.branch !== branch || warehouse && state.warehouse !== warehouse || variantId && state.variantId !== variantId || batch && state.batch !== batch) continue;
    const key = JSON.stringify([state.productId, ...(groupBy === 'product' ? [] : [state.branch, state.warehouse]), ...(groupBy === 'variant' || groupBy === 'batch' ? [state.variantId] : []), ...(groupBy === 'batch' ? [state.batch] : [])]);
    if (!grouped.has(key)) grouped.set(key, { ...state, qty: 0, value: 0, layers: [], openingQty: 0, openingValue: 0, inwardQty: 0, outwardQty: 0, inwardValue: 0, outwardValue: 0, transferInQty: 0, transferOutQty: 0, reservedQty: 0, references: [], warnings: new Set(), complete: true, transferFlows: new Map() });
    const row = grouped.get(key);
    if (groupBy === 'product') {
      if (row.branch !== state.branch) row.branch = '';
      if (row.warehouse !== state.warehouse) row.warehouse = '';
    }
    for (const field of ['qty', 'value', 'openingQty', 'openingValue', 'inwardQty', 'outwardQty', 'inwardValue', 'outwardValue', 'transferInQty', 'transferOutQty', 'reservedQty']) row[field] += state[field];
    row.complete = row.complete && state.complete;
    row.layers.push(...state.layers);
    row.references.push(...state.references);
    for (const [identity, flow] of state.transferFlows) {
      const aggregate = row.transferFlows.get(identity) || { inQty: 0, outQty: 0, inValue: 0, outValue: 0 };
      for (const field of ['inQty', 'outQty', 'inValue', 'outValue']) aggregate[field] += flow[field];
      row.transferFlows.set(identity, aggregate);
    }
    for (const warning of state.warnings) row.warnings.add(warning);
  }
  const data = [...grouped.values()].map((row) => {
    for (const flow of row.transferFlows.values()) {
      const internal = Math.min(flow.inQty, flow.outQty);
      row.inwardQty -= internal;
      row.outwardQty -= internal;
      if (flow.inQty) row.inwardValue -= flow.inValue * internal / flow.inQty;
      if (flow.outQty) row.outwardValue -= flow.outValue * internal / flow.outQty;
    }
    const sellingRate = Number(row.product.rate || 0);
    const { product, layers, warnings: rowWarnings, complete, qty, value, references, key, transferFlows, ...fields } = row;
    return { ...fields, branch: groupBy === 'product' ? branch || row.branch : row.branch, warehouse: groupBy === 'product' ? warehouse || row.warehouse : row.warehouse,
      variantId: groupBy === 'product' || groupBy === 'location' ? '' : row.variantId, batch: groupBy === 'batch' ? row.batch : '',
      openingQty: rounded(row.openingQty), inwardQty: rounded(row.inwardQty), outwardQty: rounded(row.outwardQty), closingQty: rounded(qty), physicalQty: rounded(qty),
      reservedQty: rounded(row.reservedQty), availableQty: rounded(qty - row.reservedQty),
      openingValue: costingMethod === 'selling-price' ? money(row.openingQty * sellingRate) : complete ? money(row.openingValue) : null,
      closingValue: costingMethod === 'selling-price' ? money(qty * sellingRate) : complete ? money(value) : null,
      estimatedClosingValue: money(value), costingMethod, valuationComplete: costingMethod === 'selling-price' || complete,
      costLayers: layers, warnings: [...rowWarnings], references };
  });
  return { data, costingMethod, from: from || null, to: to || new Date(toTime).toISOString().slice(0, 10), warnings: [...warnings] };
}
