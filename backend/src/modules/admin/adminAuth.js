import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { AppUser } from '../../models/AppUser.js';
import { httpError } from '../../utils/httpError.js';
import { requireAuth } from '../../middleware/auth.js';
import { sessionSeconds, verifyAccessToken } from '../../services/tokenPolicy.js';
import { assertSecuritySession, createSecuritySession } from '../../services/securitySessions.js';

export function signAdminToken(adminId, options = {}) {
  return jwt.sign(
    { ...options, sub: String(adminId), scope: 'admin-panel' },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: sessionSeconds(env.adminJwtExpiresIn) },
  );
}

export async function issueAdminToken(adminId, credential, options = {}) {
  const sid = await createSecuritySession(adminId, 'admin-panel', credential || '', env.adminJwtExpiresIn);
  return signAdminToken(adminId, { ...options, sid });
}

export async function requireAdminAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(httpError(401, 'Admin authentication required'));
  }

  try {
    if (jwt.decode(token)?.scope === 'app') {
      return requireAuth(req, res, (error) => {
        if (error) return next(error);
        if (!req.user.isPlatformOwner) return next(httpError(403, 'Admin access denied'));
        req.admin = { id: req.user.id };
        next();
      });
    }
    const payload = verifyAccessToken(token, 'admin-panel');
    // Several configured credentials can share an admin ID. Validate against
    // the credential that created this session while honoring current config.
    const accounts = env.adminAccounts.filter((item) => item.id.toLowerCase() === payload.sub.toLowerCase());
    let credential = accounts.length > 1 ? accounts.map((account) => account.password) : accounts[0]?.password;
    if (!accounts.length) {
      const user = await AppUser.findById(payload.sub).select('+password isPlatformOwner status').lean();
      if (!user?.isPlatformOwner || user.status !== 'Active') {
        return next(httpError(403, 'Admin access denied'));
      }
      credential = user.password || '';
    }
    await assertSecuritySession(payload, credential);
    req.admin = { id: payload.sub, sessionId: payload.sid };
    next();
  } catch {
    next(httpError(401, 'Invalid or expired admin token'));
  }
}
