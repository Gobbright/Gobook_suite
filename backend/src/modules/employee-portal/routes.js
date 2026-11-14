import { Router } from 'express';
import { heartbeat } from './presenceController.js';
import { listWork, updateWork } from './workController.js';
import { downloadEmployeeReport } from './reportController.js';
import { listNotifications, notificationCount, readNotification, readAllEmployeeNotifications } from './notificationController.js';

import { requireAuth } from '../../middleware/auth.js';
import { requireEmployeePortalAuth, requireEmployeePortalRole } from '../../middleware/employeePortalAuth.js';
import { revokeSecuritySession } from '../../services/securitySessions.js';
import { revokeSession } from '../../services/appSessions.js';
import { getEmployeeLinkContext, getEmployeeLinkPhoto } from './accessController.js';
import { verifyEmployeeLoginOtp, resendEmployeeLoginOtp } from './employeeLoginController.js';
import { createSecurityRateLimit } from '../../middleware/securityRateLimit.js';
import { employeeDocuments, employeeDocumentFile, listEmployeePermissions, requestEmployeePermission } from './selfServiceController.js';
import {
  applyLeave,
  checkIn,
  checkOut,
  changeBreak,
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
employeePortalRouter.get('/auth/link-photo', createSecurityRateLimit({ bucket: 'employee-link-photo', limit: 180 }), getEmployeeLinkPhoto);

employeePortalRouter.post('/auth/login', loginEmployeePortal);
employeePortalRouter.post('/auth/verify-otp', verifyEmployeeLoginOtp);
employeePortalRouter.post('/auth/resend-otp', resendEmployeeLoginOtp);
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
employeePortalRouter.get('/work', requireEmployeePortalRole('employee'), listWork);
employeePortalRouter.put('/work/:id', requireEmployeePortalRole('employee'), updateWork);
employeePortalRouter.get('/reports/:kind/:format', requireEmployeePortalRole('employee'), downloadEmployeeReport);
employeePortalRouter.get('/notifications', requireEmployeePortalRole('employee'), listNotifications);
employeePortalRouter.get('/notifications/count', requireEmployeePortalRole('employee'), notificationCount);
employeePortalRouter.put('/notifications/read-all', requireEmployeePortalRole('employee'), readAllEmployeeNotifications);
employeePortalRouter.put('/notifications/:id/read', requireEmployeePortalRole('employee'), readNotification);
employeePortalRouter.post('/presence', requireEmployeePortalRole('employee'), heartbeat);
employeePortalRouter.get('/documents', requireEmployeePortalRole('employee'), employeeDocuments);
employeePortalRouter.get('/documents/:documentId/file', requireEmployeePortalRole('employee'), employeeDocumentFile);
employeePortalRouter.get('/permissions', requireEmployeePortalRole('employee'), listEmployeePermissions);
employeePortalRouter.post('/permissions', requireEmployeePortalRole('employee'), requestEmployeePermission);
employeePortalRouter.get('/dashboard', employeeDashboard);
employeePortalRouter.post('/attendance/check-in', requireEmployeePortalRole('employee'), checkIn);
employeePortalRouter.post('/attendance/check-out', requireEmployeePortalRole('employee'), checkOut);
employeePortalRouter.post('/attendance/break', requireEmployeePortalRole('employee'), changeBreak);
employeePortalRouter.get('/attendance/monthly', requireEmployeePortalRole('employee'), employeeMonthlyAttendance);
employeePortalRouter.post('/attendance/correction', requireEmployeePortalRole('employee'), createCorrection);
employeePortalRouter.post('/leave/apply', requireEmployeePortalRole('employee'), applyLeave);
employeePortalRouter.get('/leave/status', requireEmployeePortalRole('employee'), employeeLeaveStatus);
employeePortalRouter.get('/leave/history', requireEmployeePortalRole('employee'), employeeLeaveHistory);
employeePortalRouter.get('/payslips', requireEmployeePortalRole('employee'), employeePayslips);
employeePortalRouter.get('/holidays', employeeHolidays);
