import { Schema, model } from 'mongoose';

const schema = new Schema({
  employeeLoginId: { type: Schema.Types.ObjectId, ref: 'EmployeeLogin', required: true, unique: true },
  ownerUserId: { type: Schema.Types.ObjectId, required: true },
  employeeObjectId: { type: Schema.Types.ObjectId, required: true },
  employeeId: { type: String, required: true },
  recipientEmail: { type: String, required: true },
  challengeHash: { type: String, index: true },
  credentialHash: { type: String, select: false },
  senderFingerprint: { type: String, select: false },
  otpHash: { type: String, select: false },
  otpAttempts: { type: Number, default: 0 },
  otpExpiresAt: { type: Date, required: true },
  sentAt: { type: Date, default: () => new Date(0) },
  consumedAt: { type: Date, default: null },
}, { excludeFromAudit: true });
schema.index({ otpExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingEmployeeLogin = model('PendingEmployeeLogin', schema);
