import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { requireEmployeePortalAuth, requireEmployeePortalRole } from '../../middleware/employeePortalAuth.js';
import { revokeSecuritySession } from '../../services/securitySessions.js';
import { revokeSession } from '../../services/appSessions.js';
import { getEmployeeLinkContext } from './accessController.js';
import { createSecurityRateLimit } from '../../middleware/securityRateLimit.js';
import { employeeDocuments, employeeDocumentFile, listEmployeePermissions, requestEmployeePermission } from './selfServiceController.js';
import {
  applyLeave,
  checkIn,
  checkOut,
  createCorrection,
  employeeDashboard,
  employeeHolidays,
  employeeLeaveHistory,
  employeeLeaveStatus,
  employeeMonthlyAttendance,
  employeePayslips,
  exchangeMainToken,
  getEmployeePortalMe,
  loginEmployeePortal,
} from './portalController.js';

export const employeePortalRouter = Router();

employeePortalRouter.get('/auth/link-context', createSecurityRateLimit({ bucket: 'employee-link', limit: 90 }), getEmployeeLinkContext);

employeePortalRouter.post('/auth/login', loginEmployeePortal);
employeePortalRouter.post('/auth/exchange-main', requireAuth, exchangeMainToken);

employeePortalRouter.use(requireEmployeePortalAuth);
employeePortalRouter.post('/auth/logout', async (req, res, next) => {
  try {
    if (req.employeeUser.mainSession) await revokeSession(req.employeeUser.id, req.employeeUser.sessionId);
    else await revokeSecuritySession(req.employeeUser.id, req.employeeUser.sessionId);
    res.json({ message: 'Signed out' });
  } catch (error) { next(error); }
});

employeePortalRouter.get('/me', getEmployeePortalMe);
employeePortalRouter.get('/documents', requireEmployeePortalRole('employee'), employeeDocuments);
employeePortalRouter.get('/documents/:documentId/file', requireEmployeePortalRole('employee'), employeeDocumentFile);
employeePortalRouter.get('/permissions', requireEmployeePortalRole('employee'), listEmployeePermissions);
employeePortalRouter.post('/permissions', requireEmployeePortalRole('employee'), requestEmployeePermission);
employeePortalRouter.get('/dashboard', employeeDashboard);
employeePortalRouter.post('/attendance/check-in', requireEmployeePortalRole('employee'), checkIn);
employeePortalRouter.post('/attendance/check-out', requireEmployeePortalRole('employee'), checkOut);
employeePortalRouter.get('/attendance/monthly', requireEmployeePortalRole('employee'), employeeMonthlyAttendance);
employeePortalRouter.post('/attendance/correction', requireEmployeePortalRole('employee'), createCorrection);
employeePortalRouter.post('/leave/apply', requireEmployeePortalRole('employee'), applyLeave);
employeePortalRouter.get('/leave/status', requireEmployeePortalRole('employee'), employeeLeaveStatus);
employeePortalRouter.get('/leave/history', requireEmployeePortalRole('employee'), employeeLeaveHistory);
employeePortalRouter.get('/payslips', requireEmployeePortalRole('employee'), employeePayslips);
employeePortalRouter.get('/holidays', employeeHolidays);
