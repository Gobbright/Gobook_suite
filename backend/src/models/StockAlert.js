import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business' },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  branch: { type: String, default: '' }, warehouse: { type: String, default: '' },
  alertType: { type: String, enum: ['Out of Stock', 'Low Stock', 'Overstock', 'Reorder Required'], required: true },
  unresolved: { type: Boolean, default: true }, state: { type: String, enum: ['Open', 'Reviewed', 'Resolved'], default: 'Open' },
  fingerprint: String, snapshot: Schema.Types.Mixed, lastSeenAt: Date, resolvedAt: Date,
  reviewedAt: Date, reviewedBy: { type: Schema.Types.ObjectId, ref: 'AppUser' },
}, { timestamps: true, excludeFromAudit: true });
schema.index({ userId: 1, productId: 1, branch: 1, warehouse: 1, alertType: 1 }, { unique: true, partialFilterExpression: { unresolved: true } });
schema.index({ userId: 1, branch: 1, unresolved: 1, lastSeenAt: -1 });
export const StockAlert = model('StockAlert', schema);
