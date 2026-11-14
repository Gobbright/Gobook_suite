import { createCreditNote, updateCreditNote, deleteCreditNote } from '../credit-debit-note/creditNoteController.js';
import { isSalesInvoice, invoiceState, stripWorkflowFields, newSaleLifecycle, ACTIVE_FINANCIAL_FILTER, assertPostableInvoice } from '../../../../services/salesLifecycle.js';
import { assertAutomobileBill, assertAutomobileQuotation } from '../../../../services/automobileBillValidation.js';
import { assertConvertibleQuotation } from '../../../../services/quotationConversion.js';
import { assertWorkflowPermission } from './lifecycleController.js';
import { atomicInventoryHandler } from '../../../../services/inventoryTransaction.js';
import { Invoice } from '../../../../models/Invoice.js';
import { dynamicSalesReport } from '../shared/dynamicSalesReport.js';
import { assertBillingCustomerMobile } from '../../../../services/customerMobile.js';
import { createSupplierReturn, updateSupplierReturn, deleteSupplierReturn } from '../supplier-return/supplierReturnController.js';
import { createSalesReturn, updateSalesReturn, deleteSalesReturn } from '../sales-return/salesReturnController.js';
import { Payment } from '../../../../models/Payment.js';
import { Types } from 'mongoose';
import { httpError } from '../../../../utils/httpError.js';
import { GOBOOK_LOGO_CID, sendMail } from '../../../../utils/mailer.js';
import { buildSalesAggregationPipeline, escapeRegex, isBillableDocType, paymentStatusStages, unwrapFacetResult } from '../shared/salesFilters.js';
import { postInventoryForDocument, reverseInventoryForDocument } from '../../../../services/inventoryMovements.js';
import {
  postInvoiceAccounting,
  postPaymentAccounting,
  postPurchaseEntryAccounting,
  postSalesReturnAccounting,
  postSupplierReturnAccounting,
  reverseAccountingPosting,
} from '../../../../services/accountingPostings.js';
import {
  attachAccountingStatus,
  attachAccountingStatusList,
} from '../../../../services/salesAccountingStatus.js';
import { branchForNewRecord, branchScopedAggregateMatch, branchScopedQuery } from '../../../../utils/branchScope.js';
import { businessSettingsForInvoice, resolvedBusinessSettingsForInvoice } from '../shared/invoiceBusinessSettings.js';

function normalizeInvoicePayload(body = {}) {
  const items = Array.isArray(body.items)
    ? body.items.map((item) => {
        const variant = item.variant || item.productVariant || {};
        const brand = String(item.brand ?? item.other ?? item.variantBrand ?? variant.other ?? variant.brand ?? '').trim();
        const material = String(item.material ?? item.fabric ?? item.variantMaterial ?? variant.material ?? variant.fabric ?? '').trim();
        return {
          ...item,
          description: String(item.description ?? ''),
          itemDescription: String(
            item.itemDescription
            ?? item.lineDescription
            ?? item.details
            ?? item.note
            ?? item.remark
            ?? '',
          ),
          itemType: String(item.itemType ?? '').trim().toLowerCase() === 'service' ? 'Service' : 'Product',
          productType: String(item.productType ?? '').trim() || 'Standard',
          size: String(item.size ?? item.modelName ?? item.modelNumber ?? variant.size ?? variant.modelName ?? '').trim(),
          brand,
          material,
          fabric: String(item.fabric ?? material).trim(),
          other: String(item.other ?? brand).trim(),
          barcode: String(item.barcode ?? variant.barcode ?? '').trim(),
          hsn: String(item.hsn ?? ''),
          unit: String(item.unit ?? ''),
        };
      })
    : body.items;

  return { ...body, ...(items ? { items } : {}) };
}

function invoiceTotalFromPayload(payload = {}) {
  const totals = payload.totals || {};
  const saved = Number(totals.finalTotal ?? totals.grandTotal ?? totals.total ?? totals.subTotal);
  if (Number.isFinite(saved)) return saved;
  return 0;
}

