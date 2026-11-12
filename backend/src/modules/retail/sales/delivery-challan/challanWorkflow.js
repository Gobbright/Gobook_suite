import { Invoice } from '../../../../models/Invoice.js';
import { atomicInventoryHandler } from '../../../../services/inventoryTransaction.js';
import { assertPostableInvoice, newSaleLifecycle } from '../../../../services/salesLifecycle.js';
import { branchScopedQuery } from '../../../../utils/branchScope.js';
import { httpError } from '../../../../utils/httpError.js';
import { assertWorkflowPermission } from '../billing-invoicing/lifecycleController.js';

export const CHALLAN_FIELDS = ['deliveryStatus', 'readyAt', 'dispatchedAt', 'inTransitAt', 'deliveredAt', 'convertedInvoiceId', 'convertedInvoiceNumber', 'convertedAt'];
export function cleanChallanExtra(extra = {}) {
  return Object.fromEntries(Object.entries(extra || {}).filter(([key]) => !CHALLAN_FIELDS.includes(key)));
}
export function challanRevision(doc) {
  return { _id: doc._id, userId: doc.userId, $or: [{ workflowRevision: doc.workflowRevision || 0 }, ...(doc.workflowRevision ? [] : [{ workflowRevision: { $exists: false } }])] };
}
async function findChallan(req) {
  if (req.user.category !== 'automobile') throw httpError(403, 'This delivery workflow is available for Automobile accounts');
  const doc = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: 'delivery-challan' }));
  if (!doc) throw httpError(404, 'Delivery challan not found');
  return doc;
}

export const transitionChallan = atomicInventoryHandler(async (req, res) => {
  await assertWorkflowPermission(req, 'edit');
  const doc = await findChallan(req);
  const state = doc.extra?.deliveryStatus || 'draft';
  const status = req.body?.status;
  const allowed = { draft: ['ready'], ready: ['dispatched', 'delivered'], dispatched: ['in-transit', 'delivered'], 'in-transit': ['delivered'], delivered: [] };
  if (!allowed[state]?.includes(status)) throw httpError(409, 'Invalid delivery transition. Refresh the challan and retry.');
  assertPostableInvoice(doc);
  const timestamp = { ready: 'readyAt', dispatched: 'dispatchedAt', 'in-transit': 'inTransitAt', delivered: 'deliveredAt' }[status];
  const updated = await Invoice.findOneAndUpdate(challanRevision(doc), {
    $set: { 'extra.deliveryStatus': status, [`extra.${timestamp}`]: new Date() },
    $inc: { workflowRevision: 1 },
    $push: { lifecycleEvents: { action: `challan-${status}`, by: req.user.id, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!updated) throw httpError(409, 'This challan changed. Refresh and retry.');
  res.json({ challan: updated.toObject() });
});

// Challans do not post inventory. A linked draft uses the usual invoice posting
// workflow, which is the sole point where stock and accounting are updated.
export const convertChallan = atomicInventoryHandler(async (req, res) => {
  await assertWorkflowPermission(req, 'create');
  const doc = await findChallan(req);
  if (doc.extra?.convertedInvoiceId) {
    const invoice = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: doc.extra.convertedInvoiceId, documentType: 'invoice' }));
    if (!invoice) throw httpError(409, 'The linked bill is unavailable. Restore it before continuing.');
    return res.json({ invoice: invoice.toObject(), challan: doc.toObject() });
  }
  assertPostableInvoice(doc);
  const source = doc.toObject();
  const scope = source.businessId ? { businessId: source.businessId } : { userId: source.userId };
  const last = await Invoice.findOne({ ...scope, number: /^INV-\d+$/i }, { number: 1 }, { sort: { createdAt: -1 } });
  let sequence = last ? Number(last.number.split('-').at(-1)) + 1 : 1;
  while (await Invoice.exists({ ...scope, number: `INV-${String(sequence).padStart(4, '0')}` })) sequence++;
  const payload = {};
  for (const key of ['userId', 'businessId', 'branch', 'customer', 'shipping', 'items', 'charges', 'additionalDiscount', 'supplyType', 'notes', 'internalNotes', 'terms', 'customFields', 'tds', 'tcs']) payload[key] = source[key];
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let invoice;
  try { invoice = await Invoice.create({
    ...payload, number: `INV-${String(sequence).padStart(4, '0')}`, documentType: 'invoice',
    meta: { ...source.meta, date, dueDate: '' },
    extra: { sourceChallanId: String(doc._id), sourceChallanNumber: doc.number },
    advanceReceived: 0, paymentMethod: '', paymentSplits: [],
    ...newSaleLifecycle({ lifecycleStatus: 'draft' }, req.user.id),
  }); } catch (error) {
    if (error.code === 11000) throw httpError(409, 'A bill number was just allocated. Retry conversion.');
    throw error;
  }
  const updated = await Invoice.findOneAndUpdate(challanRevision(doc), {
    $set: { 'extra.convertedInvoiceId': String(invoice._id), 'extra.convertedInvoiceNumber': invoice.number, 'extra.convertedAt': new Date() },
    $inc: { workflowRevision: 1 },
    $push: { lifecycleEvents: { action: 'challan-converted', by: req.user.id, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!updated) throw httpError(409, 'This challan changed. Refresh and retry.');
  res.status(201).json({ invoice: invoice.toObject(), challan: updated.toObject() });
});
