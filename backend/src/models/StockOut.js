import { Schema, model } from 'mongoose';
import { inventoryMovementFields, addInventoryMovementIndexes } from './inventoryMovementFields.js';

const stockOutSchema = new Schema({
  ...inventoryMovementFields,
  userId:      { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  branch:      { type: String, trim: true, default: '', index: true },
  stockOutNo:  { type: String, required: true, trim: true },
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
  to:          { type: String, required: true, trim: true },
  itemCount:   { type: Number, default: 0, min: 0 },
  totalQty:   { type: Number, default: 0, min: 0 },
  totalValue: { type: Number, default: 0, min: 0 },
  status:     { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  sourceType: { type: String, default: '', trim: true },
  sourceId:   { type: Schema.Types.ObjectId },
  sourceNo:   { type: String, default: '', trim: true },
}, { timestamps: true });

stockOutSchema.index({ userId: 1, stockOutNo: 1 }, { unique: true });
stockOutSchema.index({ userId: 1, date: -1 });
stockOutSchema.index({ userId: 1, productId: 1 });
stockOutSchema.index({ userId: 1, sourceType: 1, sourceId: 1 });

addInventoryMovementIndexes(stockOutSchema);
export const StockOut = model('StockOut', stockOutSchema);
