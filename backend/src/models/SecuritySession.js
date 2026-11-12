import { Schema, model } from 'mongoose';

const schema = new Schema({
  subject: { type: String, required: true, index: true },
  scope: { type: String, enum: ['admin-panel', 'employee-portal'], required: true },
  sessionIdHash: { type: String, required: true, unique: true },
  credentialHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SecuritySession = model('SecuritySession', schema);
