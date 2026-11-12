import { Router } from 'express';

import { archiveAdminNotification, createAdminRecord, deleteAdminRecord, deleteAdminSectionRow, getAdminDashboard, getAdminNotifications, getAdminRecords, getAdminSection, getAdminStats, getSubscriptionPayments, getSubscriptionPlans, loginAdmin, markAllAdminNotificationsRead, sendSubscriptionPaymentInvoice, updateAdminNotification, updateAdminRecord, updateAdminSectionRow, updateSubscriptionPlan, sendRenewalReminder, updateUserSubscriptionState } from './adminController.js';
import { adminBackupUpload, adminStorageUpload, downloadStorageFile, exportStorageCollections, exportUserMongoBackup, getDailyReports, getStorageOverview, importUserMongoBackup, listStorageBusinesses, listStorageFiles, uploadStorageFile } from './storageController.js';
import { requireEmployeeManagementAdminAuth } from '../../middleware/employeePortalAuth.js';
import { getWhatsAppProviderAdminOverview, updateWhatsAppProviderStatus } from './whatsAppProviderAdminController.js';
import { adminCorrections, adminDashboard, adminHolidays, adminLeaves, adminMonthlyAttendance, adminPayroll, adminTodayAttendance, approveAdminPayroll, createAdminCorrection, createAdminEmployee, createAdminLeave, createHoliday, deleteAdminEmployee, employeePhotoUpload, generateAdminPayroll, leaveAttachmentUpload, listAdminEmployees, markAdminAttendance, updateAdminEmployee, updateAdminPayroll, updateCorrection, updateLeaveStatus } from '../employee-portal/portalController.js';
import { requireAdminAuth } from './adminAuth.js';
import { revokeSecuritySession } from '../../services/securitySessions.js';
import { revokeSession } from '../../services/appSessions.js';
import { deletePortalAttendance, deletePortalLeave, deletePortalPayroll } from '../employee-portal/listingDeleteController.js';
import { getEmployeeAccess, getEmployeeOverview, setEmployeeAccess, resetEmployeeQr } from '../employee-portal/accessController.js';
import { listEmployeePermissions, reviewEmployeePermission } from '../employee-portal/selfServiceController.js';

export const adminRouter = Router();

adminRouter.post('/login', loginAdmin);
adminRouter.post('/logout', requireAdminAuth, async (req, res, next) => {
  try {
    if (req.user) await revokeSession(req.user.id, req.user.sessionId);
    else await revokeSecuritySession(req.admin.id, req.admin.sessionId);
    res.json({ message: 'Signed out' });
  } catch (error) { next(error); }
});
adminRouter.get('/dashboard', requireAdminAuth, getAdminDashboard);
adminRouter.get('/stats', requireAdminAuth, getAdminStats);
adminRouter.get('/notifications', requireAdminAuth, getAdminNotifications);
adminRouter.patch('/notifications/read-all', requireAdminAuth, markAllAdminNotificationsRead);
adminRouter.patch('/notifications/:id', requireAdminAuth, updateAdminNotification);
adminRouter.delete('/notifications/:id', requireAdminAuth, archiveAdminNotification);
adminRouter.get('/storage/overview', requireAdminAuth, getStorageOverview);
adminRouter.get('/storage/files', requireAdminAuth, listStorageFiles);
adminRouter.post('/storage/files', requireAdminAuth, adminStorageUpload.single('file'), uploadStorageFile);
adminRouter.get('/storage/files/:id', requireAdminAuth, downloadStorageFile);
adminRouter.get('/storage/businesses', requireAdminAuth, listStorageBusinesses);
adminRouter.get('/storage/collections/export', requireAdminAuth, exportStorageCollections);
adminRouter.get('/storage/user-backups/:userId', requireAdminAuth, exportUserMongoBackup);
adminRouter.post('/storage/user-backups/import', requireAdminAuth, adminBackupUpload.single('backup'), importUserMongoBackup);
adminRouter.get('/storage/daily-reports', requireAdminAuth, getDailyReports);
adminRouter.get('/section/users', requireAdminAuth, (req, res, next) => { req.params.section = 'users'; return getAdminSection(req, res, next); });
adminRouter.get('/section/:section', requireAdminAuth, getAdminSection);
adminRouter.put('/section/:section/:id', requireAdminAuth, updateAdminSectionRow);
adminRouter.delete('/section/:section/:id', requireAdminAuth, deleteAdminSectionRow);
adminRouter.get('/records/:kind', requireAdminAuth, getAdminRecords);
adminRouter.post('/records/:kind', requireAdminAuth, createAdminRecord);
adminRouter.put('/records/:kind/:id', requireAdminAuth, updateAdminRecord);
adminRouter.delete('/records/:kind/:id', requireAdminAuth, deleteAdminRecord);
adminRouter.post('/send-reminder/:userId', requireAdminAuth, sendRenewalReminder);
adminRouter.post('/users/:userId/subscription-state', requireAdminAuth, updateUserSubscriptionState);
adminRouter.get('/subscription-plans', requireAdminAuth, getSubscriptionPlans);
adminRouter.put('/subscription-plans/:id', requireAdminAuth, updateSubscriptionPlan);
adminRouter.get('/subscription-payments', requireAdminAuth, getSubscriptionPayments);
adminRouter.post('/subscription-payments/:id/send-invoice', requireAdminAuth, sendSubscriptionPaymentInvoice);

