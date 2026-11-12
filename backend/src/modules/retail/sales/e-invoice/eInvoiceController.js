import { createInvoice, updateInvoice, deleteInvoice } from '../billing-invoicing/invoiceController.js';
import { Invoice } from '../../../../models/Invoice.js';
import {
  postInvoiceAccounting,
  reverseAccountingPosting,
} from '../../../../services/accountingPostings.js';
import { httpError } from '../../../../utils/httpError.js';
import { buildSalesAggregationPipeline, unwrapFacetResult } from '../shared/salesFilters.js';
import { branchForNewRecord, branchScopedAggregateMatch, branchScopedQuery } from '../../../../utils/branchScope.js';
import { withBusinessSettings } from '../shared/invoiceBusinessSettings.js';

const DOCTYPE = 'e-invoice';

// GET /api/sales/e-invoices/next-number?prefix=EI
export async function getNextEInvoiceNumber(req, res, next) {
  try {
    const { prefix = 'EI' } = req.query;
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

// GET /api/sales/e-invoices
export async function listEInvoices(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const baseMatch = await branchScopedAggregateMatch(req, { model: Invoice, ownerField: 'userId' });
    const pipeline = buildSalesAggregationPipeline(req.query, req.user.id, DOCTYPE, { includePayment: false, baseMatch });
    const result = await Invoice.aggregate(pipeline);
    const { data, total } = unwrapFacetResult(result);

    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/sales/e-invoices/:id
export async function getEInvoice(req, res, next) {
  try {
    const doc = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: DOCTYPE })).lean();
    if (!doc) return next(httpError(404, 'E-Invoice not found'));
    res.json(await withBusinessSettings(req, doc));
  } catch (err) {
    next(err);
  }
}

// POST /api/sales/e-invoices
export async function createEInvoice(req, res, next) {
  req.body = { ...req.body, documentType: DOCTYPE };
  return createInvoice(req, res, next);
}

// PUT /api/sales/e-invoices/:id
export async function updateEInvoice(req, res, next) {
  req.body = { ...req.body, documentType: DOCTYPE };
  return updateInvoice(req, res, next);
}

// DELETE /api/sales/e-invoices/:id
export async function deleteEInvoice(req, res, next) {
  req.body = { ...req.body, documentType: DOCTYPE };
  return deleteInvoice(req, res, next);
}