function customerBalanceConditions(customer = {}) {
  const conditions = [];
  const name = String(customer.name || '').trim();
  const gstin = String(customer.gstin || '').trim();
  const phoneDigits = String(customer.phone || '').replace(/\D/g, '').slice(-10);

  if (gstin) conditions.push({ 'customer.gstin': new RegExp(`^${escapeRegex(gstin)}$`, 'i') });
  if (phoneDigits) conditions.push({ 'customer.phone': new RegExp(escapeRegex(phoneDigits), 'i') });
  if (name) conditions.push({ 'customer.name': new RegExp(`^${escapeRegex(name)}$`, 'i') });

  return conditions;
}

async function customerOldBalance(req, customer, excludeInvoiceId = null, options = {}) {
  const conditions = customerBalanceConditions(customer);
  if (conditions.length === 0) return 0;

  const match = await branchScopedAggregateMatch(
    req,
    { model: Invoice, ownerField: 'userId' },
    { documentType: { $in: ['invoice', 'bill-of-supply', 'pharmacy-bill'] }, ...ACTIVE_FINANCIAL_FILTER },
  );
  match.$and = [...(match.$and || []), { $or: conditions }];
  if (excludeInvoiceId && Types.ObjectId.isValid(excludeInvoiceId)) {
    match._id = { $ne: new Types.ObjectId(excludeInvoiceId) };
  }
  if (options.beforeCreatedAt) {
    const beforeCreatedAt = new Date(options.beforeCreatedAt);
    if (!Number.isNaN(beforeCreatedAt.getTime())) {
      match.createdAt = { $lt: beforeCreatedAt };
    }
  }

  const [row] = await Invoice.aggregate([
    { $match: match },
    ...paymentStatusStages(req.user.id),
    { $group: { _id: null, oldBalance: { $sum: '$balance' } } },
  ]);
  return Math.round((Number(row?.oldBalance) || 0) * 100) / 100;
}

async function invoiceCurrentBalance(invoice, userId) {
  const invoiceAmount = invoiceTotalFromPayload(invoice);
  const payments = await Payment.find({ invoiceId: invoice._id, userId }).lean();
  const paymentTotal = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const paidAmount = payments.length > 0 ? paymentTotal : Math.max(0, Number(invoice.advanceReceived) || 0);
  return Math.max(0, invoiceAmount - paidAmount);
}

async function withDisplayCustomerBalance(req, invoice) {
  if (!['invoice', 'bill-of-supply', 'pharmacy-bill'].includes(invoice.documentType)) return invoice;
  const hasOldBalance = Number.isFinite(Number(invoice.extra?.oldBalance));
  const hasNewBalance = Number.isFinite(Number(invoice.extra?.newBalance));
  if (hasOldBalance && hasNewBalance) return invoice;

  const oldBalance = await customerOldBalance(req, invoice.customer, invoice._id, { beforeCreatedAt: invoice.createdAt });
  const currentBalance = await invoiceCurrentBalance(invoice, req.user.id);
  return {
    ...invoice,
    extra: {
      ...(invoice.extra || {}),
      oldBalance,
      newBalance: Math.round((oldBalance + currentBalance) * 100) / 100,
    },
  };
}

async function withCustomerBalance(req, payload, excludeInvoiceId = null, receivedAmount = null) {
  if (!['invoice', 'bill-of-supply', 'pharmacy-bill'].includes(payload.documentType)) return payload;
  const oldBalance = await customerOldBalance(req, payload.customer, excludeInvoiceId);
  const invoiceAmount = invoiceTotalFromPayload(payload);
  const paidAmount = Math.max(0, Number(receivedAmount ?? payload.advanceReceived) || 0);
  const currentBalance = Math.max(0, invoiceAmount - paidAmount);
  return {
    ...payload,
    extra: {
      ...(payload.extra || {}),
      oldBalance,
      newBalance: Math.round((oldBalance + currentBalance) * 100) / 100,
    },
  };
}

