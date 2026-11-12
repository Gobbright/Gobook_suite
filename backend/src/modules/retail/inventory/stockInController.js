import { manualStockBatchHandler } from '../../../services/manualStockBatch.js';
import { atomicInventoryHandler, inventoryTransaction } from '../../../services/inventoryTransaction.js';
import { StockIn } from '../../../models/StockIn.js';
import { Product } from '../../../models/Product.js';
import { httpError } from '../../../utils/httpError.js';
import { asNumber, asText, enumValue, importSummary, parseExcelRows } from '../../../utils/excelImport.js';
import { productRefCondition, resolveProductRefs } from './itemTypeFilter.js';
import { Types } from 'mongoose';
import { adjustManualStock, assertManualStockNonnegative } from '../../../services/manualStockAdjustment.js';
import { stripInventoryPostingMetadata, archiveInventoryChange } from '../../../services/inventoryStockAudit.js';

const STOCK_IN_IMPORT_COLUMNS = {
  'stock in no': 'stockInNo',
  'stock no': 'stockInNo',
  stockinno: 'stockInNo',
  number: 'stockInNo',
  grn: 'stockInNo',
  'grn no': 'stockInNo',
  'grn number': 'stockInNo',
  'gr no': 'stockInNo',
  date: 'date',
  product: 'productName',
  'product name': 'productName',
  'item name': 'productName',
  supplier: 'supplier',
  vendor: 'supplier',
  'item count': 'itemCount',
  'no of items': 'itemCount',
  'item qty': 'itemCount',
  items: 'itemCount',
  qty: 'totalQty',
  quantity: 'totalQty',
  'total qty': 'totalQty',
  value: 'totalValue',
  'total value': 'totalValue',
  amount: 'totalValue',
  'total amount': 'totalValue',
  'purchase value': 'totalValue',
  cost: 'totalValue',
  status: 'status',
};

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { $gte: start, $lte: end };
}

async function getNextStockInNumberValue(userId) {
  const last = await StockIn.findOne({ userId }, { stockInNo: 1, adjustmentGroupNo: 1 }, { sort: { createdAt: -1 } });
  let seq = 1;
  if (last) {
    const parts = (last.adjustmentGroupNo || last.stockInNo).split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n)) seq = n + 1;
  }
  const year = new Date().getFullYear();
  return `SIN-${year}-${String(seq).padStart(3, '0')}`;
}

