import jwt from 'jsonwebtoken';

import { httpError } from '../utils/httpError.js';
import { AppUser } from '../models/AppUser.js';
import { EmployeeLogin } from '../models/EmployeeLogin.js';
import { Employee } from '../models/Employee.js';
import { EMPLOYEE_ACTIVE_STATUSES, employeeCredential } from '../services/employeeAccess.js';
import { requireAuth } from './auth.js';
import { verifyAccessToken } from '../services/tokenPolicy.js';
import { assertActiveSession } from '../services/appSessions.js';
import { assertSecuritySession } from '../services/securitySessions.js';

function portalUserFromPayload(payload) {
  return {
    id: payload.sub,
    ownerUserId: payload.ownerUserId,
    employeeObjectId: payload.employeeObjectId,
    employeeId: payload.employeeId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    category: payload.category || '',
    sessionId: payload.sid,
  };
}

export async function requireEmployeePortalAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(httpError(401, 'Employee portal authentication required'));

  try {
    const payload = verifyAccessToken(token, 'employee-portal');
    if (payload.mainSession) {
      const owner = await AppUser.findById(payload.sub).select('+password').lean();
      if (!owner || owner.status !== 'Active' || !(owner.accountType === 'owner' || owner.role === 'Super Admin')) {
        throw httpError(403, 'Employee management access denied');
      }
      await assertActiveSession({ userId: payload.sub, sessionId: payload.sid, password: owner.password });
      req.employeeUser = { id: payload.sub, ownerUserId: payload.sub, role: 'admin', email: owner.email, name: owner.name, category: owner.category, sessionId: payload.sid, mainSession: true };
    } else {
      const login = await EmployeeLogin.findById(payload.sub).select('+passwordHash').lean();
      if (!login || !login.loginEnabled || login.status !== 'Active') throw httpError(401, 'Login access is disabled');
      const owner = await AppUser.findById(login.ownerUserId).select('status').lean();
      if (!owner || owner.status !== 'Active') throw httpError(401, 'Account is not active');
      const employee = await Employee.findOne({ _id: login.employeeObjectId, userId: login.ownerUserId, employeeId: login.employeeId }).lean();
      if (!employee || !employee.loginAccess || !EMPLOYEE_ACTIVE_STATUSES.includes(employee.status)) throw httpError(401, 'Employee login is disabled');
      await assertSecuritySession(payload, employeeCredential(login.passwordHash, employee));
      req.employeeUser = portalUserFromPayload({ sub: String(login._id), ...login, name: employee.name, email: employee.email, category: employee.category, sid: payload.sid });
    }
    next();
  } catch {
    next(httpError(401, 'Invalid or expired employee portal token'));
  }
}

export async function requireEmployeeManagementAdminAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(httpError(401, 'Employee management authentication required'));

  try {
    if (jwt.decode(token)?.scope === 'employee-portal') return next(httpError(403, 'Only the main business user can manage employees'));
    return requireAuth(req, res, (error) => {
      if (error) return next(error);
      if (!req.user.isSuperAdmin) return next(httpError(403, 'Employee management access denied'));
      req.employeeUser = { ...req.user, ownerUserId: req.user.id, employeeObjectId: '', employeeId: '', role: 'admin' };
      next();
    });
  } catch {
    next(httpError(401, 'Invalid or expired employee management token'));
  }
}

export function requireEmployeePortalRole(...roles) {
  return (req, _res, next) => {
    if (!req.employeeUser || !roles.includes(req.employeeUser.role)) {
      return next(httpError(403, 'You do not have access to this employee portal resource'));
    }
    next();
  };
}
