import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { sessionSeconds } from './tokenPolicy.js';

export function signPortalToken(user, sid, { mainSession = false, authTime = Math.floor(Date.now() / 1000) } = {}) {
  return jwt.sign({
    scope: 'employee-portal',
    sid,
    mainSession,
    iat: authTime,
    sub: String(user.id),
    ownerUserId: String(user.ownerUserId),
    employeeObjectId: user.employeeObjectId ? String(user.employeeObjectId) : '',
    employeeId: user.employeeId || '',
    email: user.email,
    name: user.name,
    role: user.role,
    category: user.category || '',
    businessName: user.businessName || '',
    loginPath: user.loginPath || '',
  }, env.jwtSecret, { algorithm: 'HS256', expiresIn: sessionSeconds(env.jwtExpiresIn) });
}

export function safePortalUser(user) {
  return {
    id: String(user.id),
    ownerUserId: String(user.ownerUserId),
    employeeObjectId: user.employeeObjectId ? String(user.employeeObjectId) : '',
    employeeId: user.employeeId || '',
    name: user.name,
    email: user.email,
    role: user.role,
    category: user.category || '',
    businessName: user.businessName || '',
    businessLogoUrl: user.businessLogoUrl || '',
    loginPath: user.loginPath || '',
    portalBasePath: user.portalBasePath || '',
  };
}
