import { StockIn } from '../../../models/StockIn.js';
import { StockOut } from '../../../models/StockOut.js';
import { Types } from 'mongoose';
import { inventoryReportForRequest } from '../../../services/inventoryStockService.js';
import { httpError } from '../../../utils/httpError.js';

function escapeRegex(str) {
  return String(str ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyDateRange(filter, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return;
  filter.date = {};
  if (dateFrom) filter.date.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) filter.date.$lte = new Date(`${dateTo}T23:59:59.999Z`);
}

function movementLabel(row, fallback) {
  if (row.sourceNo) return row.sourceNo;
  return fallback;
}

function objectId(id) {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
}

// GET /api/inventory/reports/summary
export async function getStockSummary(req, res, next) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw httpError(400, 'Invalid inventory pagination');
    const result = await inventoryReportForRequest(req);
    const rows = result.data.map(({ costLayers, references, ...row }) => row);
    const stats = {
      totalProducts: rows.length,
      activeProducts: rows.filter((row) => row.status === 'Active').length,
      totalQty: rows.reduce((sum, row) => sum + row.physicalQty, 0),
      reservedQty: rows.reduce((sum, row) => sum + row.reservedQty, 0),
      availableQty: rows.reduce((sum, row) => sum + row.availableQty, 0),
      totalValue: rows.some((row) => row.stockValue === null) ? null : rows.reduce((sum, row) => sum + row.stockValue, 0),
      lowStock: rows.filter((row) => row.status === 'Active' && row.stockStatus === 'Low Stock').length,
      outOfStock: rows.filter((row) => row.status === 'Active' && row.stockStatus === 'Out of Stock').length,
    };
    res.json({ ...result, data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, stats });
  } catch (error) { next(error); }
}

// GET /api/inventory/reports/ledger
export async function getStockLedger(req, res, next) {
  try {
    const { search, type = 'all', dateFrom, dateTo, itemType, page = 1, limit = 50 } = req.query;
    if (!Number.isInteger(Number(page)) || Number(page) < 1 || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 10000) throw httpError(400, 'Invalid inventory pagination');
    const report = await inventoryReportForRequest({ ...req, query: { ...req.query, search: undefined, status: undefined,
      ...(['warehouseMissing', 'branchMissing', 'variantMissing', 'batchMissing'].some((key) => req.query[key] === '1') ? { groupBy: 'batch' } : {}) } });
    const references = report.data.flatMap((row) => row.references);
    const inFilter = { _id: { $in: references.filter((row) => row.direction === 'in').map((row) => objectId(row.movementId)) }, status: 'Completed' };
    const outFilter = { _id: { $in: references.filter((row) => row.direction === 'out').map((row) => objectId(row.movementId)) }, status: 'Completed' };
    applyDateRange(inFilter, dateFrom, dateTo);
    applyDateRange(outFilter, dateFrom, dateTo);

    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      inFilter.$and = [{ $or: [{ productName: re }, { stockInNo: re }, { supplier: re }, { sourceNo: re }] }];
      outFilter.$and = [{ $or: [{ productName: re }, { stockOutNo: re }, { to: re }, { sourceNo: re }] }];
    }

    const inAggregateFilter = inFilter;
    const outAggregateFilter = outFilter;

    const [stockInRows, stockOutRows, stockInTotal, stockOutTotal, inTotals, outTotals] = await Promise.all([
      type === 'out' ? [] : StockIn.find(inFilter).sort({ date: -1, createdAt: -1 }).lean(),
      type === 'in' ? [] : StockOut.find(outFilter).sort({ date: -1, createdAt: -1 }).lean(),
      type === 'out' ? 0 : StockIn.countDocuments(inFilter),
      type === 'in' ? 0 : StockOut.countDocuments(outFilter),
      type === 'out' ? [] : StockIn.aggregate([{ $match: inAggregateFilter }, { $group: { _id: null, qty: { $sum: '$totalQty' }, value: { $sum: '$totalValue' } } }]),
      type === 'in' ? [] : StockOut.aggregate([{ $match: outAggregateFilter }, { $group: { _id: null, qty: { $sum: '$totalQty' }, value: { $sum: '$totalValue' } } }]),
    ]);

    const entries = [
      ...stockInRows.map((row) => ({
        purchasePrice: Number(row.totalQty) > 0 ? Number(row.totalValue || 0) / Number(row.totalQty) : 0,
        salesPrice: 0,
        _id: `in-${row._id}`,
        rawId: row._id,
        productId: row.productId,
        variantName: row.variantName,
        variantId: row.variantId, batchNumber: row.batchNumber, baseUnit: row.baseUnit,
        branch: row.branch,
        warehouse: row.warehouse || '',
        createdAt: row.createdAt,
        createdBy: row.createdBy || '',
        sourceId: row.sourceId,
        direction: 'in',
        date: row.date,
        number: row.stockInNo,
        sourceNo: movementLabel(row, row.stockInNo),
        productName: row.productName,
        party: row.supplier,
        qtyIn: row.status === 'Completed' ? row.totalQty : 0,
        qtyOut: 0,
        value: row.totalValue,
        status: row.status,
        sourceType: row.sourceType,
      })),
      ...stockOutRows.map((row) => ({
        purchasePrice: 0,
        salesPrice: Number(row.totalQty) > 0 ? Number(row.totalValue || 0) / Number(row.totalQty) : 0,
        _id: `out-${row._id}`,
        rawId: row._id,
        productId: row.productId,
        variantName: row.variantName,
        variantId: row.variantId, batchNumber: row.batchNumber, baseUnit: row.baseUnit,
        branch: row.branch,
        warehouse: row.warehouse || '',
        createdAt: row.createdAt,
        createdBy: row.createdBy || '',
        sourceId: row.sourceId,
        direction: 'out',
        date: row.date,
        number: row.stockOutNo,
        sourceNo: movementLabel(row, row.stockOutNo),
        productName: row.productName,
        party: row.to,
        qtyIn: 0,
        qtyOut: row.status === 'Completed' ? row.totalQty : 0,
        value: row.totalValue,
        status: row.status,
        sourceType: row.sourceType,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const start = (Number(page) - 1) * Number(limit);
    const data = entries.slice(start, start + Number(limit));

    res.json({
      data,
      total: type === 'in' ? stockInTotal : type === 'out' ? stockOutTotal : stockInTotal + stockOutTotal,
      stockBalances: report.data, costingMethod: report.costingMethod, warnings: report.warnings,
      page: Number(page),
      limit: Number(limit),
      stats: {
        totalInQty: inTotals[0]?.qty ?? 0,
        totalOutQty: outTotals[0]?.qty ?? 0,
        totalInValue: inTotals[0]?.value ?? 0,
        totalOutValue: outTotals[0]?.value ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