// GET /api/sales/invoices/next-number?prefix=INV
export async function getNextNumber(req, res, next) {
  try {
    const { prefix = 'INV' } = req.query;
    const last = await Invoice.findOne(
      { businessId: req.user.businessId, number: new RegExp(`^${prefix}-`, 'i') },
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

// GET /api/sales/invoices
export async function listInvoices(req, res, next) {
  try {
    if (req.query.report) return await dynamicSalesReport(req, res);
    const { documentType, page = 1, limit = 50 } = req.query;
    const baseDocumentType = documentType || { $in: ['invoice', 'bill-of-supply'] };
    const includePayment = isBillableDocType(documentType);

    const baseMatch = await branchScopedAggregateMatch(req, { model: Invoice, ownerField: 'userId' });
    const pipeline = buildSalesAggregationPipeline(req.query, req.user.id, baseDocumentType, { includePayment, baseMatch });
    const result = await Invoice.aggregate(pipeline);
    const { data, total } = unwrapFacetResult(result);

    res.json({ data: await attachAccountingStatusList(req.user.id, data), total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/sales/invoices/:id
export async function getInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id })).lean();
    if (!invoice) return next(httpError(404, 'Invoice not found'));
    const withAccounting = await attachAccountingStatus(req.user.id, await withDisplayCustomerBalance(req, invoice));
    const resolved = await resolvedBusinessSettingsForInvoice(req, withAccounting);
    if (resolved.branchKey || resolved.settings) {
      await Invoice.updateOne(
        { _id: withAccounting._id },
        {
          $set: {
            branch: withAccounting.branch || resolved.branchKey || '',
            businessSettingsSnapshot: resolved.settings,
          },
        },
      ).catch(() => {});
    }
    res.json({
      ...withAccounting,
      branch: withAccounting.branch || resolved.branchKey || '',
      businessSettings: resolved.settings,
      businessSettingsSnapshot: withAccounting.businessSettingsSnapshot || resolved.settings,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/sales/invoices
async function createInvoiceHandler(req, res, next) {
  if (req.body.documentType === 'sales-return') return createSalesReturn(req, res, next);
  if (req.body.documentType === 'supplier-return') return createSupplierReturn(req, res, next);
  try {
    let payload = normalizeInvoicePayload(stripWorkflowFields(req.body));
    assertBillingCustomerMobile(payload);
    assertAutomobileBill(payload, req.user.category);
    assertAutomobileQuotation(payload, req.user.category);
    if (req.user.category === 'automobile' && payload.documentType === 'quotation') {
      payload.extra = { ...payload.extra, quotationStatus: payload.extra?.quotationStatus || payload.extra?.status || 'Draft' };
      Object.assign(payload, { advanceReceived: 0, paymentMethod: '', paymentSplits: [] });
    }
    payload = await withCustomerBalance(req, payload);
    if (isSalesInvoice(payload)) {
      await assertWorkflowPermission(req, 'create');
      payload = { ...payload, ...newSaleLifecycle(req.body, req.user.id) };
      if (payload.lifecycleStatus === 'draft') Object.assign(payload, { advanceReceived: 0, paymentMethod: '', paymentSplits: [] });
      else assertPostableInvoice(payload);
    }
    let sourceQuotation = null;
    if (req.user.category === 'automobile' && payload.documentType === 'invoice' && payload.extra?.sourceQuotationId) {
      if (!Types.ObjectId.isValid(payload.extra.sourceQuotationId)) throw httpError(400, 'Invalid source quotation.');
      sourceQuotation = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: payload.extra.sourceQuotationId, documentType: 'quotation' }));
      assertConvertibleQuotation(sourceQuotation);
      payload.extra.sourceQuotationNumber = sourceQuotation.number;
    }
    const branch = await branchForNewRecord(req, payload.branch);
    const businessSettingsSnapshot = await businessSettingsForInvoice(req, { ...payload, branch, userId: req.user.id });
    const invoice = await Invoice.create({ ...payload, userId: req.user.id, businessId: req.user.businessId, branch, businessSettingsSnapshot });
    await postInventoryForDocument(invoice, req.user.id);
    await postInvoiceAccounting(invoice, req.user);
    await postPurchaseEntryAccounting(invoice, req.user);
    await postSalesReturnAccounting(invoice, req.user);
    await postSupplierReturnAccounting(invoice, req.user);
    if (sourceQuotation) {
      const linked = await Invoice.updateOne({ _id: sourceQuotation._id, $or: [{ 'extra.convertedInvoiceId': { $exists: false } }, { 'extra.convertedInvoiceId': null }, { 'extra.convertedInvoiceId': '' }] }, { $set: { 'extra.convertedInvoiceId': String(invoice._id), 'extra.convertedInvoiceNumber': invoice.number, 'extra.convertedAt': new Date().toISOString(), 'extra.quotationStatus': 'Converted' } });
      if (linked.modifiedCount !== 1) throw httpError(409, 'This quotation has already been converted to a bill.');
    }
    res.status(201).json(await attachAccountingStatus(req.user.id, invoice.toObject()));
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, `Invoice number "${req.body.number}" already exists`));
    next(err);
  }
}

// PUT /api/sales/invoices/:id
async function updateInvoiceHandler(req, res, next) {
  try {
    let payload = normalizeInvoicePayload(stripWorkflowFields(req.body));
    const existing = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id }));
    if (!existing) return next(httpError(404, 'Invoice not found'));
    assertBillingCustomerMobile({ ...existing.toObject(), ...payload, extra: { ...existing.extra, ...payload.extra } });
    assertAutomobileBill({ ...existing.toObject(), ...payload }, req.user.category);
    assertAutomobileQuotation({ ...existing.toObject(), ...payload }, req.user.category);
    if (req.user.category === 'automobile' && existing.documentType === 'quotation') Object.assign(payload, { advanceReceived: 0, paymentMethod: '', paymentSplits: [] });
    if (existing.documentType === 'sales-return') return updateSalesReturn(req, res, next);
    if (existing.documentType === 'supplier-return') return updateSupplierReturn(req, res, next);
    if (isSalesInvoice(existing)) {
      await assertWorkflowPermission(req, 'edit');
      assertMutableBill(existing);
      payload.documentType ??= existing.documentType;
      payload.customer ??= existing.customer;
      payload.totals ??= existing.totals;
      payload.extra = { ...existing.extra, ...payload.extra };
      for (const key of ['sourceQuotationId', 'sourceQuotationNumber', 'sourceChallanId', 'sourceChallanNumber', 'onlineOrderId', 'stockHandledByOnlineOrder']) {
        if (existing.extra?.[key] !== undefined) payload.extra[key] = existing.extra[key];
        else delete payload.extra[key];
      }
      Object.assign(payload, invoiceState(existing) === 'draft'
        ? { advanceReceived: 0, paymentMethod: '', paymentSplits: [] }
        : { advanceReceived: existing.advanceReceived, paymentMethod: existing.paymentMethod, paymentSplits: existing.paymentSplits });
    }
    if (payload.documentType === 'sales-return') return next(httpError(400, 'Create a separate sales return instead of changing this document type'));
    if (payload.documentType === 'supplier-return') return next(httpError(400, 'Create a separate supplier return instead of changing this document type'));
    if (payload.documentType && payload.documentType !== existing.documentType) throw httpError(400, 'Document type cannot be changed after creation');
    await assertNoLinkedReturns(existing, req.user.id);
    const postedBill = isSalesInvoice(existing) && invoiceState(existing) === 'posted';
    const payableBill = existing.documentType === 'purchase-entry';
    const payments = postedBill || payableBill ? await Payment.find({ invoiceId: existing._id, userId: existing.userId }).lean() : [];
    const received = payments.length ? payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) : Number(existing.advanceReceived || 0);
    const proposed = { ...existing.toObject(), ...payload };
    if (postedBill || payableBill) {
      assertPostableInvoice(proposed);
      if (invoiceTotalFromPayload(proposed) + 0.01 < received) throw httpError(409, 'Bill total cannot be lower than the payments already received. Adjust or refund the payments first.');
    }
    payload = await withCustomerBalance(req, payload, existing._id, postedBill ? received : null);
    const branch = await branchForNewRecord(req, payload.branch ?? existing.branch);
    const businessSettingsSnapshot = await businessSettingsForInvoice(req, { ...existing.toObject(), ...payload, branch, userId: existing.userId });
    const nextInvoice = new Invoice({
      ...existing.toObject(),
      ...payload,
      _id: existing._id,
      userId: existing.userId,
      businessId: existing.businessId,
      branch,
      businessSettingsSnapshot,
    });

    await postInventoryForDocument(nextInvoice, req.user.id);
    const invoice = await Invoice.findOneAndUpdate(
      await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id }),
      { $set: { ...payload, branch, businessSettingsSnapshot }, ...(postedBill ? {
        $inc: { workflowRevision: 1 },
        $push: { lifecycleEvents: { action: 'edited', by: req.user.id, at: new Date(), reason: 'Bill updated from the editor' } },
      } : {}) },
      { new: true, runValidators: true },
    );
    if (!invoice) throw httpError(409, 'Document changed or was removed. Refresh and retry.');

    await postInvoiceAccounting(invoice, req.user);
    await postPurchaseEntryAccounting(invoice, req.user);
    await postSalesReturnAccounting(invoice, req.user);
    await postSupplierReturnAccounting(invoice, req.user);

    // Preserve receipt amounts and identities, while moving their accounting
    // references with an edited customer, invoice number, or branch.
    for (const payment of payments) {
      const fields = { customerName: invoice.customer?.name || '', invoiceNumber: invoice.number, branch: invoice.branch || '' };
      await Payment.updateOne({ _id: payment._id, userId: existing.userId, invoiceId: invoice._id }, { $set: fields });
      await postPaymentAccounting({ ...payment, ...fields }, invoice, req.user);
    }
    await syncConvertedSource(invoice, false);

    res.json(await attachAccountingStatus(req.user.id, invoice.toObject()));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/sales/invoices/:id
