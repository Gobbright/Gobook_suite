import 'dotenv/config';
import mongoose from 'mongoose';

import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { postInventoryForDocument } from '../src/services/inventoryMovements.js';
import { isFinanciallyActive } from '../src/services/salesLifecycle.js';

const OUT_TYPES = new Set(['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice', 'supplier-return']);
const IN_TYPES = new Set(['purchase-entry', 'sales-return']);
const DOC_TYPES = [...OUT_TYPES, ...IN_TYPES];

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function stockQuantity(doc, item) {
  return Number(doc.documentType === 'sales-return' && doc.returnStatus ? item.restockQty : item.qty) || 0;
}

function hasStockItems(doc) {
  return (doc.items || []).some((item) => item.itemType !== 'Service' && stockQuantity(doc, item) > 0);
}

function escapeRegex(value) {
  return String(value ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function hasResolvableStockItems(doc) {
  const stockItems = (doc.items || []).filter((item) => item.itemType !== 'Service' && stockQuantity(doc, item) > 0);
  for (const item of stockItems) {
    const identifiers = [];
    if (item.productId) {
      if (mongoose.isValidObjectId(item.productId) && await Product.exists({ _id: item.productId, userId: doc.userId })) return true;
      continue;
    }
    const code = String(item.productCode || item.code || '').trim();
    const barcode = String(item.barcode || '').trim();
    const description = String(item.description || '').trim();
    if (code) identifiers.push({ code });
    if (barcode) identifiers.push({ $or: [{ barcode }, { 'variants.barcode': barcode }] });
    if (description) identifiers.push({ description: new RegExp(`^${escapeRegex(description)}$`, 'i') });
    if (identifiers.length && await Product.exists({ userId: doc.userId, $or: identifiers })) return true;
  }
  return false;
}

function isOnlineStoreStockHandled(doc) {
  return doc.extra?.stockHandledByOnlineOrder === true || doc.extra?.source === 'online-store';
}

async function movementCount(doc) {
  const Model = OUT_TYPES.has(doc.documentType) ? StockOut : StockIn;
  return Model.countDocuments({
    userId: doc.userId,
    sourceType: doc.documentType,
    sourceId: doc._id,
  });
}

async function main() {
  const apply = hasFlag('apply');
  const userId = argValue('userId');
  const limit = Math.max(1, Number(argValue('limit') || 5000));

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const filter = { documentType: { $in: DOC_TYPES } };
  if (userId) filter.userId = userId;

  const docs = await Invoice.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
  const negativeFilter = { stock: { $lt: 0 }, allowNegativeStock: { $ne: true } };
  if (userId) negativeFilter.userId = userId;
  const negativeBalances = await Product.find(negativeFilter)
    .select('_id userId code description stock')
    .sort({ userId: 1, code: 1 })
    .lean();
  const missing = [];
  const skipped = [];
  const repaired = [];
  const failed = [];

  for (const doc of docs) {
    if (!isFinanciallyActive(doc)) {
      skipped.push({ number: doc.number, type: doc.documentType, reason: 'Draft, cancelled, or awaiting return inspection' });
      continue;
    }
    if (!hasStockItems(doc)) {
      skipped.push({ number: doc.number, type: doc.documentType, reason: 'No stock product lines' });
      continue;
    }
    if (!await hasResolvableStockItems(doc)) {
      skipped.push({ number: doc.number, type: doc.documentType, reason: 'Legacy free-text lines have no matching inventory product' });
      continue;
    }
    if (OUT_TYPES.has(doc.documentType) && isOnlineStoreStockHandled(doc)) {
      skipped.push({ number: doc.number, type: doc.documentType, reason: 'Online order stock handled separately' });
      continue;
    }

    const count = await movementCount(doc);
    if (count > 0) continue;

    const row = {
      id: String(doc._id),
      number: doc.number,
      type: doc.documentType,
      items: (doc.items || [])
        .filter((item) => item.itemType !== 'Service' && stockQuantity(doc, item) > 0)
        .map((item) => ({
          description: item.description,
          qty: stockQuantity(doc, item),
          productId: item.productId ? String(item.productId) : '',
          code: item.productCode || item.code || '',
          barcode: item.barcode || '',
        })),
    };
    missing.push(row);

    if (!apply) continue;
    try {
      const result = await postInventoryForDocument(doc, doc.userId);
      repaired.push({ number: doc.number, type: doc.documentType, result });
    } catch (error) {
      failed.push({ number: doc.number, type: doc.documentType, error: error.message });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned: docs.length,
    missingCount: missing.length,
    repairedCount: repaired.length,
    failedCount: failed.length,
    missing,
    repaired,
    failed,
    reconciliationRequiredCount: negativeBalances.length,
    reconciliationRequired: negativeBalances.map((product) => ({
      productId: String(product._id),
      userId: String(product.userId),
      code: product.code,
      description: product.description,
      stock: product.stock,
      reason: 'Legacy negative balance has no supporting movement; enter a verified opening-balance adjustment',
    })),
    skippedCount: skipped.length,
    skipped,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
