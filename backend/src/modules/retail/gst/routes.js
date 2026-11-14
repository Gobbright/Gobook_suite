import { Router } from 'express';
import { getGstDashboard } from './dashboardController.js';
import { getGstr1, saveGstr1, fileGstr1, autoPopulateGstr1, validateGstr1, generateGstr1Summary, exportGstr1 } from './gstr1Controller.js';
import { getGstr3b, saveGstr3b, fileGstr3b, postGstr3bAccountingAdjustment } from './gstr3bController.js';
import { getReconciliation, saveReconciliation, updateEntry } from './reconciliationController.js';
import { getReport } from './reportsController.js';
import { getGstr9, saveGstr9, validateGstr9, summarizeGstr9, recordGstr9Filing } from './gstr9Controller.js';

export const gstRouter = Router();

// Dashboard
gstRouter.get('/dashboard',            getGstDashboard);

// GSTR-1 — specific paths must precede generic /gstr1 to avoid route conflicts
gstRouter.get('/gstr1/auto-populate',  autoPopulateGstr1);
gstRouter.get('/gstr1',                getGstr1);
gstRouter.post('/gstr1/validate',      validateGstr1);
gstRouter.post('/gstr1/summary',       generateGstr1Summary);
gstRouter.post('/gstr1/export',        exportGstr1);
gstRouter.put('/gstr1',                saveGstr1);
gstRouter.post('/gstr1/file',          fileGstr1);

// GSTR-3B
gstRouter.get('/gstr3b',               getGstr3b);
gstRouter.put('/gstr3b',               saveGstr3b);
gstRouter.post('/gstr3b/accounting-adjustment', postGstr3bAccountingAdjustment);
gstRouter.post('/gstr3b/file',         fileGstr3b);

// Reconciliation
gstRouter.get('/reconciliation',                         getReconciliation);
gstRouter.put('/reconciliation',                         saveReconciliation);
gstRouter.patch('/reconciliation/entry/:entryId',        updateEntry);

// Reports
gstRouter.get('/reports',              getReport);

// GSTR-9 (Annual Return)
gstRouter.get('/gstr9',                getGstr9);
gstRouter.put('/gstr9',                saveGstr9);
gstRouter.post('/gstr9/validate',      validateGstr9);
gstRouter.post('/gstr9/summary',       summarizeGstr9);
gstRouter.post('/gstr9/file',          recordGstr9Filing);
