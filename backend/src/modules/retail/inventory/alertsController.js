import { stockAlertsForRequest, getStockAlertConfig, saveStockAlertConfig, reviewStockAlerts, stockAlertPurchaseOrderSeed } from '../../../services/stockAlerts.js';

const handler = (operation) => async (req, res, next) => {
  try { res.json(await operation(req)); } catch (error) { next(error); }
};
export const listAlerts = handler(stockAlertsForRequest);
export const getAlertStats = handler(async (req) => (await stockAlertsForRequest({ ...req, query: { ...req.query, limit: '1' } })).stats);
export const getAlertThresholds = handler(getStockAlertConfig);
export const updateAlertThresholds = handler(saveStockAlertConfig);
export const markAlertsReviewed = handler(reviewStockAlerts);
export const getAlertPurchaseOrderSeed = handler(stockAlertPurchaseOrderSeed);
