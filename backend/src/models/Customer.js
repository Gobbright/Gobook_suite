import { Schema, model } from 'mongoose';

const customerSchema = new Schema({
  userId:  { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  branch:  { type: String, trim: true, default: '', index: true },
  sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  name:    { type: String, required: true, trim: true },
  gstin:   { type: String, trim: true, uppercase: true, default: '' },
  phone:   { type: String, trim: true, default: '' },
  email:   { type: String, trim: true, lowercase: true, default: '' },
  address: { type: String, trim: true, default: '' },
  city:    { type: String, trim: true, default: '' },
  state:   { type: String, trim: true, default: '' },
  pincode: { type: String, trim: true, default: '' },
  bankName:          { type: String, trim: true, default: '' },
  accountHolderName: { type: String, trim: true, default: '' },
  accountNumber:     { type: String, trim: true, default: '' },
  ifscCode:          { type: String, trim: true, uppercase: true, default: '' },
  bankBranch:        { type: String, trim: true, default: '' },
  status:  { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  customerType: { type: String, trim: true, default: '' },
  creditLimit: { type: Number, min: 0, default: 0 },
  shippingAddress: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  sales:   { type: Number, default: 0, min: 0 },
}, { timestamps: true });

customerSchema.index({ name: 'text', gstin: 1 });
customerSchema.index({ userId: 1, sourceLeadId: 1 }, { unique: true, partialFilterExpression: { sourceLeadId: { $type: 'objectId' } } });

export const Customer = model('Customer', customerSchema);
