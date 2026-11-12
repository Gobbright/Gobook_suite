import { loadInventoryStock } from './inventoryStockService.js';
import { httpError } from '../utils/httpError.js';

export async function assertLocationInventory(product, quantity, { branch, warehouse, variantId, batchNumber } = {}) {
  if (!(Number(product.inventoryRevision) > 0)) return;
  const report = await loadInventoryStock({ products: [product], groupBy: 'batch', branch: branch ?? product.branch ?? '', warehouse: warehouse || product.warehouse || '', costingMethod: 'selling-price' });
  const available = report.data.filter((row) => row.branch === (branch ?? product.branch ?? '') && row.warehouse === (warehouse || product.warehouse || '')
    && (!variantId || row.variantId === String(variantId)) && row.batch === String(batchNumber || '')).reduce((sum, row) => sum + row.availableQty, 0);
  if (available + 1e-8 < quantity) throw httpError(409, 'Insufficient available stock at the selected warehouse, branch, variant or batch');
}
