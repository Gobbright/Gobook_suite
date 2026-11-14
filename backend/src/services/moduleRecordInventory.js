import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { ModuleRecord } from '../models/ModuleRecord.js';
import { postInventoryForDocument, reverseInventoryForDocument } from './inventoryMovements.js';
import { httpError } from '../utils/httpError.js';

const MODULES = new Set(['hospital/pharmacy-billing', 'hospital/pharmacy-dispensing', 'hospital/pharmacy-returns']);
export function hasModuleInventory(record) {
  return MODULES.has(record.moduleKey) && record.data?.inventoryPosting?.version === 1;
}
export function moduleInventoryId(userId, moduleKey, data) {
  if (!hasModuleInventory({ moduleKey, data })) return undefined;
  const key = data.inventoryPosting.key;
  if (typeof key !== 'string' || !key.trim() || key.length > 100) throw httpError(400, 'A stock posting reference is required');
  return new Types.ObjectId(createHash('sha256').update(`${userId}:${moduleKey}:${key}`).digest('hex').slice(0, 24));
}
export function sameModuleInventoryRequest(before, after) {
  const clean = data => { const { createdAt, updatedAt, ...rest } = data || {}; return rest; };
  return JSON.stringify(clean(before)) === JSON.stringify(clean(after));
}
export function sameModuleInventoryEffect(before, after) {
  return posted(before) === posted(after) && JSON.stringify(before.data?.items) === JSON.stringify(after.data?.items);
}
function posted(record) {
  const status = String(record.data?.status || '').toUpperCase();
  if (record.moduleKey === 'hospital/pharmacy-returns') return record.data?.reusable === true && status === 'COMPLETED';
  if (record.moduleKey === 'hospital/pharmacy-dispensing') return ['DISPENSED', 'PARTIALLY DISPENSED'].includes(status);
  return !['DRAFT', 'CANCELLED', 'VOID', 'PENDING'].includes(status);
}
function quantity(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) throw httpError(400, 'Stock quantities must be finite and greater than zero');
  return qty;
}
function reference(value) {
  if (!Types.ObjectId.isValid(String(value || ''))) throw httpError(400, 'Select a valid stock item');
  return value;
}
function document(record, items = []) {
  const data = record.data;
  return { _id: record._id, userId: record.userId, documentType: record.moduleKey === 'hospital/pharmacy-returns' ? 'sales-return' : 'pharmacy-bill',
    number: data.billNo || data.returnId || data.rxId || String(record._id), customer: { name: data.patientName || data.customer?.name || 'Patient' },
    meta: { date: data.date }, items };
}

async function returnItems(record) {
  const original = await ModuleRecord.findOne({ _id: reference(record.data.invoiceId), userId: record.userId, moduleKey: 'hospital/pharmacy-billing' }).lean();
  if (!original || !posted(original)) throw httpError(409, 'The original pharmacy bill is missing or cancelled');
  const prior = await ModuleRecord.find({ userId: record.userId, moduleKey: 'hospital/pharmacy-returns', _id: { $ne: record._id },
    'data.invoiceId': String(original._id), 'data.status': 'COMPLETED', 'data.reusable': true }).lean();
  const requested = new Map();
  return (record.data.items || []).map(item => {
    const index = Number(item.originalLineIndex);
    const sold = Number.isInteger(index) && original.data.items?.[index];
    if (!sold) throw httpError(400, 'Select the original bill line for this return');
    const qty = quantity(item.returnQty);
    const previousQty = prior.reduce((total, entry) => total + (entry.data.items || []).filter(row => row.originalLineIndex != null
      ? Number(row.originalLineIndex) === index
      : String(row.medicine || '').trim().toLowerCase() === String(sold.name || sold.medicine || sold.description || '').trim().toLowerCase()
        && String(row.batchNumber || '') === String(sold.batch || sold.batchNumber || '')).reduce((sum, row) => sum + Number(row.returnQty || 0), 0), 0);
    requested.set(index, (requested.get(index) || 0) + qty);
    if (previousQty + requested.get(index) > Number(sold.qty || sold.quantity || 0) + 1e-8) throw httpError(409, 'Returned quantity exceeds the remaining sold quantity');
    return { productId: reference(sold.productId || sold.id), variantId: sold.variantId, barcode: sold.barcode,
      batchNumber: sold.batchNumber || sold.batch, unit: sold.unit,
      description: sold.name || sold.medicine || sold.description, qty, rate: sold.rate || 0 };
  });
}

async function stockRecordLines(record, direction) {
  const grouped = new Map();
  for (const item of record.data.items || []) {
    if (item.stockSource !== 'pharmacy-stock') continue;
    const id = String(reference(item.stockId));
    grouped.set(id, (grouped.get(id) || 0) + quantity(item.dispensed));
  }
  for (const [id, qty] of grouped) {
    const stock = await ModuleRecord.findOne({ _id: id, userId: record.userId, moduleKey: 'hospital/pharmacy-stock' }).lean();
    if (!stock) throw httpError(409, 'The selected pharmacy batch no longer exists');
    const before = Number(stock.data.quantity ?? stock.data.stock ?? 0);
    const after = before + direction * qty;
    if (!Number.isFinite(before) || after < 0) throw httpError(409, 'Insufficient stock in the selected pharmacy batch');
    await ModuleRecord.updateOne({ _id: stock._id, userId: record.userId }, { $set: { 'data.quantity': after,
      ...(Object.prototype.hasOwnProperty.call(stock.data, 'stock') ? { 'data.stock': after } : {}),
      'data.status': after <= 0 ? 'Out of Stock' : after <= 10 ? 'Low' : 'Available' } });
  }
}

export async function postModuleInventory(record) {
  if (!hasModuleInventory(record) || !posted(record)) return;
  if (!Array.isArray(record.data.items) || !record.data.items.length) throw httpError(400, 'Add at least one stock item');
  let items;
  if (record.moduleKey === 'hospital/pharmacy-returns') items = await returnItems(record);
  else items = (record.data.items || []).filter(item => item.stockSource !== 'pharmacy-stock').map(item => ({
    productId: reference(record.moduleKey === 'hospital/pharmacy-dispensing' ? item.stockId : item.productId || item.id),
    variantId: item.variantId, barcode: item.barcode, description: item.name || item.medicine || item.description,
    batchNumber: item.batchNumber || item.batch, unit: item.unit,
    qty: quantity(record.moduleKey === 'hospital/pharmacy-dispensing' ? item.dispensed : item.qty), rate: Number(item.rate || 0),
  }));
  if (record.moduleKey === 'hospital/pharmacy-dispensing') await stockRecordLines(record, -1);
  if (items.length) await postInventoryForDocument(document(record, items), String(record.userId));
}

export async function reverseModuleInventory(record) {
  if (!hasModuleInventory(record) || !posted(record)) return;
  if (record.moduleKey === 'hospital/pharmacy-billing') {
    const returns = await ModuleRecord.exists({ userId: record.userId, moduleKey: 'hospital/pharmacy-returns',
      'data.invoiceId': String(record._id), 'data.status': 'COMPLETED', 'data.reusable': true });
    if (returns) throw httpError(409, 'Reverse linked medicine returns before changing or deleting this bill');
  }
  if (record.moduleKey === 'hospital/pharmacy-dispensing') await stockRecordLines(record, 1);
  await reverseInventoryForDocument(document(record), String(record.userId));
}
