import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: Schema.Types.ObjectId,
  batchNumber: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0.00000001 },
  unit: String,
  fromBranch: { type: String, default: '' },
  toBranch: { type: String, default: '' },
  fromWarehouse: { type: String, required: true },
  toWarehouse: { type: String, required: true },
  requestId: { type: String, required: true, maxlength: 100 },
  fingerprint: { type: String, required: true },
  referenceNo: { type: String, required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['Draft', 'Posted', 'Cancelled'], default: 'Draft' },
  postedAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
  postedByUserId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
  cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
}, { timestamps: true });
schema.index({ userId: 1, requestId: 1 }, { unique: true });
schema.index({ userId: 1, productId: 1, date: 1 });
export const InventoryTransfer = model('InventoryTransfer', schema);
