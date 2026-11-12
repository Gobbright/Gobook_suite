import { Schema, model } from 'mongoose';

const ledgerAccountSchema = new Schema({
  userId:  { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  businessId: { type: Schema.Types.ObjectId, ref: 'Business', index: true },
  branch:  { type: String, trim: true, default: '', index: true },
  name:    { type: String, required: true, trim: true },
  group:   { type: String, required: true, trim: true },
  accountingGroup: { type: String, default: '', trim: true },
  code: { type: String, default: '', trim: true },
  codeKey: { type: String },
  gstin: { type: String, default: '', trim: true, uppercase: true },
  contact: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  address: { type: String, default: '', trim: true },
  creditLimit: { type: Number, min: 0 },
  creditDays: { type: Number, min: 0 },
  revision: { type: Number, default: 1 },
  openingHistory: { type: [new Schema({
    at: { type: Date, default: Date.now }, actorId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
    before: Number, after: Number, reason: String,
  }, { _id: false })], default: [] },
  auditHistory: { type: [new Schema({
    at: { type: Date, default: Date.now }, actorId: { type: Schema.Types.ObjectId, ref: 'AppUser' },
    action: String, reason: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed,
  }, { _id: false })], default: [] },
  opening: { type: Number, default: 0 },
  debit:   { type: Number, default: 0 },
  credit:  { type: Number, default: 0 },
  color:   { type: String, default: '#2563eb' },
  active:  { type: Boolean, default: true },
  billAllocationVersion: { type: Number, default: 0 },
}, { timestamps: true });

ledgerAccountSchema.index({ userId: 1, name: 1 }, { unique: true });
ledgerAccountSchema.index({ userId: 1, group: 1 });
ledgerAccountSchema.index({ userId: 1, codeKey: 1 }, { unique: true, partialFilterExpression: { codeKey: { $type: 'string' } } });

export const LedgerAccount = model('LedgerAccount', ledgerAccountSchema);
