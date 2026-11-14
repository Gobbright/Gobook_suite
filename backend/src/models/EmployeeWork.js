import { Schema, model } from 'mongoose';

const schema = new Schema({
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'AppUser', required: true },
  employeeObjectId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeId: { type: String, required: true },
  employeeName: { type: String, required: true },
  requestId: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 5000 },
  dueDate: { type: String, default: '' },
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  status: { type: String, enum: ['Assigned', 'In Progress', 'Completed'], default: 'Assigned' },
  note: { type: String, default: '', maxlength: 2000 },
  assignedBy: { type: String, default: '' },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ ownerUserId: 1, employeeObjectId: 1, status: 1, createdAt: -1 });
schema.index({ ownerUserId: 1, status: 1, dueDate: 1 });
schema.index({ ownerUserId: 1, requestId: 1, employeeObjectId: 1 }, { unique: true });
schema.index({ ownerUserId: 1, updatedAt: -1, _id: -1 });
export const EmployeeWork = model('EmployeeWork', schema);
