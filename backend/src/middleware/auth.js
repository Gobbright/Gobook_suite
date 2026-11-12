import { AppUser } from '../models/AppUser.js';
import { verifyAccessToken } from '../services/tokenPolicy.js';
import { httpError } from '../utils/httpError.js';
import { auditContext } from '../services/auditContext.js';
import { assertActiveSession } from '../services/appSessions.js';

const TENANT_OWNERSHIP_FIELDS = ['userId', 'businessId'];
const TENANT_MUTATION_OPERATORS = ['$set', '$setOnInsert', '$unset', '$rename'];

export function stripTenantOwnershipFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;

  for (const field of TENANT_OWNERSHIP_FIELDS) {
    delete body[field];
  }

  for (const operator of TENANT_MUTATION_OPERATORS) {
    const payload = body[operator];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    for (const field of TENANT_OWNERSHIP_FIELDS) {
      delete payload[field];
    }
  }
}

export async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(httpError(401, 'Authentication required'));
  }

  try {
    const payload = verifyAccessToken(token, 'app');
    const user = await AppUser.findById(payload.sub).select('+password').lean();
    if (!user || user.status !== 'Active') throw httpError(401, 'Account is not active. Please sign in again.');
    const session = await assertActiveSession({ userId: payload.sub, sessionId: payload.sid, password: user.password });
    stripTenantOwnershipFields(req.body);

    req.user = {
      id: payload.sub,
      email: user.email,
      role: user.role,
      accountType: user.accountType || (user.role === 'Super Admin' ? 'owner' : 'member'),
      isSuperAdmin: user.accountType === 'owner' || user.role === 'Super Admin',
      isPlatformOwner: Boolean(user.isPlatformOwner),
      permissions: user.permissions || {},
      branch: user.branch || '',
      subscriptionPlan: user.subscriptionPlan || '',
      businessId: user.businessId?.toString(),
      category: user.category || 'retail',
      retailSubcategory: user.retailSubcategory || '',
      sessionId: payload.sid || '',
      authTime: Math.floor(new Date(session.createdAt).getTime() / 1000),
    };
    // Scope the actor for the rest of this request's async chain so the
    // global audit plugin can attribute writes without req.user being
    // threaded through every controller/service call.
    auditContext.run(
      { userId: req.user.id, email: req.user.email, businessId: req.user.businessId },
      next,
    );
  } catch (err) {
    next(err.statusCode ? err : httpError(401, 'Invalid or expired token'));
  }
}
