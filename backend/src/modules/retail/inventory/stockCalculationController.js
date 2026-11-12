import { inventoryReportForRequest } from '../../../services/inventoryStockService.js';
import { inventoryDashboardForRequest, inventoryProductDetailsForRequest } from '../../../services/inventoryDashboard.js';
import { reserveInventory, releaseInventory, createInventoryTransfer, transitionInventoryTransfer } from '../../../services/inventoryStockOperations.js';

const handler = (operation, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await operation(req) }); } catch (error) { next(error); }
};

export const getCalculatedStock = async (req, res, next) => {
  try { res.json(await inventoryReportForRequest(req)); } catch (error) { next(error); }
};
export const getStockDashboard = async (req, res, next) => {
  try { res.json(await inventoryDashboardForRequest(req)); } catch (error) { next(error); }
};
export const getProductStockDetails = async (req, res, next) => {
  try { res.json(await inventoryProductDetailsForRequest(req)); } catch (error) { next(error); }
};
export const createStockReservation = handler(reserveInventory, 201);
export const releaseStockReservation = handler(releaseInventory);
export const createStockTransfer = handler(createInventoryTransfer, 201);
export const transitionStockTransfer = handler(transitionInventoryTransfer);
