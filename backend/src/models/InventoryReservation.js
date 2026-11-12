import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: Schema.Types.ObjectId,
  branch: { type: String, default: '' },
  warehouse: { type: String, required: true },
  batchNumber: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0.00000001 },
  unit: String,
  requestId: { type: String, required: true, maxlength: 100 },
  fingerprint: { type: String, required: true },
  referenceNo: { type: String, required: true },
  date: { type: Date, required: true },
  expiresAt: Date,
  status: { type: String, enum: ['Active', 'Released', 'Consumed', 'Cancelled'], default: 'Active' },
  releasedAt: Date,
  consumedAt: Date,
  cancelledAt: Date,
  releaseReason: String,
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
  releasedByUserId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
}, { timestamps: true });
schema.index({ userId: 1, requestId: 1 }, { unique: true });
schema.index({ userId: 1, productId: 1, status: 1 });
export const InventoryReservation = model('InventoryReservation', schema);
