import { Router } from 'express';
import { getCalculatedStock, getStockDashboard, getProductStockDetails, createStockReservation, releaseStockReservation, createStockTransfer, transitionStockTransfer } from './stockCalculationController.js';

import {
  getProductStats,
  getNextProductCode,
  listProducts,
  getCategories,
  getSubCategories,
  getBrands,
  getSizes,
  getFabrics,
  getColours,
  getTypes,
  getProduct,
  createProduct,
  updateProduct,
  recordBarcodePrint,
  resetBarcodePrintCounts,
  deleteProduct,
  importProducts,
  uploadProductsFile,
} from './productController.js';
import {
  getNextStockInNumber,
  getStockInStats,
  listStockIn,
  getStockIn,
  createStockIn,
  createStockInBatch,
  updateStockIn,
  deleteStockIn,
  importStockIn,
} from './stockInController.js';
import { uploadExcelFile } from '../../../utils/excelImport.js';
import {
  getNextStockOutNumber,
  getStockOutStats,
  listStockOut,
  getStockOut,
  createStockOut,
  createStockOutBatch,
  updateStockOut,
  deleteStockOut,
} from './stockOutController.js';
import {
  getWarehouseStats,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from './warehouseController.js';
import { getAlertStats, listAlerts, getAlertThresholds, updateAlertThresholds, markAlertsReviewed, getAlertPurchaseOrderSeed } from './alertsController.js';
import { getStockLedger, getStockSummary } from './reportController.js';
import {
  getCategoryStats,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categoryController.js';
import {
  getBrandStats,
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
} from './brandController.js';
import {
  getSubcategoryStats,
  listSubcategories,
  getSubcategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from './subcategoryController.js';

export const inventoryRouter = Router();
inventoryRouter.get('/reports/stock', getCalculatedStock);
inventoryRouter.get('/reports/dashboard', getStockDashboard);
inventoryRouter.get('/reports/stock/:productId/details', getProductStockDetails);
inventoryRouter.post('/reservations', createStockReservation);
inventoryRouter.post('/reservations/:id/release', releaseStockReservation);
inventoryRouter.post('/transfers', createStockTransfer);
inventoryRouter.post('/transfers/:id/workflow', transitionStockTransfer);

inventoryRouter.get('/reports/summary', getStockSummary);
inventoryRouter.get('/reports/ledger',  getStockLedger);

// ── Products ──────────────────────────────────────────────────────────────────
inventoryRouter.get('/products/stats',          getProductStats);
inventoryRouter.get('/products/next-code',      getNextProductCode);
inventoryRouter.get('/products/categories',     getCategories);
inventoryRouter.get('/products/subcategories',  getSubCategories);
inventoryRouter.get('/products/brands',         getBrands);
inventoryRouter.get('/products/sizes',          getSizes);
inventoryRouter.get('/products/fabrics',        getFabrics);
inventoryRouter.get('/products/colours',        getColours);
inventoryRouter.get('/products/types',          getTypes);
inventoryRouter.post('/products/import',        uploadProductsFile.single('file'), importProducts);
inventoryRouter.get('/products',                listProducts);
inventoryRouter.post('/products',               createProduct);
inventoryRouter.post('/products/barcode-print/reset', resetBarcodePrintCounts);
inventoryRouter.post('/products/:id/barcode-print', recordBarcodePrint);
inventoryRouter.get('/products/:id',            getProduct);
inventoryRouter.put('/products/:id',            updateProduct);
inventoryRouter.delete('/products/:id',         deleteProduct);

// ── Stock In ──────────────────────────────────────────────────────────────────
inventoryRouter.get('/stock-in/next-number',    getNextStockInNumber);
inventoryRouter.get('/stock-in/stats',          getStockInStats);
inventoryRouter.post('/stock-in/import',        uploadExcelFile.single('file'), importStockIn);
inventoryRouter.get('/stock-in',                listStockIn);
inventoryRouter.post('/stock-in',               createStockIn);
inventoryRouter.post('/stock-in/batch',         createStockInBatch);
inventoryRouter.get('/stock-in/:id',            getStockIn);
inventoryRouter.put('/stock-in/:id',            updateStockIn);
inventoryRouter.delete('/stock-in/:id',         deleteStockIn);

// ── Stock Out ─────────────────────────────────────────────────────────────────
inventoryRouter.get('/stock-out/next-number',   getNextStockOutNumber);
inventoryRouter.get('/stock-out/stats',         getStockOutStats);
inventoryRouter.get('/stock-out',               listStockOut);
inventoryRouter.post('/stock-out',              createStockOut);
inventoryRouter.post('/stock-out/batch',        createStockOutBatch);
inventoryRouter.get('/stock-out/:id',           getStockOut);
inventoryRouter.put('/stock-out/:id',           updateStockOut);
inventoryRouter.delete('/stock-out/:id',        deleteStockOut);

// ── Warehouses ────────────────────────────────────────────────────────────────
inventoryRouter.get('/warehouses/stats',        getWarehouseStats);
inventoryRouter.get('/warehouses',              listWarehouses);
inventoryRouter.post('/warehouses',             createWarehouse);
inventoryRouter.get('/warehouses/:id',          getWarehouse);
inventoryRouter.put('/warehouses/:id',          updateWarehouse);
inventoryRouter.delete('/warehouses/:id',       deleteWarehouse);

// ── Alerts ────────────────────────────────────────────────────────────────────
inventoryRouter.get('/alerts/stats',            getAlertStats);
inventoryRouter.get('/alerts',                  listAlerts);
inventoryRouter.post('/alerts/review', markAlertsReviewed);
inventoryRouter.get('/alerts/thresholds/:productId', getAlertThresholds);
inventoryRouter.patch('/alerts/thresholds/:productId', updateAlertThresholds);
inventoryRouter.get('/alerts/:id/purchase-order', getAlertPurchaseOrderSeed);

// ── Categories ────────────────────────────────────────────────────────────────
inventoryRouter.get('/categories/stats',        getCategoryStats);
inventoryRouter.get('/categories',              listCategories);
inventoryRouter.post('/categories',             createCategory);
inventoryRouter.get('/categories/:id',          getCategory);
inventoryRouter.put('/categories/:id',          updateCategory);
inventoryRouter.delete('/categories/:id',       deleteCategory);

// ── Subcategories ─────────────────────────────────────────────────────────────
inventoryRouter.get('/subcategories/stats',     getSubcategoryStats);
inventoryRouter.get('/subcategories',           listSubcategories);
inventoryRouter.post('/subcategories',          createSubcategory);
inventoryRouter.get('/subcategories/:id',       getSubcategory);
inventoryRouter.put('/subcategories/:id',       updateSubcategory);
inventoryRouter.delete('/subcategories/:id',    deleteSubcategory);

// ── Brands ────────────────────────────────────────────────────────────────────
inventoryRouter.get('/brands/stats',            getBrandStats);
inventoryRouter.get('/brands',                  listBrands);
inventoryRouter.post('/brands',                 createBrand);
inventoryRouter.get('/brands/:id',              getBrand);
inventoryRouter.put('/brands/:id',              updateBrand);
inventoryRouter.delete('/brands/:id',           deleteBrand);
