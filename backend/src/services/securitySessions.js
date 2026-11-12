import { createHash, randomUUID } from 'node:crypto';
import { SecuritySession } from '../models/SecuritySession.js';
import { httpError } from '../utils/httpError.js';
import { sessionSeconds } from './tokenPolicy.js';

export function credentialHash(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

export async function createSecuritySession(subject, scope, credential, duration) {
  const sid = randomUUID();
  await SecuritySession.create({
    subject: String(subject), scope, sessionIdHash: credentialHash(sid),
    credentialHash: credentialHash(credential), expiresAt: new Date(Date.now() + sessionSeconds(duration) * 1000),
  });
  return sid;
}

export async function assertSecuritySession(payload, credential) {
  if (!payload.sid) throw httpError(401, 'Please sign in again.');
  const currentCredentialHash = Array.isArray(credential)
    ? { $in: [...new Set(credential.map(credentialHash))] }
    : credentialHash(credential);
  const session = await SecuritySession.findOne({
    subject: payload.sub, scope: payload.scope, sessionIdHash: credentialHash(payload.sid),
    credentialHash: currentCredentialHash, revokedAt: null, expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw httpError(401, 'Session expired. Please sign in again.');
  return session;
}

export async function revokeSecuritySession(subject, sid) {
  await SecuritySession.updateOne({ subject: String(subject), sessionIdHash: credentialHash(sid) }, { $set: { revokedAt: new Date() } });
}
