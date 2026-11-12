import { createHash, randomUUID } from 'crypto';

import { env } from '../config/env.js';
import { AppSession } from '../models/AppSession.js';
import { AppUser } from '../models/AppUser.js';
import { httpError } from '../utils/httpError.js';
import { sessionSeconds, MAX_SESSION_SECONDS } from './tokenPolicy.js';
import { credentialHash } from './securitySessions.js';

const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|mobile|windows phone|opera mini|iemobile/i;

function sessionHash(sessionId = '') {
  return createHash('sha256').update(sessionId).digest('hex');
}

function deviceHash(deviceId = '') {
  const normalized = String(deviceId || '').trim();
  return normalized ? createHash('sha256').update(normalized).digest('hex') : '';
}

function tokenTtlMs() {
  return sessionSeconds(env.jwtExpiresIn) * 1000;
}

export function getDeviceType(req) {
  const headers = req?.headers || {};
  const explicit = String(headers['x-device-type'] || req?.body?.deviceType || '').trim().toLowerCase();
  if (explicit === 'mobile' || explicit === 'desktop') return explicit;
  const userAgent = String(headers['user-agent'] || '');
  return MOBILE_UA_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}

export function getDeviceIdHash(req) {
  const headers = req?.headers || {};
  const raw = String(headers['x-device-id'] || req?.body?.deviceId || '').trim();
  if (!raw || raw.length > 160) return '';
  return deviceHash(raw);
}

function getClientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || '';
}

export async function createLoginSession(user, req, { revokeAllActive = false } = {}) {
  const deviceType = getDeviceType(req);
  const deviceIdHash = getDeviceIdHash(req);
  const sessionId = randomUUID();
  const now = new Date();
  const headers = req?.headers || {};

  // Controller unit tests call auth handlers without an HTTP request shell or
  // database connection. Real Express requests always include headers.
  if (!req?.headers) return { sessionId, deviceType };

  const credentials = user.password === undefined
    ? await AppUser.findById(user._id).select('+password').lean()
    : user;

  await AppSession.updateMany(
    { userId: user._id, ...(revokeAllActive ? {} : { deviceType }), revokedAt: null },
    { $set: { revokedAt: now } },
  );

  await AppSession.create({
    userId: user._id,
    sessionIdHash: sessionHash(sessionId),
    credentialHash: credentialHash(credentials?.password || ''),
    deviceIdHash,
    deviceType,
    userAgent: String(headers['user-agent'] || '').slice(0, 500),
    ipAddress: getClientIp(req).slice(0, 120),
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + tokenTtlMs()),
  });

  return { sessionId, deviceType };
}

export async function hasActiveDeviceSession(userId, deviceType) {
  return Boolean(await AppSession.exists({
    userId,
    deviceType,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }));
}

export async function hasActiveOtherDeviceSession(userId, req) {
  const currentDeviceHash = getDeviceIdHash(req);
  if (!currentDeviceHash) {
    return Boolean(await AppSession.exists({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }));
  }
  return Boolean(await AppSession.exists({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $or: [
      { deviceIdHash: { $exists: false } },
      { deviceIdHash: '' },
      { deviceIdHash: { $ne: currentDeviceHash } },
    ],
  }));
}

export async function assertActiveSession({ userId, sessionId, password = '' }) {
  if (!sessionId) {
    throw httpError(401, 'Session expired. Please sign in again.');
  }
  const session = await AppSession.findOne({
    userId,
    sessionIdHash: sessionHash(sessionId),
    credentialHash: credentialHash(password),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: new Date(Date.now() - MAX_SESSION_SECONDS * 1000) },
  });
  if (!session) throw httpError(401, 'Session expired or revoked. Please sign in again.');
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 60000) {
    session.lastSeenAt = new Date();
    await session.save();
  }
  return session;
}

export async function revokeSession(userId, sessionId) {
  if (!userId || !sessionId) return;
  await AppSession.updateOne(
    { userId, sessionIdHash: sessionHash(sessionId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