// GET /api/inventory/stock-in/next-number
export async function getNextStockInNumber(req, res, next) {
  try {
    res.json({ number: await getNextStockInNumberValue(req.user.id) });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory/stock-in/stats?itemType=
export async function getStockInStats(req, res, next) {
  try {
    const userId = req.user.id;
    const aggregateUserId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;
    const { itemType } = req.query;
    const refCond = productRefCondition(await resolveProductRefs(Product, userId, itemType));
    const range = monthRange();
    const [result, pending] = await Promise.all([
      StockIn.aggregate([
        { $match: { userId: aggregateUserId, date: range, ...refCond } },
        {
          $group: {
            _id: null,
            count:      { $sum: 1 },
            totalItems: { $sum: '$itemCount' },
            totalValue: { $sum: '$totalValue' },
            totalQty:   { $sum: '$totalQty' },
          },
        },
      ]),
      StockIn.countDocuments({ userId, status: 'Pending', ...refCond }),
    ]);
    const r = result[0] ?? { count: 0, totalItems: 0, totalValue: 0, totalQty: 0 };
    res.json({
      totalStockIn: r.count,
      totalItems:   r.totalItems,
      totalValue:   r.totalValue,
      avgCost:      r.totalQty > 0 ? r.totalValue / r.totalQty : 0,
      pending,
    });
  } catch (err) {
    next(err);
  }
}

function applyDateRange(filter, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return;
  filter.date = {};
  if (dateFrom) filter.date.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) filter.date.$lte = new Date(`${dateTo}T23:59:59.999Z`);
}

function escapeRegex(str) {
  return String(str ?? '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/inventory/stock-in?search=&dateFrom=&dateTo=&page=&limit=&itemType=
export async function listStockIn(req, res, next) {
  try {
    const { search, dateFrom, dateTo, itemType, page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const refCond = productRefCondition(await resolveProductRefs(Product, userId, itemType));
    const filter = { userId, ...refCond };
    applyDateRange(filter, dateFrom, dateTo);
    if (search) {
      filter.$and = [{
        $or: [
          { stockInNo: new RegExp(search, 'i') },
          { productName: new RegExp(search, 'i') },
          { supplier:  new RegExp(search, 'i') },
        ],
      }];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      StockIn.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
      StockIn.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/inventory/stock-in/:id
export async function getStockIn(req, res, next) {
  try {
    const entry = await StockIn.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!entry) return next(httpError(404, 'Stock-in record not found'));
    res.json(entry);
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory/stock-in
async function createStockInHandler(req, res, next) {
  try {
    req.body = stripInventoryPostingMetadata(req.body);
    if (req.body.sourceType || req.body.sourceId || req.body.sourceNo) throw httpError(400, 'Source links are managed by the original purchase or return');
    let { stockInNo } = req.body;
    const userId = req.user.id;
    if (!stockInNo) {
      stockInNo = (await getNextStockInNumberValue(userId));
    }
    if (stockInNo) {
      const existing = await StockIn.findOne({ userId, stockInNo });
      if (existing) return next(httpError(409, `Stock-in record "${stockInNo}" already exists`));
    }
    const entry = await StockIn.create({
      ...req.body,
      stockInNo,
      userId,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      status: req.body.status || 'Completed',
    });
    await adjustManualStock(entry, 1);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
}

// POST /api/inventory/stock-in/import
export async function importStockIn(req, res, next) {
  try {
    const userId = req.user.id;
    const rows = await parseExcelRows(req.file, STOCK_IN_IMPORT_COLUMNS, 'Stock In No, Date, Supplier, Qty, Value');
    const summary = importSummary();

    for (const { rowNumber, record } of rows) {
      const stockInNo = asText(record.stockInNo);
      const dateText = asText(record.date);
      const supplier = asText(record.supplier);
      if (!stockInNo || !dateText || !supplier) {
        summary.skipped++;
        summary.errors.push(`Row ${rowNumber}: stock in no, date, and supplier are required`);
        continue;
      }

      const date = new Date(dateText);
      if (Number.isNaN(date.getTime())) {
        summary.skipped++;
        summary.errors.push(`Row ${rowNumber}: invalid date`);
        continue;
      }

      const data = {
        userId,
        stockInNo,
        date,
        productName: asText(record.productName),
        supplier,
        itemCount: asNumber(record.itemCount, 0),
        totalQty: asNumber(record.totalQty, 0),
        totalValue: asNumber(record.totalValue, 0),
        status: enumValue(record.status, ['Pending', 'Completed'], 'Completed'),
      };

      const outcome = await inventoryTransaction(async () => {
        const existing = await StockIn.findOne({ userId, stockInNo });
        if (existing?.sourceType || existing?.sourceId) return 'linked';
        if (existing) {
          data.baseQty = data.totalQty;
          if (existing.unitCost != null && data.totalQty > 0) data.unitCost = data.totalValue / data.totalQty;
          await archiveInventoryChange(existing, 'manual-adjustment-imported', { changes: data });
          await adjustManualStock(existing, -1, { allowNegative: true });
          const updated = await StockIn.findByIdAndUpdate(existing._id, { $set: data }, { new: true, runValidators: true });
          await adjustManualStock(updated, 1);
          await assertManualStockNonnegative([existing, updated]);
          return 'updated';
        }
        const created = await StockIn.create(data);
        await adjustManualStock(created, 1);
        return 'imported';
      });
      if (outcome === 'linked') {
        summary.skipped++;
        summary.errors.push(`Row ${rowNumber}: ${stockInNo} is linked to a source document. Update the original purchase or return instead.`);
      } else summary[outcome]++;

    }

    res.json(summary);
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Duplicate stock-in number found in import'));
    next(err);
  }
}

// PUT /api/inventory/stock-in/:id
async function updateStockInHandler(req, res, next) {
  try {
    const existing = await StockIn.findOne({ _id: req.params.id, userId: req.user.id });
    if (!existing) return next(httpError(404, 'Stock-in record not found'));
    if (existing.sourceType || existing.sourceId) {
      return next(httpError(409, 'Source-linked stock records must be updated from their original document'));
    }
    if (req.body.sourceType || req.body.sourceId || req.body.sourceNo) throw httpError(400, 'Source links are managed by the original purchase or return');
    const changes = stripInventoryPostingMetadata(req.body);
    changes.baseQty = Number(changes.totalQty ?? existing.totalQty);
    if (existing.unitCost != null && changes.totalValue != null && changes.baseQty > 0) changes.unitCost = Number(changes.totalValue) / changes.baseQty;
    req.body = changes;
    const nextEntry = { ...existing.toObject(), ...changes, userId: req.user.id };
    await archiveInventoryChange(existing, 'manual-adjustment-edited', { changes });
    await adjustManualStock(existing, -1, { allowNegative: true });
    await adjustManualStock(nextEntry, 1);
    await assertManualStockNonnegative([existing, nextEntry]);
    const entry = await StockIn.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: req.body },
      { new: true, runValidators: true },
    ).lean();
    if (!entry) throw httpError(409, 'Stock-in record changed or was removed. Refresh and retry.');
    res.json(entry);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/inventory/stock-in/:id
async function deleteStockInHandler(req, res, next) {
  try {
    const existing = await StockIn.findOne({ _id: req.params.id, userId: req.user.id });
    if (!existing) return next(httpError(404, 'Stock-in record not found'));
    if (existing.sourceType || existing.sourceId) {
      return next(httpError(409, 'Source-linked stock records must be deleted from their original document'));
    }
    await adjustManualStock(existing, -1);
    await archiveInventoryChange(existing, 'manual-adjustment-deleted');
    const entry = await StockIn.findOneAndDelete({ _id: req.params.id, userId: req.user.id }).lean();
    if (!entry) throw httpError(409, 'Stock-in record changed or was removed. Refresh and retry.');
    res.json({ message: 'Stock-in record deleted' });
  } catch (err) {
    next(err);
  }
}

export const createStockIn = atomicInventoryHandler(createStockInHandler);
export const updateStockIn = atomicInventoryHandler(updateStockInHandler);
export const deleteStockIn = atomicInventoryHandler(deleteStockInHandler);

export const createStockInBatch = manualStockBatchHandler({ Model: StockIn, direction: 1, numberField: 'stockInNo', nextNumber: getNextStockInNumberValue });
