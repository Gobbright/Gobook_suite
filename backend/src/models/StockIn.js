import { Schema, model } from 'mongoose';
import { inventoryMovementFields, addInventoryMovementIndexes } from './inventoryMovementFields.js';

const stockInSchema = new Schema({
  ...inventoryMovementFields,
  userId:      { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  branch:      { type: String, trim: true, default: '', index: true },
  stockInNo:   { type: String, required: true, trim: true },
  adjustmentGroupNo: { type: String, trim: true, default: '', index: true },
  createdBy: { type: String, trim: true, default: '' },
  modifiedBy: { type: String, trim: true, default: '' },
  warehouse: { type: String, trim: true, default: '' },
  referenceNo: { type: String, trim: true, default: '' },
  adjustmentReason: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '', maxlength: 500 },
  batchSerialNo: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },
  date:        { type: Date, required: true },
  productId:   { type: Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, default: '', trim: true },
  variantName: { type: String, default: '', trim: true },
  variantId: { type: Schema.Types.ObjectId },
  supplier:    { type: String, required: true, trim: true },
  itemCount:   { type: Number, default: 0, min: 0 },
  totalQty:   { type: Number, default: 0, min: 0 },
  totalValue: { type: Number, default: 0, min: 0 },
  status:     { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  sourceType: { type: String, default: '', trim: true },
  sourceId:   { type: Schema.Types.ObjectId },
  sourceNo:   { type: String, default: '', trim: true },
}, { timestamps: true });

stockInSchema.index({ userId: 1, stockInNo: 1 }, { unique: true });
stockInSchema.index({ userId: 1, date: -1 });
stockInSchema.index({ userId: 1, productId: 1 });
stockInSchema.index({ userId: 1, sourceType: 1, sourceId: 1 });

addInventoryMovementIndexes(stockInSchema);
export const StockIn = model('StockIn', stockInSchema);
