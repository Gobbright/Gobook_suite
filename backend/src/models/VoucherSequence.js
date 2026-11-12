import { Schema, model } from 'mongoose';

const voucherSequenceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  financialYear: { type: String, required: true },
  voucherType: { type: String, required: true },
  value: { type: Number, default: 0 },
});

voucherSequenceSchema.index({ userId: 1, financialYear: 1, voucherType: 1 }, { unique: true });

export const VoucherSequence = model('VoucherSequence', voucherSequenceSchema);
