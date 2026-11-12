import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';

export function stripInventoryPostingMetadata(body = {}) {
  const result = { ...body };
  for (const field of ['movementKey', 'postingFingerprint', 'postingLineCount', 'sourceLineId', 'businessId', 'baseQty', 'baseUnit', 'unit', 'conversionFactor', 'enteredQuantity', 'unitCost', 'costLayers', 'costEstimated', 'costSourceId', 'costSourceLineId']) delete result[field];
  return result;
}

export async function archiveInventoryChange(entry, event, details = {}) {
  if (mongoose.connection.readyState !== 1) return;
  const previous = entry.toObject?.() || entry;
  await AuditLog.create({ action: 'update', modelName: 'InventoryStockPosting', documentId: entry._id,
    businessId: entry.businessId, documentLabel: entry.stockInNo || entry.stockOutNo || entry.number || '',
    performedBy: { userId: entry.userId }, meta: { event, previous, ...details } });
}
