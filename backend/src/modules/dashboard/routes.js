import { Router } from 'express';

import { getDashboardSummary } from './dashboardController.js';
import { getAutomobileDashboard } from './automobileController.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', getDashboardSummary);
dashboardRouter.get('/automobile-summary', getAutomobileDashboard);
dashboardRouter.get('/retail-summary', getAutomobileDashboard);
