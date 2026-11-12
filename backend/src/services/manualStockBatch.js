import { Types } from 'mongoose';
import { Product } from '../models/Product.js';
import { httpError } from '../utils/httpError.js';
import { atomicInventoryHandler } from './inventoryTransaction.js';
import { adjustManualStock } from './manualStockAdjustment.js';

// Both adjustment directions share validation, server-derived values, and one
// transaction for every line so a failure cannot partially change inventory.
export function manualStockBatchHandler({ Model, direction, numberField, nextNumber }) {
  return atomicInventoryHandler(async (req, res, next) => {
    try {
      const body = req.body;
      if (body.sourceType || body.sourceId || body.sourceNo) throw httpError(400, 'Purchases, sales and returns manage their own stock movements. Use a manual adjustment without document source links.');
      if (req.user.category !== 'automobile') throw httpError(403, 'Manual stock adjustments are available for automobile accounts');
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw httpError(400, 'Add between 1 and 100 items');
      if (!['Pending', 'Completed'].includes(body.status)) throw httpError(400, 'Select a valid adjustment status');
      if (!String(body.warehouse || '').trim() || !String(body.adjustmentReason || '').trim()) throw httpError(400, 'Warehouse and adjustment reason are required');
      if (!body.date || !Number.isFinite(Date.parse(body.date))) throw httpError(400, 'Select a valid date');
      if (String(body.notes || '').length > 500) throw httpError(400, 'Notes must be 500 characters or fewer');
      const userId = req.user.id;
      const groupNo = String(body[numberField] || '').trim() || await nextNumber(userId);
      const existing = await Model.find({ userId, $or: [{ [numberField]: groupNo }, { adjustmentGroupNo: groupNo }] }).lean();
      if (existing.length) {
        if (!body.editDraft || existing.some((entry) => entry.status !== 'Pending' || entry.adjustmentGroupNo !== groupNo || entry.sourceType || entry.sourceId || entry.sourceNo)) throw httpError(409, 'This entry has already been saved. Refresh before creating another adjustment.');
        await Model.deleteMany({ userId, adjustmentGroupNo: groupNo, status: 'Pending' });
      } else if (body.editDraft) throw httpError(409, 'The draft no longer exists. Refresh and retry.');
      const created = [];
      for (const [index, item] of body.items.entries()) {
        if (!item || !Types.ObjectId.isValid(String(item.productId || '')) || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) throw httpError(400, `Select a product and a positive quantity for item ${index + 1}`);
        const product = await Product.findOne({ _id: item.productId, userId });
        if (!product || product.itemType === 'Service' || product.status === 'Inactive' || product.trackInventory === false) throw httpError(400, `Item ${index + 1} must be an active inventory product`);
        if ((product.warehouse || 'Main Warehouse') !== body.warehouse) throw httpError(400, `${product.description} is not in the selected warehouse`);
        const variant = item.variantId ? product.variants?.find((row) => String(row._id) === String(item.variantId)) : null;
        if (product.variants?.length && !variant) throw httpError(400, `Select a variant for ${product.description}`);
        const unitCost = Number(variant?.purchasePrice ?? product.purchasePrice) || Number(variant?.rate ?? product.rate) || 0;
        const entry = await Model.create({
          movementKey: `manual:${Model.modelName}:${groupNo}:${index}`, sourceLineId: String(index), businessId: req.user.businessId,
          baseQty: Number(item.qty), enteredQuantity: Number(item.qty), conversionFactor: 1, unit: product.baseUnit || product.unit,
          baseUnit: product.baseUnit || product.unit, unitCost, costEstimated: !(Number(variant?.purchasePrice ?? product.purchasePrice) > 0), batchNumber: item.batchSerialNo || '',
          userId, branch: product.branch || '', [numberField]: body.items.length === 1 ? groupNo : `${groupNo}-${String(index + 1).padStart(2, '0')}`,
          adjustmentGroupNo: groupNo, warehouse: body.warehouse, referenceNo: String(body.referenceNo || '').trim(), adjustmentReason: body.adjustmentReason,
          createdBy: existing[0]?.createdBy || req.user.email || userId, modifiedBy: req.user.email || userId,
          ...(existing[0]?.createdAt ? { createdAt: existing[0].createdAt } : {}),
          notes: body.notes || '', batchSerialNo: item.batchSerialNo || '', remarks: item.remarks || '', date: new Date(body.date),
          productId: product._id, productName: product.description, variantId: variant?._id,
          variantName: variant ? String(variant.size || variant.modelName || variant.modelCode || variant.barcode || '') : '',
          [direction === 1 ? 'supplier' : 'to']: String(body.adjustmentReason).trim(), itemCount: 1, totalQty: Number(item.qty), totalValue: Number(item.qty) * unitCost, status: body.status,
        });
        await adjustManualStock(entry, direction);
        created.push(entry);
      }
      res.status(201).json({ data: created, number: groupNo });
    } catch (error) { next(error); }
  });
}
