import { Router } from 'express';

import { chatWithAssistant } from './aiController.js';
import { analysePurchasePdf, purchasePdfCapabilities } from './purchasePdfController.js';

export const aiRouter = Router();

aiRouter.post('/chat', chatWithAssistant);
aiRouter.get('/purchase-pdf', purchasePdfCapabilities);
aiRouter.post('/purchase-pdf', analysePurchasePdf);