async function deleteInvoiceHandler(req, res, next) {
  try {
    const target = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id })).lean();
    if (target?.documentType === 'sales-return') return deleteSalesReturn(req, res, next);
    if (target?.documentType === 'supplier-return') return deleteSupplierReturn(req, res, next);
    const invoice = target;
    if (!invoice) return next(httpError(404, 'Invoice not found'));
    if (isSalesInvoice(invoice)) {
      await assertWorkflowPermission(req, 'delete');
      assertMutableBill(invoice);
      if (invoiceState(invoice) === 'draft') {
        const deletedDraft = await Invoice.deleteOne({ _id: invoice._id, userId: invoice.userId, lifecycleStatus: 'draft' });
        if (deletedDraft.deletedCount !== 1) throw httpError(409, 'Invoice changed. Refresh and retry.');
        await syncConvertedSource(invoice, true);
        return res.json({ message: 'Draft deleted. Inventory was not changed.' });
      }
    }
    await assertNoLinkedReturns(invoice, req.user.id);
    await reverseInventoryForDocument(invoice, req.user.id);
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'invoice', sourceId: invoice._id });
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'purchase-entry', sourceId: invoice._id });
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'sales-return', sourceId: invoice._id });
    await reverseAccountingPosting({ userId: req.user.id, sourceType: 'supplier-return', sourceId: invoice._id });
    const payments = await Payment.find({ invoiceId: invoice._id, userId: req.user.id }).lean();
    for (const payment of payments) {
      await reverseAccountingPosting({ userId: req.user.id, sourceType: 'payment', sourceId: payment._id });
    }
    await Payment.deleteMany({ invoiceId: invoice._id, userId: req.user.id });
    const deleted = await Invoice.deleteOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: invoice._id }));
    if (deleted.deletedCount !== 1) throw httpError(409, 'Document changed or was removed. Refresh and retry.');
    await syncConvertedSource(invoice, true);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// POST /api/sales/invoices/:id/send-email
