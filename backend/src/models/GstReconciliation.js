import { Schema, model } from 'mongoose';

const entrySchema = new Schema({
  supplier:     { type: String, default: '' },
  gstin:        { type: String, default: '' },
  invoiceNo:    { type: String, default: '' },
  date:         { type: String, default: '' },
  invoiceValue: { type: Number, default: 0 },
  itcBooks:     { type: Number, default: 0 },
  itcGstr2b:    { type: Number, default: 0 },
  statementRecorded: { type: Boolean, default: false },
  diff:         { type: Number, default: 0 },
  status:       { type: String, enum: ['matched', 'partial', 'probable', 'mismatch', 'not_in_2b', 'not_in_books'], default: 'matched' },
  resolution:   { type: String, enum: ['none', 'accepted', 'disputed'], default: 'none' },
}, { _id: true });

const reconSchema = new Schema({
  userId:  { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  gstin:   { type: String, default: '' },
  period:  { type: String, required: true },
  type:    { type: String, enum: ['2a', '2b', '1'], default: '2b' },
  entries: { type: [entrySchema], default: [] },
  workspace: { type: Schema.Types.Mixed },
}, { timestamps: true });

reconSchema.index({ userId: 1, gstin: 1, period: 1, type: 1 }, { unique: true });

export const GstReconciliation = model('GstReconciliation', reconSchema);
