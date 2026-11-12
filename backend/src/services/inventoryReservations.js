import { InventoryReservation } from '../models/InventoryReservation.js';
import { httpError } from '../utils/httpError.js';

export async function assertUnreservedInventory(product, quantity, variantId, options = {}) {
  if (!(Number(product.inventoryRevision) > 0)) return;
  const now = new Date();
  const reservations = await InventoryReservation.find({ userId: product.userId, productId: product._id, status: 'Active',
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }], date: { $lte: now } }).lean();
  const reserved = reservations.reduce((sum, row) => sum + Number(row.quantity), 0);
  if (Number(product.stock) - quantity + 1e-8 < reserved) throw httpError(409, 'Stock is reserved. Release the reservation before issuing these goods.');
  if (variantId) {
    const variant = product.variants?.find((row) => String(row._id) === String(variantId));
    const held = reservations.filter((row) => String(row.variantId) === String(variantId)).reduce((sum, row) => sum + Number(row.quantity), 0);
    if (variant && Number(variant.stock) - Number(options.variantQuantity ?? quantity) + 1e-8 < held) throw httpError(409, 'Variant stock is reserved. Release the reservation before issuing these goods.');
  }
}
