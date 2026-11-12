import { Schema, model } from 'mongoose';

const leadSchema = new Schema({
  userId:  { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  branch:  { type: String, trim: true, default: '', index: true },
  name:    { type: String, required: true, trim: true },
  company: { type: String, trim: true, default: '' },
  email:   { type: String, trim: true, lowercase: true, default: '' },
  phone:   { type: String, trim: true, default: '' },
  source:  { type: String, trim: true, default: 'Website' },
  status:  { type: String, default: 'New', enum: ['New', 'Contacted', 'In Progress', 'Qualified', 'Proposal Sent', 'Won', 'Lost', 'Converted'] },
  owner:   { type: String, trim: true, default: '' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Hot'], default: 'Medium' },
  enquiry: { type: String, trim: true, default: '' },
  interestedIn: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  state: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  followUpDate: { type: String, default: '' },
  convertedCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  convertedAt: Date,
}, { timestamps: true });

leadSchema.index({ name: 'text', company: 1 });

export const Lead = model('Lead', leadSchema);
