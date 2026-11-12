import { Schema, model } from 'mongoose';

const followUpSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  branch:    { type: String, trim: true, default: '', index: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  previousFollowUpId: { type: Schema.Types.ObjectId, ref: 'FollowUp', index: true },
  person:    { type: String, required: true, trim: true },
  regarding: { type: String, trim: true, default: '' },
  date:      { type: String, default: '' },
  time:      { type: String, default: '' },
  status:    { type: String, default: 'Pending', enum: ['Pending', 'Done', 'Overdue'] },
  owner:     { type: String, trim: true, default: '' },
  followUpType: { type: String, enum: ['Call', 'Visit', 'WhatsApp', 'Email', 'Meeting', 'Other'], default: 'Call' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  duration: { type: Number, min: 5, max: 1440, default: 30 },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  outcome: { type: String, trim: true, maxlength: 1000, default: '' },
  reminderAt: { type: String, default: '' },
  outcomeLog: [{ at: { type: Date, default: Date.now }, by: String, note: String, status: String, _id: false }],
}, { timestamps: true });

export const FollowUp = model('FollowUp', followUpSchema);
