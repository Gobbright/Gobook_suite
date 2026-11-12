import { Router } from 'express';

import { deleteByPeriod, exportData, getDataSummary, importData, previewDeleteByPeriod, uploadBackupFile } from './controller.js';

export const dataManagementRouter = Router();

dataManagementRouter.get('/summary', getDataSummary);
dataManagementRouter.get('/export', exportData);
dataManagementRouter.get('/period-preview', previewDeleteByPeriod);
dataManagementRouter.post('/import', uploadBackupFile.single('file'), importData);
dataManagementRouter.delete('/period', deleteByPeriod);
