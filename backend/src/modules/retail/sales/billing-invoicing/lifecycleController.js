import { assertCreditCapacity } from '../../../../services/financialCredits.js';
import { OnlineOrder } from '../../../../models/OnlineOrder.js';
import { Invoice } from '../../../../models/Invoice.js';
import { AppUser } from '../../../../models/AppUser.js';
import { Payment } from '../../../../models/Payment.js';
import { atomicInventoryHandler } from '../../../../services/inventoryTransaction.js';
import { postInventoryForDocument, cancelInventoryForDocument } from '../../../../services/inventoryMovements.js';
import { postInvoiceAccounting, postSalesReturnAccounting, reverseAccountingPosting } from '../../../../services/accountingPostings.js';
import { assertInvoiceTransition, assertPostableInvoice, approvedRestockItems, returnState } from '../../../../services/salesLifecycle.js';
import { branchScopedQuery } from '../../../../utils/branchScope.js';
import { httpError } from '../../../../utils/httpError.js';

export async function assertWorkflowPermission(req, action = 'edit') {
  const actor = await AppUser.findById(req.user.id).select('accountType role permissions status').lean();
  if (!actor || actor.status !== 'Active') throw httpError(403, 'An active account is required');
  if (actor.accountType === 'owner' || actor.role === 'Super Admin' || actor.permissions?.actions?.[action] === true) return;
  throw httpError(403, 'You do not have permission to perform this action');
}

async function recordTransition(doc, req, fields, action, reason = '') {
  const updated = await Invoice.findOneAndUpdate({ _id: doc._id, userId: doc.userId, $or: [{ workflowRevision: doc.workflowRevision || 0 }, ...(doc.workflowRevision ? [] : [{ workflowRevision: { $exists: false } }])] }, {
    $set: fields, $inc: { workflowRevision: 1 },
    $push: { lifecycleEvents: { action, reason: String(reason).trim().slice(0, 1000), by: req.user.id, at: new Date() } },
  }, { new: true, runValidators: true });
  if (!updated) throw httpError(409, 'This document changed. Refresh and retry.');
  return updated;
}

export const transitionInvoice = atomicInventoryHandler(async (req, res) => {
  const { action, reason = '' } = req.body || {};
  await assertWorkflowPermission(req, action === 'cancel' ? 'delete' : 'edit');
  const doc = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id }));
  if (!doc) throw httpError(404, 'Invoice not found');
  assertInvoiceTransition(doc, action, reason);
  let fields;
  if (action === 'post') {
    assertPostableInvoice(doc);
    fields = { lifecycleStatus: 'posted', postedAt: new Date(), fulfillmentStatus: 'not-dispatched' };
    const posted = new Invoice({ ...doc.toObject(), ...fields });
    await postInventoryForDocument(posted, String(doc.userId));
    await postInvoiceAccounting(posted, { ...req.user, id: String(doc.userId) });
  } else if (action === 'dispatch') {
    fields = { fulfillmentStatus: 'dispatched', dispatchedAt: new Date() };
  } else if (action === 'confirm-undispatched') {
    fields = { fulfillmentStatus: 'not-dispatched' };
  } else {
    if (Number(doc.advanceReceived) > 0 || await Payment.exists({ invoiceId: doc._id, userId: doc.userId })) throw httpError(409, 'This invoice has payments. Resolve the payment or refund before cancellation.');
    if (await Invoice.exists({ userId: doc.userId, documentType: { $in: ['sales-return', 'credit-note'] }, $or: [{ 'extra.originalSalesId': String(doc._id) }, { 'extra.originalInvoiceNo': doc.number }] })) throw httpError(409, 'This invoice has a return or credit adjustment and cannot be cancelled.');
    await cancelInventoryForDocument(doc, String(doc.userId));
    if (doc.extra?.stockHandledByOnlineOrder) {
      const order = await OnlineOrder.updateOne({ _id: doc.extra.onlineOrderId, userId: doc.userId, invoiceId: doc._id }, { $set: { status: 'Cancelled', cancelledAt: new Date(), stockReducedAt: null } });
      if (order.matchedCount !== 1) throw httpError(409, 'The original online order changed. Refresh and retry.');
    }
    await reverseAccountingPosting({ userId: String(doc.userId), sourceType: 'invoice', sourceId: doc._id });
    fields = { lifecycleStatus: 'cancelled', cancelledAt: new Date(), cancelReason: String(reason).trim().slice(0, 1000) };
  }
  const invoice = await recordTransition(doc, req, fields, action, reason);
  res.json({ invoice: invoice.toObject() });
});

export const transitionSalesReturn = atomicInventoryHandler(async (req, res) => {
  const { action, reason = '', items } = req.body || {};
  await assertWorkflowPermission(req);
  const note = await Invoice.findOne(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, { _id: req.params.id, documentType: 'sales-return' }));
  if (!note) throw httpError(404, 'Sales return not found');
  let fields;
  if (action === 'receive') {
    if (returnState(note) !== 'requested') throw httpError(409, 'Only a requested return can be marked received');
    fields = { returnStatus: 'received', receivedAt: new Date() };
  } else if (action === 'approve') {
    if (!String(reason).trim()) throw httpError(400, 'Record the inspection outcome before approving');
    fields = { returnStatus: 'completed', inspectedAt: new Date(), inspectionNotes: String(reason).trim().slice(0, 1000), items: approvedRestockItems(note, items) };
    const source = await Invoice.findOne({ _id: note.extra.originalSalesId, userId: note.userId }).lean();
    if (!source || source.lifecycleStatus === 'cancelled') throw httpError(409, 'The original sales invoice is no longer active');
    await assertCreditCapacity(source, note, { excludeId: note._id });
    const approved = new Invoice({ ...note.toObject(), ...fields });
    await postInventoryForDocument(approved, String(note.userId));
    await postSalesReturnAccounting(approved, { ...req.user, id: String(note.userId) });
  } else throw httpError(400, 'Invalid return action');
  const updated = await recordTransition(note, req, fields, action === 'receive' ? 'goods-received' : 'inspection-approved', reason);
  res.json({ note: updated.toObject() });
});