export async function sendInvoiceEmail(req, res, next) {
  try {
    const invoice = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id })).lean();
    if (!invoice) return next(httpError(404, 'Invoice not found'));

    const { toEmail, pdfBase64 } = req.body;
    if (!toEmail) return next(httpError(400, 'Recipient email is required'));

    const biz = await businessSettingsForInvoice(req, invoice);
    const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const fmtDate = (s) => { if (!s) return '-'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    let calculatedTotal = 0;
    const itemRows = (invoice.items || [])
      .filter((it) => it.description || Number(it.rate) > 0)
      .map((it, idx) => {
        const gross = (Number(it.qty) || 0) * (Number(it.rate) || 0);
        const discountValue = Number(it.discount) || 0;
        const discount = it.discountType === 'amount'
          ? Math.min(gross, discountValue)
          : gross * (discountValue / 100);
        const taxable = gross - discount;
        const gst     = taxable * ((Number(it.gstRate) || 0) / 100);
        const itemDescription = it.itemDescription == null ? '' : String(it.itemDescription);
        calculatedTotal += taxable + gst;
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `<tr style="background:${bg}">
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${escapeHtml(it.description || '-')}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;white-space:pre-wrap">${itemDescription ? escapeHtml(itemDescription) : '-'}</td>
          <td style="padding:11px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#374151">${it.qty}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#374151">${fmtCurrency(it.rate)}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:600;color:#1e3a8a">${fmtCurrency(taxable + gst)}</td>
        </tr>`;
      }).join('');

    // Add additional charges (freight, packing, etc.) to the total
    (invoice.charges || []).forEach((c) => {
      const amt = Number(c.amount) || 0;
      calculatedTotal += amt + amt * ((Number(c.gstRate) || 0) / 100);
    });

    const grandTotal = fmtCurrency(invoice.grandTotal || invoice.totals?.finalTotal || invoice.totals?.grandTotal || calculatedTotal);
    const docLabel = { invoice: 'Invoice', quotation: 'Quotation', 'credit-note': 'Credit Note', 'debit-note': 'Debit Note', 'sales-return': 'Sales Return', 'delivery-challan': 'Delivery Challan' }[invoice.documentType] || 'Invoice';

    const notesBlock = (invoice.notes || invoice.terms) ? `
    <tr>
      <td style="padding:0 36px 20px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px">
          <tr><td style="padding:14px 18px">
            ${invoice.notes ? `<div style="font-size:13px;color:#374151"><span style="font-weight:700;color:#92400e">Notes:</span> ${invoice.notes}</div>` : ''}
            ${invoice.terms ? `<div style="font-size:13px;color:#374151;margin-top:${invoice.notes ? '6' : '0'}px"><span style="font-weight:700;color:#92400e">Terms:</span> ${invoice.terms}</div>` : ''}
          </td></tr>
        </table>
      </td>
    </tr>` : '';

    const bankBlock = biz.bankName ? `
    <tr>
      <td style="padding:0 36px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
          <tr><td style="padding:14px 18px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#16a34a;margin-bottom:10px">Payment / Bank Details</div>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr><td style="font-size:12px;color:#6b7280;padding-right:12px;padding-bottom:4px">Bank</td><td style="font-size:13px;color:#111827;font-weight:600;padding-bottom:4px">${biz.bankName}</td></tr>
              ${biz.accountNumber ? `<tr><td style="font-size:12px;color:#6b7280;padding-right:12px;padding-bottom:4px">A/C No.</td><td style="font-size:13px;color:#111827;font-weight:600;padding-bottom:4px">${biz.accountNumber}</td></tr>` : ''}
              ${biz.ifscCode ? `<tr><td style="font-size:12px;color:#6b7280;padding-right:12px">IFSC</td><td style="font-size:13px;color:#111827;font-weight:600">${biz.ifscCode}</td></tr>` : ''}
            </table>
          </td></tr>
        </table>
      </td>
    </tr>` : '';

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,'Helvetica Neue',sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7">
<tr><td align="center" style="padding:32px 16px">

<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">

  <!-- HEADER -->
  <tr>
    <td style="background:#1e3a8a;padding:0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:28px 36px 22px">
            <img src="cid:${GOBOOK_LOGO_CID}" width="132" alt="GoBooks" style="display:block;width:132px;max-width:132px;height:auto;border:0;background:#ffffff;border-radius:8px;padding:8px 10px;margin:0 0 14px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">${biz.businessName || 'GoBooks Enterprises'}</div>
            ${biz.gstin ? `<div style="font-size:12px;color:#93c5fd;margin-top:4px">GSTIN: ${biz.gstin}</div>` : ''}
            ${(biz.address || biz.city || biz.state) ? `<div style="font-size:12px;color:#bfdbfe;margin-top:2px">${[biz.address, [biz.city, biz.state, biz.pincode].filter(Boolean).join(', ')].filter(Boolean).join(', ')}</div>` : ''}
          </td>
          <td align="right" valign="middle" style="padding:28px 36px 22px;white-space:nowrap">
            <table cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.13);border-radius:8px">
              <tr><td style="padding:10px 18px;text-align:center">
                <div style="font-size:10px;color:#93c5fd;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">${docLabel}</div>
                <div style="font-size:20px;font-weight:800;color:#ffffff;margin-top:3px">#${invoice.number}</div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- DATE BAR -->
  <tr>
    <td style="background:#1e40af;padding:9px 36px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-size:12px;color:#bfdbfe">Date: <span style="color:#ffffff;font-weight:700">${fmtDate(invoice.meta?.date)}</span></td>
          ${invoice.meta?.dueDate ? `<td align="right" style="font-size:12px;color:#bfdbfe">Due: <span style="color:#fbbf24;font-weight:700">${fmtDate(invoice.meta.dueDate)}</span></td>` : ''}
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:30px 36px 20px">

      <!-- Greeting -->
      <p style="margin:0 0 22px;font-size:14px;color:#374151;line-height:1.75">
        Dear <strong style="color:#111827">${invoice.customer?.name || 'Customer'}</strong>,<br>
        Please find your ${docLabel.toLowerCase()} details below. Thank you for your business!
      </p>

      <!-- Bill To -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px">
        <tr>
          <td width="4" bgcolor="#3b82f6" style="border-radius:4px 0 0 4px">&nbsp;</td>
          <td style="background:#eff6ff;border-radius:0 8px 8px 0;padding:14px 18px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b82f6;margin-bottom:7px">Bill To</div>
            <div style="font-size:16px;font-weight:700;color:#111827">${invoice.customer?.name || '-'}</div>
            ${invoice.customer?.phone ? `<div style="font-size:13px;color:#6b7280;margin-top:3px">${invoice.customer.phone}</div>` : ''}
            ${invoice.customer?.gstin ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">GSTIN: ${invoice.customer.gstin}</div>` : ''}
            ${invoice.customer?.address ? `<div style="font-size:13px;color:#374151;margin-top:5px">${invoice.customer.address}${invoice.customer.city ? ', ' + invoice.customer.city : ''}${invoice.customer.state ? ', ' + invoice.customer.state : ''}</div>` : ''}
          </td>
        </tr>
      </table>

      <!-- Items table -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
        <tr style="background:#1e3a8a">
          <th style="padding:11px 14px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.8px">Item Name</th>
          <th style="padding:11px 14px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.8px">Description</th>
          <th style="padding:11px 10px;text-align:center;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.8px;width:45px">Qty</th>
          <th style="padding:11px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.8px;width:90px">Rate</th>
          <th style="padding:11px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.8px;width:100px">Amount</th>
        </tr>
        ${itemRows}
      </table>

    </td>
  </tr>

  <!-- GRAND TOTAL -->
  <tr>
    <td style="padding:4px 36px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td></td>
          <td align="right" width="230">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1e3a8a;border-radius:10px">
              <tr>
                <td style="padding:16px 22px">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:12px;color:#bfdbfe;font-weight:600;text-transform:uppercase;letter-spacing:0.8px">Grand Total</td>
                      <td align="right" style="font-size:22px;font-weight:800;color:#ffffff">${grandTotal}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${notesBlock}
  ${bankBlock}

  <!-- FOOTER -->
  <tr>
    <td style="background:#f1f5f9;border-top:2px solid #e2e8f0;padding:18px 36px;text-align:center">
      <div style="font-size:13px;color:#475569;margin-bottom:5px">
        ${biz.businessEmail ? biz.businessEmail : ''}${biz.phone ? (biz.businessEmail ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : '') + biz.phone : ''}
      </div>
      <div style="font-size:11px;color:#94a3b8">This is a computer-generated ${docLabel.toLowerCase()}. Please retain this for your records.</div>
      <div style="font-size:10px;color:#cbd5e1;margin-top:4px">Powered by GoBooks</div>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>`;

    const attachments = pdfBase64
      ? [{ filename: `${docLabel}-${invoice.number}.pdf`, content: Buffer.from(pdfBase64, 'base64'), contentType: 'application/pdf' }]
      : [];

    await sendMail({ to: toEmail, subject: `${docLabel} #${invoice.number} from ${biz.businessName || 'GoBooks Enterprises'}`, html, attachments });
    res.json({ message: 'Email sent successfully' });
  } catch (err) {
    next(err);
  }
}

