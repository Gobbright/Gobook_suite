import { Schema } from 'mongoose';

export const inventoryMovementFields = {
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  sourceLineId: { type: String, trim: true },
  costSourceId: { type: Schema.Types.ObjectId },
  costSourceLineId: { type: String },
  movementKey: { type: String, trim: true },
  postingFingerprint: { type: String },
  postingLineCount: { type: Number, min: 1 },
  baseQty: { type: Number, min: 0 },
  enteredQuantity: { type: Number, min: 0 },
  unit: { type: String, trim: true },
  baseUnit: { type: String, trim: true },
  conversionFactor: { type: Number, min: 0 },
  batchNumber: { type: String, trim: true },
  unitCost: { type: Number, min: 0 },
  costEstimated: { type: Boolean, default: false },
  costLayers: [{ quantity: { type: Number, min: 0 }, unitCost: { type: Number, min: 0 }, acquiredAt: Date, _id: false }],
};

export function addInventoryMovementIndexes(schema) {
  schema.index({ userId: 1, movementKey: 1 }, { unique: true, partialFilterExpression: { movementKey: { $type: 'string' } } });
  schema.index({ userId: 1, productId: 1, date: 1, status: 1 });
  schema.index({ userId: 1, branch: 1, warehouse: 1, variantId: 1, date: 1 });
}
