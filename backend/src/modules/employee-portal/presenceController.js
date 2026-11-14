import { SecuritySession } from '../../models/SecuritySession.js';
import { EmployeeLogin } from '../../models/EmployeeLogin.js';
import { Employee } from '../../models/Employee.js';
import { credentialHash } from '../../services/securitySessions.js';
import { EMPLOYEE_ACTIVE_STATUSES } from '../../services/employeeAccess.js';
import { httpError } from '../../utils/httpError.js';
import { latestPortalPresence, PORTAL_PRESENCE_TTL_MS } from '../../services/employeePresence.js';

export async function heartbeat(req, res, next) {
  try {
    const { active = true, clientId = 'legacy' } = req.body || {};
    if (typeof active !== 'boolean' || typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(clientId)) throw httpError(400, 'Invalid employee presence update');
    const now = new Date();
    const result = await SecuritySession.updateOne({ subject: String(req.employeeUser.id), scope: 'employee-portal', sessionIdHash: credentialHash(req.employeeUser.sessionId), revokedAt: null, expiresAt: { $gt: now } }, [{ $set: {
      ...(active ? { lastSeenAt: now } : {}),
      portalPresence: { $concatArrays: [
        { $filter: { input: { $ifNull: ['$portalPresence', []] }, as: 'tab', cond: { $and: [{ $ne: ['$$tab.clientId', clientId] }, { $gt: ['$$tab.seenAt', new Date(now.getTime() - PORTAL_PRESENCE_TTL_MS)] }] } } },
        active ? [{ clientId, seenAt: now }] : [],
      ] },
    } }]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ online: active && result.matchedCount > 0 });
  } catch (error) { next(error); }
}

export async function employeePresence(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const [employees, logins] = await Promise.all([
      Employee.find({ userId: ownerUserId }).select('_id employeeId loginAccess status').lean(),
      EmployeeLogin.find({ ownerUserId, role: 'employee', loginEnabled: true, status: 'Active' }).select('_id employeeObjectId').lean(),
    ]);
    const now = Date.now();
    const sessions = await SecuritySession.find({ subject: { $in: logins.map((login) => String(login._id)) }, scope: 'employee-portal', revokedAt: null, expiresAt: { $gt: new Date() } }).select('subject portalPresence lastSeenAt').lean();
    const seen = new Map();
    for (const session of sessions) {
      const lastPresence = latestPortalPresence(session.portalPresence, now);
      if (lastPresence && (!seen.has(session.subject) || lastPresence > seen.get(session.subject))) seen.set(session.subject, lastPresence);
    }
    const byEmployee = new Map(logins.map((login) => [String(login.employeeObjectId), seen.get(String(login._id))]));
    const data = employees.map((employee) => {
      const lastSeenAt = byEmployee.get(String(employee._id)) || null;
      return { employeeObjectId: String(employee._id), employeeId: employee.employeeId, lastSeenAt, online: Boolean(employee.loginAccess && EMPLOYEE_ACTIVE_STATUSES.includes(employee.status) && lastSeenAt) };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data });
  } catch (error) { next(error); }
}