async function assertNoLinkedReturns(invoice, userId) {
  if (isSalesInvoice(invoice)) {
    const linked = await Invoice.exists({ userId, documentType: { $in: ['sales-return', 'credit-note'] }, $or: [
      { 'extra.originalSalesId': String(invoice._id) }, { 'extra.originalInvoiceNo': invoice.number },
    ] });
    if (linked) throw httpError(409, 'This bill has linked returns or credit notes. Resolve those linked documents before editing or deleting the bill.');
    return;
  }
  if (invoice.documentType !== 'purchase-entry') return;
  const linked = await Invoice.exists({ userId, documentType: 'supplier-return', $or: [
    { 'extra.originalPurchaseId': String(invoice._id) },
    { 'extra.originalInvoiceNo': invoice.number },
  ] });
  if (linked) throw httpError(409, 'This purchase has supplier returns. Remove the linked returns before editing or deleting it.');
}

function assertMutableBill(invoice) {
  if (invoiceState(invoice) === 'cancelled') throw httpError(409, 'Cancelled bills are retained with their reversal history and cannot be edited or deleted.');
  if (invoice.extra?.stockHandledByOnlineOrder) throw httpError(409, 'This bill is managed by its online order. Update or cancel the original order instead.');
}

async function syncConvertedSource(invoice, deleted) {
  for (const [key, documentType] of [['sourceQuotationId', 'quotation'], ['sourceChallanId', 'delivery-challan']]) {
    const sourceId = invoice.extra?.[key];
    if (!sourceId || !Types.ObjectId.isValid(sourceId)) continue;
    await Invoice.updateOne({ _id: sourceId, userId: invoice.userId, documentType, 'extra.convertedInvoiceId': String(invoice._id) }, deleted ? {
      $unset: { 'extra.convertedInvoiceId': '', 'extra.convertedInvoiceNumber': '', 'extra.convertedAt': '' },
      ...(documentType === 'quotation' ? { $set: { 'extra.quotationStatus': 'Draft' } } : {}),
      $inc: { workflowRevision: 1 },
    } : { $set: { 'extra.convertedInvoiceNumber': invoice.number } });
  }
}

// Dispatch return routes before opening a transaction: their cross-request
// locks must be acquired outside the session and held until commit completes.
function documentMutation(handler, action) {
  const atomic = atomicInventoryHandler(handler);
  return async (req, res, next) => {
    try {
      let documentType = req.body?.documentType;
      if (action !== 'create') {
        const target = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id })).lean();
        documentType = target?.documentType;
      }
      if (documentType === 'credit-note') return { create: createCreditNote, update: updateCreditNote, delete: deleteCreditNote }[action](req, res, next);
      if (documentType === 'supplier-return') return { create: createSupplierReturn, update: updateSupplierReturn, delete: deleteSupplierReturn }[action](req, res, next);
      if (documentType === 'sales-return') return { create: createSalesReturn, update: updateSalesReturn, delete: deleteSalesReturn }[action](req, res, next);
      return atomic(req, res, next);
    } catch (error) { next(error); }
  };
}

export const createInvoice = documentMutation(createInvoiceHandler, 'create');
export const updateInvoice = documentMutation(updateInvoiceHandler, 'update');
export const deleteInvoice = documentMutation(deleteInvoiceHandler, 'delete');
