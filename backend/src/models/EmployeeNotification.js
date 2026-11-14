import { Schema, model } from 'mongoose';

const schema = new Schema({
  ownerUserId: { type: Schema.Types.ObjectId, required: true, index: true },
  employeeObjectId: { type: Schema.Types.ObjectId, required: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  recipientEmail: { type: String, default: '' },
  senderEmail: { type: String, default: '' },
  requestKey: { type: String, required: true },
  kind: { type: String, default: 'announcement' },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  emailStatus: { type: String, enum: ['Pending', 'Sending', 'Accepted', 'Failed', 'Unknown'], default: 'Pending' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  sentAt: Date,
  readAt: { type: Date, default: null },
  ownerReadAt: { type: Date, default: null },
  verifiedAt: Date,
  report: { kind: { type: String, enum: ['payroll'] }, month: String },
}, { timestamps: true });
schema.index({ ownerUserId: 1, requestKey: 1, employeeObjectId: 1 }, { unique: true });
schema.index({ ownerUserId: 1, employeeObjectId: 1, createdAt: -1 });
schema.index({ emailStatus: 1, createdAt: 1 });
schema.index({ ownerUserId: 1, readAt: -1, _id: -1 });
schema.index({ ownerUserId: 1, ownerReadAt: 1, kind: 1 });
export const EmployeeNotification = model('EmployeeNotification', schema);