adminRouter.get('/whatsapp-provider', requireAdminAuth, getWhatsAppProviderAdminOverview);
adminRouter.put('/whatsapp-provider/businesses/:businessId/status', requireAdminAuth, updateWhatsAppProviderStatus);
adminRouter.put('/whatsapp-provider/:id/status', requireAdminAuth, updateWhatsAppProviderStatus);


const requireHrAdmin = [requireEmployeeManagementAdminAuth];

adminRouter.get('/employee-dashboard', ...requireHrAdmin, adminDashboard);
adminRouter.get('/employees', ...requireHrAdmin, listAdminEmployees);
adminRouter.get('/employees/:id/access', ...requireHrAdmin, getEmployeeAccess);
adminRouter.get('/employees/:id/overview', ...requireHrAdmin, getEmployeeOverview);
adminRouter.put('/employees/:id/access', ...requireHrAdmin, setEmployeeAccess);
adminRouter.post('/employees/:id/qr/reset', ...requireHrAdmin, resetEmployeeQr);
adminRouter.post('/employees', ...requireHrAdmin, employeePhotoUpload.single('photo'), createAdminEmployee);
adminRouter.put('/employees/:id', ...requireHrAdmin, updateAdminEmployee);
adminRouter.delete('/employees/:id', ...requireHrAdmin, deleteAdminEmployee);
adminRouter.get('/attendance/today', ...requireHrAdmin, adminTodayAttendance);
adminRouter.get('/attendance/monthly', ...requireHrAdmin, adminMonthlyAttendance);
adminRouter.post('/attendance/mark', ...requireHrAdmin, markAdminAttendance);
adminRouter.delete('/attendance/:id', ...requireHrAdmin, deletePortalAttendance);
adminRouter.get('/attendance/corrections', ...requireHrAdmin, adminCorrections);
adminRouter.post('/attendance/corrections', ...requireHrAdmin, createAdminCorrection);
adminRouter.put('/attendance/corrections/:id', ...requireHrAdmin, updateCorrection);
adminRouter.get('/leaves', ...requireHrAdmin, adminLeaves);
adminRouter.get('/permissions', ...requireHrAdmin, listEmployeePermissions);
adminRouter.put('/permissions/:id/status', ...requireHrAdmin, reviewEmployeePermission);
adminRouter.post('/leaves', ...requireHrAdmin, leaveAttachmentUpload.single('attachment'), createAdminLeave);
adminRouter.put('/leaves/:id/status', ...requireHrAdmin, updateLeaveStatus);
adminRouter.delete('/leaves/:id', ...requireHrAdmin, deletePortalLeave);
adminRouter.get('/payroll', ...requireHrAdmin, adminPayroll);
adminRouter.post('/payroll/generate', ...requireHrAdmin, generateAdminPayroll);
adminRouter.post('/payroll/approve', ...requireHrAdmin, approveAdminPayroll);
adminRouter.put('/payroll/:id', ...requireHrAdmin, updateAdminPayroll);
adminRouter.delete('/payroll/:id', ...requireHrAdmin, deletePortalPayroll);
adminRouter.get('/holidays', ...requireHrAdmin, adminHolidays);
adminRouter.post('/holidays', ...requireHrAdmin, createHoliday);
