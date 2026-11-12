import { Types } from 'mongoose';

import { Product } from '../models/Product.js';
import { httpError } from '../utils/httpError.js';
import { assertUnreservedInventory } from './inventoryReservations.js';
import { assertLocationInventory } from './inventoryAvailability.js';

function clean(value) {
  return String(value ?? '').trim();
}

function escapeRegex(value) {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function variantLabel(variant = {}) {
  return clean(variant.size || variant.modelName || variant.modelCode || variant.barcode);
}

async function resolveProduct(entry) {
  const userId = entry.userId;
  let product = null;
  if (entry.productId) {
    if (!Types.ObjectId.isValid(String(entry.productId))) throw httpError(400, 'Select a valid inventory product');
    product = await Product.findOne({ _id: entry.productId, userId });
    if (!product) throw httpError(409, 'The selected inventory product no longer exists. Refresh and select it again.');
  }
  if (!entry.productId && clean(entry.productName)) {
    product = await Product.findOne({
      userId,
      description: new RegExp(`^${escapeRegex(entry.productName)}$`, 'i'),
    });
  }
  if (!product) throw httpError(400, 'Select a valid inventory product');
  if (product.itemType === 'Service') throw httpError(400, 'Services do not have inventory stock');
  return product;
}

function resolveVariant(product, entry) {
  const variants = product.variants || [];
  if (!variants.length) return null;
  let variant = null;
  if (entry.variantId && Types.ObjectId.isValid(String(entry.variantId))) {
    variant = variants.find((row) => String(row._id) === String(entry.variantId));
  }
  const name = clean(entry.variantName).toLowerCase();
  if (!variant && name) {
    variant = variants.find((row) => variantLabel(row).toLowerCase() === name);
  }
  if (!variant) throw httpError(400, `Select a valid variant for ${product.description}`);
  return variant;
}

export async function adjustManualStock(entry, direction, { allowNegative = false } = {}) {
  if (!entry || entry.sourceType || entry.status !== 'Completed') return null;
  const qty = Number(entry.totalQty) || 0;
  if (qty <= 0) return null;
  if (![1, -1].includes(direction)) throw new Error('Stock direction must be 1 or -1');

  const product = await resolveProduct(entry);
  const variant = resolveVariant(product, entry);
  if (!allowNegative && direction < 0) await assertUnreservedInventory(product, qty, variant?._id);
  if (!allowNegative && direction < 0) await assertLocationInventory(product, qty, { branch: entry.branch || product.branch, warehouse: entry.warehouse || product.warehouse, variantId: variant?._id, batchNumber: entry.batchNumber || entry.batchSerialNo });
  const filter = { _id: product._id, userId: entry.userId };
  const increments = { stock: direction * qty };
  const options = {};

  if (!allowNegative && direction < 0) filter.stock = { $gte: qty };
  if (variant) {
    filter.variants = {
      $elemMatch: {
        _id: variant._id,
        ...(!allowNegative && direction < 0 ? { stock: { $gte: qty } } : {}),
      },
    };
    increments['variants.$[variant].stock'] = direction * qty;
    options.arrayFilters = [{
      'variant._id': variant._id,
      ...(!allowNegative && direction < 0 ? { 'variant.stock': { $gte: qty } } : {}),
    }];
  }

  const result = await Product.updateOne(filter, { $inc: increments }, options);
  if (result.matchedCount !== 1) {
    throw httpError(409, `Insufficient stock for ${product.description}${variant ? ` (${variantLabel(variant)})` : ''}. Refresh and retry.`);
  }
  return { productId: product._id, variantId: variant?._id || null };
}

export async function assertManualStockNonnegative(entries = []) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || entry.sourceType || entry.status !== 'Completed' || Number(entry.totalQty) <= 0) continue;
    const product = await resolveProduct(entry);
    if (seen.has(String(product._id))) continue;
    seen.add(String(product._id));
    if (Number(product.stock) < 0 || (product.variants || []).some((variant) => Number(variant.stock) < 0)) {
      throw httpError(409, `Stock already issued from ${product.description}. Reduce the adjustment quantity or add stock before changing this record.`);
    }
    await assertUnreservedInventory(product, 0);
    for (const variant of product.variants || []) await assertUnreservedInventory(product, 0, variant._id, { variantQuantity: 0 });
  }
}

