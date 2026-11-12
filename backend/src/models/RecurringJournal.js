import { Schema, model } from 'mongoose';

const recurringJournalSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  businessId: { type: Schema.Types.ObjectId, index: true },
  branch: { type: String, default: '' },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  sourceVoucher: { type: Schema.Types.ObjectId, ref: 'AccountingVoucher', required: true },
  frequency: { type: String, enum: ['Weekly', 'Monthly', 'Quarterly', 'Yearly'], required: true },
  nextDate: { type: String, required: true },
  anchorDay: { type: Number, required: true },
  endDate: { type: String, default: '' },
  active: { type: Boolean, default: true },
  template: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 1 },
  lastDate: String,
  lastVoucher: { type: Schema.Types.ObjectId, ref: 'AccountingVoucher' },
  auditHistory: { type: [new Schema({
    action: String, actorId: Schema.Types.ObjectId, at: { type: Date, default: Date.now },
    date: String, voucherId: Schema.Types.ObjectId,
  }, { _id: false })], default: [] },
}, { timestamps: true });

recurringJournalSchema.index({ userId: 1, name: 1 }, { unique: true });
export const RecurringJournal = model('RecurringJournal', recurringJournalSchema);
