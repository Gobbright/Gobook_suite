import { Invoice } from '../../../../models/Invoice.js';
import {
  postDebitNoteAccounting,
  reverseAccountingPosting,
} from '../../../../services/accountingPostings.js';
import {
  attachAccountingStatus,
  attachAccountingStatusList,
} from '../../../../services/salesAccountingStatus.js';
import { httpError } from '../../../../utils/httpError.js';
import { buildSalesAggregationPipeline, unwrapFacetResult } from '../shared/salesFilters.js';
import { branchForNewRecord, branchScopedAggregateMatch, branchScopedQuery } from '../../../../utils/branchScope.js';
import { withBusinessSettings } from '../shared/invoiceBusinessSettings.js';
import { atomicInventoryHandler } from '../../../../services/inventoryTransaction.js';

const DOCTYPE = 'debit-note';

// GET /api/sales/debit-notes/next-number?prefix=DBN
export async function getNextDebitNoteNumber(req, res, next) {
  try {
    const { prefix = 'DBN' } = req.query;
    const last = await Invoice.findOne(
      { businessId: req.user.businessId, documentType: DOCTYPE, number: new RegExp(`^${prefix}-`, 'i') },
      { number: 1 },
      { sort: { createdAt: -1 } },
    );
    let seq = 1;
    if (last) {
      const parts = last.number.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n)) seq = n + 1;
    }
    res.json({ number: `${prefix}-${String(seq).padStart(4, '0')}` });
  } catch (err) {
    next(err);
  }
}

// GET /api/sales/debit-notes
export async function listDebitNotes(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const baseMatch = await branchScopedAggregateMatch(req, { model: Invoice, ownerField: 'userId' });
    const pipeline = buildSalesAggregationPipeline(req.query, req.user.id, DOCTYPE, { includePayment: false, baseMatch });
    const result = await Invoice.aggregate(pipeline);
    const { data, total } = unwrapFacetResult(result);

    res.json({ data: await attachAccountingStatusList(req.user.id, data), total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/sales/debit-notes/:id
export async function getDebitNote(req, res, next) {
  try {
    const note = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE })).lean();
    if (!note) return next(httpError(404, 'Debit note not found'));
    const withAccounting = await attachAccountingStatus(req.user.id, note);
    res.json(await withBusinessSettings(req, withAccounting));
  } catch (err) {
    next(err);
  }
}

// POST /api/sales/debit-notes
async function createDebitNoteHandler(req, res, next) {
  try {
    const note = await Invoice.create({ ...req.body, userId: req.user.id, businessId: req.user.businessId, branch: await branchForNewRecord(req, req.body.branch), documentType: DOCTYPE });
    await postDebitNoteAccounting(note, req.user);
    res.status(201).json(await attachAccountingStatus(req.user.id, note.toObject()));
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, `Debit note number "${req.body.number}" already exists`));
    next(err);
  }
}

// PUT /api/sales/debit-notes/:id
async function updateDebitNoteHandler(req, res, next) {
  try {
    const updates = { ...req.body, documentType: DOCTYPE };
    if (req.body.branch !== undefined) updates.branch = await branchForNewRecord(req, req.body.branch);
    const note = await Invoice.findOneAndUpdate(
      await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE }),
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!note) return next(httpError(404, 'Debit note not found'));
    await postDebitNoteAccounting(note, req.user);
    res.json(await attachAccountingStatus(req.user.id, note));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sales/debit-notes/:id
async function deleteDebitNoteHandler(req, res, next) {
  try {
    const filter = await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE });
    const note = await Invoice.findOne(filter).lean();
    if (!note) return next(httpError(404, 'Debit note not found'));
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'debit-note', sourceId: note._id });
    const deleted = await Invoice.deleteOne({ _id: note._id, userId: note.userId, documentType: DOCTYPE });
    if (deleted.deletedCount !== 1) throw httpError(409, 'Debit note changed or was removed. Refresh and retry.');
    res.json({ message: 'Debit note deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export const createDebitNote = atomicInventoryHandler(createDebitNoteHandler);
export const updateDebitNote = atomicInventoryHandler(updateDebitNoteHandler);
export const deleteDebitNote = atomicInventoryHandler(deleteDebitNoteHandler);
