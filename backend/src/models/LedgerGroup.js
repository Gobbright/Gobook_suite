import { Schema, model } from 'mongoose';

const ledgerGroupSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  name: { type: String, required: true, trim: true },
  nameKey: { type: String, required: true },
  parent: { type: String, required: true, trim: true },
  accountingGroup: { type: String, required: true },
  category: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'AppUser' },
}, { timestamps: true });
ledgerGroupSchema.index({ userId: 1, nameKey: 1 }, { unique: true });
ledgerGroupSchema.index({ businessId: 1, nameKey: 1 }, { unique: true, partialFilterExpression: { businessId: { $type: 'objectId' } } });
export const LedgerGroup = model('LedgerGroup', ledgerGroupSchema);
