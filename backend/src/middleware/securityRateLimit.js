import { createHash } from 'node:crypto';
import { Schema, model } from 'mongoose';
import { httpError } from '../utils/httpError.js';

const schema = new Schema({ _id: String, count: { type: Number, default: 0 }, expiresAt: Date }, { excludeFromAudit: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SecurityRateLimit = model('SecurityRateLimit', schema);

export function createSecurityRateLimit({ bucket, limit, windowMs = 15 * 60000, identify = (req) => req.ip || req.socket?.remoteAddress || 'unknown' }) {
  return async (req, res, next) => {
    try {
      const window = Math.floor(Date.now() / windowMs);
      const identity = createHash('sha256').update(String(identify(req))).digest('hex');
      const counter = await SecurityRateLimit.findOneAndUpdate(
        { _id: `${bucket}:${identity}:${window}` },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) } },
        { upsert: true, new: true },
      );
      if (counter.count > limit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(((window + 1) * windowMs - Date.now()) / 1000))));
        return next(httpError(429, 'Too many attempts. Please wait before trying again.'));
      }
      next();
    } catch (error) {
      next(error.code === 11000 ? httpError(429, 'Please wait before trying again.') : error);
    }
  };
}

export const authIpLimit = createSecurityRateLimit({ bucket: 'auth-ip', limit: 60 });
export const authAccountLimit = createSecurityRateLimit({
  bucket: 'auth-account', limit: 15,
  identify: (req) => `${req.ip || req.socket?.remoteAddress || 'unknown'}:${String(req.body?.username || '').trim().toLowerCase()}:${String(req.body?.email || req.body?.adminId || req.body?.employeeId || req.body?.challengeId || '').trim().toLowerCase()}`,
});
export const paymentLimit = createSecurityRateLimit({ bucket: 'payment-ip', limit: 60 });
export const otpSendLimit = createSecurityRateLimit({ bucket: 'otp-send-ip', limit: 12 });
