import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireCategoryModule } from '../middleware/requireCategoryModule.js';
import { requireSubscriptionAccess } from '../middleware/requireSubscriptionAccess.js';
import { requireModuleAccess } from '../middleware/requireModuleAccess.js';
import { requirePlatformOwner } from '../middleware/requirePlatformOwner.js';
import { adminRouter } from '../modules/admin/routes.js';
import { aiRouter } from '../modules/ai/routes.js';
import { auditRouter } from '../modules/audit/routes.js';
import { authRouter } from '../modules/auth/routes.js';
import { dashboardRouter } from '../modules/dashboard/routes.js';
import { dataManagementRouter } from '../modules/data-management/routes.js';
import { employeePortalRouter } from '../modules/employee-portal/routes.js';
import { financeRouter } from '../modules/finance/routes.js';
import { hospitalRouter } from '../modules/hospital/routes.js';
import { moduleRecordsRouter } from '../modules/module-records/routes.js';
import { platformAdminRouter } from '../modules/platform-admin/routes.js';
import { accountingRouter } from '../modules/retail/accounting/routes.js';
import { crmRouter } from '../modules/retail/crm/routes.js';
import { gstRouter } from '../modules/retail/gst/routes.js';
import { hrPayrollRouter } from '../modules/retail/hr-payroll/routes.js';
import { inventoryRouter } from '../modules/retail/inventory/routes.js';
import { moreModulesRouter } from '../modules/retail/more-modules/routes.js';
import { salesRouter } from '../modules/retail/sales/routes.js';
import { searchRouter } from '../modules/search/routes.js';
import { referenceRouter } from '../modules/reference/routes.js';
import { onlineStoreRouter, publicOnlineStoreRouter } from '../modules/online-store/routes.js';
import { whatsAppProviderRouter } from '../modules/whatsapp-provider/routes.js';
import { settingsRouter } from '../modules/settings/routes.js';
import { subscriptionRouter } from '../modules/subscriptions/routes.js';
import { razorpayWebhook } from '../modules/subscriptions/subscriptionController.js';
import { publicFilesRouter } from '../modules/files/routes.js';
import { authIpLimit, authAccountLimit, otpSendLimit, paymentLimit } from '../middleware/securityRateLimit.js';
import { getHumanVerificationConfig, requireHumanVerification } from '../middleware/humanVerification.js';

export const apiRouter = Router();

apiRouter.get('/auth/security-config', getHumanVerificationConfig);
apiRouter.use((req, res, next) => {
  const requestPath = req.path.toLowerCase().replace(/\/+$/, '');
  const authentication = requestPath.startsWith('/auth/') || ['/admin/login', '/employee/auth/login', '/employee/auth/verify-otp', '/employee/auth/resend-otp'].includes(requestPath);
  if (req.method === 'POST' && authentication && !['/auth/logout', '/auth/complete-onboarding'].includes(requestPath)) {
    // Authentication inputs must be scalars, never MongoDB query objects.
    for (const field of ['email', 'username', 'password', 'adminId', 'employeeId', 'ownerUserId', 'credential', 'challengeId', 'otp', 'deviceOtp']) {
      if (req.body?.[field] !== undefined && typeof req.body[field] !== 'string') return res.status(400).json({ message: 'Invalid authentication details' });
    }
    if (typeof req.body?.password === 'string' && Buffer.byteLength(req.body.password, 'utf8') > 72) return res.status(400).json({ message: 'Password must not exceed 72 bytes' });
    return authIpLimit(req, res, (error) => error ? next(error) : authAccountLimit(req, res, next));
  }
  if (req.method === 'POST' && requestPath.startsWith('/subscriptions/') && !requestPath.endsWith('/webhook')) return paymentLimit(req, res, next);
  next();
});
apiRouter.use((req, res, next) => {
  if (req.method === 'POST' && ['/auth/register', '/auth/email-otp/start', '/auth/forgot-password', '/auth/resend-email-otp', '/employee/auth/login', '/employee/auth/resend-otp'].includes(req.path.toLowerCase().replace(/\/+$/, ''))) return otpSendLimit(req, res, next);
  next();
});
apiRouter.use(requireHumanVerification);

apiRouter.use('/auth', authRouter);
apiRouter.use('/subscriptions', subscriptionRouter);
apiRouter.post('/razorpay/webhook', razorpayWebhook);
apiRouter.use('/files', publicFilesRouter);
apiRouter.use('/store', publicOnlineStoreRouter);
apiRouter.use('/employee', employeePortalRouter);
apiRouter.use('/admin', adminRouter);

apiRouter.use(requireAuth);
apiRouter.use(requireSubscriptionAccess);
apiRouter.use('/reference', referenceRouter);

apiRouter.use('/ai', aiRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/data-management', requireModuleAccess('data-management'), dataManagementRouter);
apiRouter.use('/sales', requireModuleAccess('billing'), requireCategoryModule('sales'), salesRouter);
apiRouter.use('/gst', requireModuleAccess('accounting'), gstRouter);
apiRouter.use('/accounting', requireModuleAccess('accounting'), accountingRouter);
apiRouter.use('/crm', requireModuleAccess('crm'), crmRouter);
apiRouter.use('/inventory', requireModuleAccess('inventory'), inventoryRouter);
apiRouter.use('/finance', requireCategoryModule('finance'), financeRouter);
apiRouter.use('/whatsapp-provider', whatsAppProviderRouter);
apiRouter.use('/hospital', requireCategoryModule('hospital'), hospitalRouter);
apiRouter.use('/hr-payroll', requireModuleAccess('employee-management'), hrPayrollRouter);
apiRouter.use('/more-modules', moreModulesRouter);
apiRouter.use('/module-records', moduleRecordsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/online-store', onlineStoreRouter);
apiRouter.use('/platform-admin', requirePlatformOwner, platformAdminRouter);
