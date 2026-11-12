import { assertCreditCapacity } from '../../../../services/financialCredits.js';
import { atomicInventoryHandler } from '../../../../services/inventoryTransaction.js';
import { stripWorkflowFields, invoiceState, SALES_TYPES } from '../../../../services/salesLifecycle.js';
import { Invoice } from '../../../../models/Invoice.js';
import {
  postCreditNoteAccounting,
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

const DOCTYPE = 'credit-note';

// GET /api/sales/credit-notes/next-number?prefix=CRN
export async function getNextCreditNoteNumber(req, res, next) {
  try {
    const { prefix = 'CRN' } = req.query;
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

// GET /api/sales/credit-notes
export async function listCreditNotes(req, res, next) {
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

// GET /api/sales/credit-notes/:id
export async function getCreditNote(req, res, next) {
  try {
    const note = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE })).lean();
    if (!note) return next(httpError(404, 'Credit note not found'));
    const withAccounting = await attachAccountingStatus(req.user.id, note);
    res.json(await withBusinessSettings(req, withAccounting));
  } catch (err) {
    next(err);
  }
}

// POST /api/sales/credit-notes
async function createCreditNoteHandler(req, res, next) {
  try {
    const payload = await financialCreditPayload(req.body, req.user.id);
    const note = await Invoice.create({ ...payload, userId: req.user.id, businessId: req.user.businessId, branch: await branchForNewRecord(req, payload.branch), documentType: DOCTYPE });
    await postCreditNoteAccounting(note, req.user);
    res.status(201).json(await attachAccountingStatus(req.user.id, note.toObject()));
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, `Credit note number "${req.body.number}" already exists`));
    next(err);
  }
}

// PUT /api/sales/credit-notes/:id
async function updateCreditNoteHandler(req, res, next) {
  try {
    const updates = { ...await financialCreditPayload(req.body, req.user.id, req.params.id), documentType: DOCTYPE };
    updates.branch = await branchForNewRecord(req, updates.branch);
    const note = await Invoice.findOneAndUpdate(
      await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE }),
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!note) return next(httpError(404, 'Credit note not found'));
    await postCreditNoteAccounting(note, req.user);
    res.json(await attachAccountingStatus(req.user.id, note));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sales/credit-notes/:id
async function deleteCreditNoteHandler(req, res, next) {
  try {
    const note = await Invoice.findOneAndDelete(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE })).lean();
    if (!note) return next(httpError(404, 'Credit note not found'));
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'credit-note', sourceId: note._id });
    res.json({ message: 'Credit note deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function financialCreditPayload(body, userId, excludeId) {
  const payload = stripWorkflowFields(body);
  const original = String(payload.extra?.originalSalesId || '').trim();
  const number = String(payload.extra?.originalInvoiceNo || '').trim();
  if (!original && !number) throw httpError(400, 'Reference the original invoice for this financial adjustment');
  const source = await Invoice.findOne({ userId, documentType: { $in: SALES_TYPES }, ...(original ? { _id: original } : { number }) }).lean();
  if (!source || invoiceState(source) !== 'posted') throw httpError(409, 'Financial adjustments require an existing posted invoice');
  if (!String(payload.extra?.reason || '').trim()) throw httpError(400, 'A reason is required for a financial adjustment');
  await assertCreditCapacity(source, payload, { excludeId });
  await Invoice.updateOne({ _id: source._id, userId }, { $inc: { workflowRevision: 1 } });
  return { ...payload, customer: source.customer, branch: source.branch, extra: { ...payload.extra, originalSalesId: String(source._id), originalInvoiceNo: source.number }, lifecycleStatus: 'posted' };
}

export const createCreditNote = atomicInventoryHandler(createCreditNoteHandler);
export const updateCreditNote = atomicInventoryHandler(updateCreditNoteHandler);
export const deleteCreditNote = atomicInventoryHandler(deleteCreditNoteHandler);
