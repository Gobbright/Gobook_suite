import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

export const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;

export function sessionSeconds(value = '7d') {
  // A bare JWT duration string is milliseconds in jsonwebtoken. Normalize it
  // here so token and database expiry always use the same number of seconds.
  const match = String(value).trim().match(/^(\d+)\s*(ms|s|m|h|d|w)?$/i);
  if (!match) throw new Error('Session duration must use ms, s, m, h, d, or w');
  const units = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const seconds = Math.floor(Number(match[1]) * units[(match[2] || 's').toLowerCase()]);
  if (seconds < 1) throw new Error('Session duration must be at least one second');
  return Math.min(seconds, MAX_SESSION_SECONDS);
}

export function verifyAccessToken(token, scope) {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], maxAge: MAX_SESSION_SECONDS });
  if (payload.scope !== scope || typeof payload.sub !== 'string' || !payload.sub
    || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
    || payload.iat > Math.floor(Date.now() / 1000) + 5
    || payload.exp - payload.iat > MAX_SESSION_SECONDS) {
    throw httpError(401, 'Session expired. Please sign in again.');
  }
  return payload;
}
