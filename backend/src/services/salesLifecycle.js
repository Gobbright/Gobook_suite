import { httpError } from '../utils/httpError.js';

export const SALES_TYPES = ['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice'];
export const isSalesInvoice = (doc) => SALES_TYPES.includes(doc.documentType || 'invoice');
export const invoiceState = (doc) => doc.lifecycleStatus || 'posted';
export const dispatchState = (doc) => doc.fulfillmentStatus || 'unknown';
export const returnState = (doc) => doc.returnStatus || 'completed';
export const isFinanciallyActive = (doc) => !['draft', 'cancelled'].includes(doc.lifecycleStatus) && (doc.documentType !== 'sales-return' || returnState(doc) === 'completed');
export const ACTIVE_FINANCIAL_FILTER = { lifecycleStatus: { $nin: ['draft', 'cancelled'] }, returnStatus: { $nin: ['requested', 'received'] } };

export const WORKFLOW_FIELDS = ['lifecycleStatus', 'fulfillmentStatus', 'returnStatus', 'postedAt', 'dispatchedAt', 'cancelledAt', 'cancelReason', 'receivedAt', 'inspectedAt', 'inspectionNotes', 'lifecycleEvents', 'workflowRevision'];

export function stripWorkflowFields(body = {}) {
  const copy = { ...body };
  for (const key of WORKFLOW_FIELDS) delete copy[key];
  if (Array.isArray(copy.items)) copy.items = copy.items.map(({ restockQty, ...item }) => item);
  return copy;
}

export function newSaleLifecycle(body, userId) {
  const state = body.lifecycleStatus ?? 'posted';
  if (!['draft', 'posted'].includes(state)) throw httpError(400, 'New invoices must be drafts or posted invoices');
  return { lifecycleStatus: state, fulfillmentStatus: 'not-dispatched', ...(state === 'posted' ? { postedAt: new Date() } : {}), lifecycleEvents: [{ action: state === 'draft' ? 'draft-created' : 'posted', by: userId, at: new Date() }] };
}

export function assertInvoiceTransition(doc, action, reason = '') {
  if (!isSalesInvoice(doc)) throw httpError(400, 'This action is only available for sales invoices');
  const state = invoiceState(doc);
  const dispatch = dispatchState(doc);
  if (action === 'post' && state !== 'draft') throw httpError(409, 'Only a draft invoice can be posted');
  if (['dispatch', 'confirm-undispatched', 'cancel'].includes(action) && state !== 'posted') throw httpError(409, 'Only a posted invoice supports this action');
  if (action === 'dispatch' && dispatch === 'dispatched') throw httpError(409, 'Invoice is already marked dispatched');
  if (action === 'confirm-undispatched' && dispatch !== 'unknown') throw httpError(409, 'Dispatch status has already been recorded');
  if (action === 'cancel' && dispatch !== 'not-dispatched') throw httpError(409, dispatch === 'dispatched' ? 'Goods have been dispatched. Use a sales return after the goods are received.' : 'Confirm that goods were not dispatched before cancelling this legacy invoice.');
  if (['cancel', 'confirm-undispatched'].includes(action) && !String(reason).trim()) throw httpError(400, 'A reason is required');
  if (!['post', 'dispatch', 'confirm-undispatched', 'cancel'].includes(action)) throw httpError(400, 'Invalid invoice action');
}

export function assertPostableInvoice(doc) {
  if (!String(doc.number || '').trim() || !String(doc.customer?.name || '').trim()) throw httpError(400, 'Invoice number and customer are required before posting');
  if (!doc.items?.length) throw httpError(400, 'Add invoice items before posting');
  for (const item of doc.items) {
    if (!String(item.description || '').trim() || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 || !Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) throw httpError(400, 'Every invoice line needs a description, positive quantity, and valid rate');
  }
}

export function approvedRestockItems(note, input) {
  if (returnState(note) !== 'received') throw httpError(409, 'Receive the returned goods before inspecting them');
  if (!Array.isArray(input) || input.length !== note.items.length) throw httpError(400, 'Record a restocking decision for every return line');
  const decisions = new Map();
  for (const item of input) {
    const id = String(item.lineId || '');
    const qty = Number(item.restockQty);
    if (!id || decisions.has(id) || item.restockQty === '' || item.restockQty == null || !Number.isFinite(qty) || qty < 0) throw httpError(400, 'Invalid or duplicate inspection line');
    decisions.set(id, qty);
  }
  return note.items.map((item) => {
    const qty = decisions.get(String(item._id));
    if (qty === undefined || qty > Number(item.qty) || item.itemType === 'Service' && qty !== 0) throw httpError(400, 'Approved stock quantity must be between zero and the returned quantity; services cannot be restocked');
    return { ...(item.toObject?.() || item), restockQty: qty };
  });
}
