import { Schema, model } from 'mongoose';

const adjustment = new Schema({
  id: { type: String, required: true }, type: { type: String, required: true },
  reference: { type: String, required: true }, note: { type: String, required: true },
  taxable: { type: Number, default: 0 }, igst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 }, sgst: { type: Number, default: 0 }, cess: { type: Number, default: 0 },
}, { _id: false });
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  gstin: { type: String, default: '' }, fy: { type: String, required: true },
  adjustments: { type: [adjustment], default: [] },
  preparation: { type: Schema.Types.Mixed, default: {} },
  filing: { type: Schema.Types.Mixed }, snapshot: { type: Schema.Types.Mixed },
}, { timestamps: true });
schema.index({ userId: 1, gstin: 1, fy: 1 }, { unique: true });
export const Gstr9 = model('Gstr9', schema);
