import { Schema, model } from 'mongoose';

const schema = new Schema({
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
  employeeObjectId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  fromTime: { type: String, required: true },
  toTime: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: Date,
}, { timestamps: true });
schema.index({ ownerUserId: 1, date: 1, employeeId: 1 });
export const EmployeePermission = model('EmployeePermission', schema);
