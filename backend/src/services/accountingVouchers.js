import { AccountingVoucher, VOUCHER_TYPES } from '../models/AccountingVoucher.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { LedgerAccount } from '../models/LedgerAccount.js';
import { VoucherSequence } from '../models/VoucherSequence.js';
import { findStoredFile, toObjectId } from './gridfsStorage.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { billBalances, normalizeVoucherLines, voucherFinancialYear, voucherMoney as money, voucherTotals } from './voucherRules.js';
import { httpError } from '../utils/httpError.js';
import { isBusinessSuperAdmin } from '../utils/tenantScope.js';
import { createHash } from 'node:crypto';
import { canonicalLedgerGroup } from './ledgerManagement.js';

const PREFIXES = { Sales: 'SAL', Purchase: 'PUR', 'Sales Return': 'SRN', 'Purchase Return': 'PRN', Receipt: 'RCT', Payment: 'PAY', Contra: 'CON', Journal: 'JRN', 'Debit Note': 'DBN', 'Credit Note': 'CRN', 'Stock Journal': 'STJ', 'GST Adjustment': 'GST', 'Opening Balance': 'OB' };
const text = (value) => String(value ?? '').trim();
const plain = (document) => document?.toObject ? document.toObject() : document;

function snapshot(voucher) {
  const data = { ...plain(voucher) };
  delete data.auditHistory;
  delete data.bankReconciliations;
  return data;
}

function audit(voucher, action, actorId, reason = '', before) {
  voucher.auditHistory ||= [];
  voucher.auditHistory.push({ action, actorId, at: new Date(), reason, before, after: snapshot(voucher) });
}

async function yearFor(userId, date) {
  const settings = await BusinessSettings.findOne({ userId }).lean();
  return voucherFinancialYear(date, settings?.fyStart);
}

function scope(user, extra = {}) {
  return { userId: user.id, ...(user.businessId ? { businessId: user.businessId } : {}), ...(user.branch && !user.isSuperAdmin && user.accountType !== 'owner' ? { branch: user.branch } : {}), ...extra };
}

async function existingVoucher(id, user) {
  const voucher = await AccountingVoucher.findOne(scope(user, { _id: id }));
  if (!voucher) throw httpError(404, 'Voucher not found');
  return voucher;
}

function requirePostedControl(user) {
  if (!isBusinessSuperAdmin(user) && !(user.permissions?.modules?.includes('accounting') && user.permissions?.actions?.edit === true)) throw httpError(403, 'Only a company owner or an authorized accountant can alter, cancel or reverse posted vouchers');
}

async function ensureLedger(user, line, allowCreate) {
  let ledger;
  if (allowCreate) {
    ledger = await LedgerAccount.findOneAndUpdate(
      { userId: user.id, name: line.ledgerName },
      { $setOnInsert: { userId: user.id, businessId: user.businessId, branch: user.branch || '', name: line.ledgerName, group: line.ledgerGroup || 'Indirect Expenses', opening: 0, debit: 0, credit: 0, color: '#2563eb' } },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  } else ledger = await LedgerAccount.findOne({ userId: user.id, name: line.ledgerName }).lean();
  if (!ledger || ledger.active === false) throw httpError(400, `Select an active ledger account: ${line.ledgerName}`);
  if (user.businessId && ledger.businessId && String(user.businessId) !== String(ledger.businessId)) throw httpError(403, 'Ledger belongs to another company');
  if (line.ledgerId && String(line.ledgerId) !== String(ledger._id)) throw httpError(400, 'Ledger ID does not match the selected ledger');
  line.ledgerId = ledger._id;
  line.ledgerGroup = canonicalLedgerGroup(ledger.accountingGroup || ledger.group);
}

async function applyLines(userId, lines, multiplier = 1) {
  for (const line of lines) await LedgerAccount.updateOne({ userId, name: line.ledgerName }, { $inc: { [line.side]: money(line.amount * multiplier) } });
}

export async function getNextVoucherNo(userId, voucherType, date = new Date().toISOString().slice(0, 10), reserve = false) {
  if (!VOUCHER_TYPES.includes(voucherType)) throw httpError(400, 'Invalid voucher type');
  const financialYear = await yearFor(userId, date);
  const prefix = `${PREFIXES[voucherType]}-${financialYear.split('-').map((part) => part.slice(-2)).join('-')}-`;
  const filter = { userId, financialYear, voucherType };
  const last = await AccountingVoucher.findOne({ ...filter, voucherNo: new RegExp(`^${prefix}\\d+$`) }, { voucherNo: 1 }, { sort: { voucherNo: -1 } }).lean();
  const previous = Number(last?.voucherNo?.slice(prefix.length)) || 0;
  if (!reserve) {
    const sequence = await VoucherSequence.findOne(filter).lean();
    return `${prefix}${String(Math.max(previous, sequence?.value || 0) + 1).padStart(5, '0')}`;
  }
  await VoucherSequence.updateOne(filter, { $max: { value: previous } }, { upsert: true });
  const sequence = await VoucherSequence.findOneAndUpdate(filter, { $inc: { value: 1 } }, { new: true });
  return `${prefix}${String(sequence.value).padStart(5, '0')}`;
}

export async function getVoucherBillReferences(user, ledgerName, financialYear, excludeId, date) {
  const filter = scope(user, { status: 'Posted', 'lines.ledgerName': ledgerName });
  if (financialYear || date) filter.financialYear = financialYear || await yearFor(user.id, date);
  if (excludeId) filter._id = { $ne: excludeId };
  return billBalances(await AccountingVoucher.find(filter).lean(), ledgerName);
}

async function validateAllocations(payload, user, excludeId) {
  const pending = new Map();
  for (const line of payload.lines) {
    if (!line.allocations.length) continue;
    await LedgerAccount.updateOne({ userId: user.id, name: line.ledgerName }, { $inc: { billAllocationVersion: 1 } });
    if (!pending.has(line.ledgerName)) pending.set(line.ledgerName, new Map((await getVoucherBillReferences(user, line.ledgerName, payload.financialYear, excludeId)).map((bill) => [bill.reference, bill.balance])));
    const balances = pending.get(line.ledgerName);
    for (const allocation of line.allocations) {
      if (allocation.type === 'On Account') continue;
      const outstanding = balances.get(allocation.reference);
      const signed = line.side === 'debit' ? allocation.amount : -allocation.amount;
      if (allocation.type === 'Against Reference') {
        if (!outstanding || Math.sign(outstanding) === Math.sign(signed) || money(Math.abs(outstanding)) < allocation.amount) throw httpError(409, `Bill ${allocation.reference} has insufficient outstanding balance or the wrong debit/credit side`);
      } else if (balances.has(allocation.reference)) throw httpError(409, `Bill reference ${allocation.reference} already exists for ${line.ledgerName}`);
      balances.set(allocation.reference, money((outstanding || 0) + signed));
    }
  }
}

async function protectSettledReferences(voucher, user) {
  for (const line of voucher.lines) {
    const originating = (line.allocations || []).filter((allocation) => ['New Reference', 'Advance'].includes(allocation.type));
    if (!originating.length && !(voucher.sourceType && ['Sales', 'Purchase'].includes(voucher.voucherType) && /sundry debtors|sundry creditors/i.test(line.ledgerGroup))) continue;
    const references = new Set(originating.map((allocation) => allocation.reference));
    if (!references.size && line.billRef) references.add(line.billRef);
    if (!references.size) continue;
    await LedgerAccount.updateOne({ userId: user.id, name: line.ledgerName }, { $inc: { billAllocationVersion: 1 } });
    const others = await AccountingVoucher.find(scope(user, { _id: { $ne: voucher._id }, financialYear: voucher.financialYear, status: 'Posted', 'lines.ledgerName': line.ledgerName })).lean();
    const settlements = new Map([...references].map((reference) => [reference, 0]));
    for (const other of others) {
      if (voucher.sourceType && other.sourceType) continue;
      for (const otherLine of other.lines) {
        if (otherLine.ledgerName !== line.ledgerName) continue;
        const allocations = otherLine.allocations?.length ? otherLine.allocations : [{ reference: otherLine.billRef, amount: otherLine.amount }];
        for (const allocation of allocations) {
          if (settlements.has(allocation.reference)) settlements.set(allocation.reference, money(settlements.get(allocation.reference) + allocation.amount * (otherLine.side === 'debit' ? 1 : -1)));
        }
      }
    }
    const settled = [...settlements.values()].some((amount) => amount !== 0);
    if (settled) throw httpError(409, 'This voucher has settled bill references. Reverse or cancel the settlements first');
  }
}

async function attachmentsFor(attachments, user) {
  if (!Array.isArray(attachments) || attachments.length > 10) throw httpError(400, 'Attach up to ten files');
  const result = [];
  for (const attachment of attachments) {
    const file = await findStoredFile(attachment.id, { 'metadata.kind': 'module-record-file', 'metadata.userId': toObjectId(user.id), 'metadata.moduleKey': 'accounting-vouchers' });
    if (!file) throw httpError(400, 'Voucher attachment was not found or belongs to another account');
    result.push({ id: file._id, filename: file.filename, contentType: file.contentType, size: file.length });
  }
  return result;
}

export async function normalizeVoucherPayload(body, user, existing = null, options = {}) {
  const merged = { ...(existing ? snapshot(existing) : {}), ...body };
  const lines = normalizeVoucherLines(merged.lines);
  const date = text(merged.date || new Date().toISOString().slice(0, 10));
  const financialYear = await yearFor(user.id, date);
  if (body.financialYear && body.financialYear !== financialYear) throw httpError(400, 'Voucher date falls outside the selected financial year');
  const voucherType = merged.voucherType || 'Journal';
  if (!VOUCHER_TYPES.includes(voucherType)) throw httpError(400, 'Invalid voucher type');
  const status = merged.status || 'Posted';
  if (!['Draft', 'Posted'].includes(status)) throw httpError(400, 'Use the cancellation action to cancel a voucher');
  const entryMode = merged.entryMode || 'manual';
  if (!['manual', 'bill'].includes(entryMode)) throw httpError(400, 'Invalid voucher entry mode');
  const numberingMode = merged.numberingMode || (merged.voucherNo ? 'manual' : 'auto');
  if (!['auto', 'manual'].includes(numberingMode)) throw httpError(400, 'Invalid voucher numbering mode');
  if (numberingMode === 'manual' && !text(merged.voucherNo)) throw httpError(400, 'Manual voucher number is required');
  if (!options.allowSourceMutation && (body.sourceId || body.sourceType || body.reversalOf || body.reversedBy)) throw httpError(400, 'Source references can only be assigned by the accounting engine');
  const totals = voucherTotals(lines);
  if ((status === 'Posted' || options.requireBalancedDraft) && totals.debitTotal !== totals.creditTotal) throw httpError(400, 'Voucher debit and credit totals must match');
  if (new Set(lines.map((line) => line.ledgerName)).size < 2) throw httpError(400, 'Use at least two different ledger accounts');
  if (status === 'Posted' && entryMode === 'bill' && !text(merged.referenceNo) && !lines.some((line) => line.billRef || line.allocations.length)) throw httpError(400, 'A bill reference is required for an Against Bill voucher');
  for (const line of lines) await ensureLedger(user, line, Boolean(options.allowSourceMutation));
  const payload = {
    userId: existing?.userId || user.id, businessId: existing?.businessId || user.businessId,
    branch: existing?.branch ?? (user.branch || text(body.branch)), voucherType, voucherNo: text(merged.voucherNo), financialYear, date,
    partyName: text(merged.partyName), referenceNo: text(merged.referenceNo), entryMode, numberingMode,
    bookGroup: text(merged.bookGroup) || 'General', narration: text(merged.narration), status,
    sourceType: options.allowSourceMutation ? text(merged.sourceType) : '', sourceId: options.allowSourceMutation ? merged.sourceId : undefined,
    sourceNumber: options.allowSourceMutation ? text(merged.sourceNumber) : '', ...totals, lines,
    attachments: await attachmentsFor(merged.attachments || [], user), updatedBy: user.id,
    postedAt: status === 'Posted' ? existing?.postedAt || new Date() : undefined,
  };
  if (status === 'Posted' && !options.allowSourceMutation && !options.reversal) await validateAllocations(payload, user, existing?._id);
  return payload;
}

export async function createAccountingVoucher(body, user, options = {}) {
  const requestKey = text(body.requestKey);
  const requestHash = requestKey ? createHash('sha256').update(JSON.stringify(body)).digest('hex') : '';
  function existingRequest(previous) {
    if (previous.requestHash !== requestHash) throw httpError(409, 'This save request was already used. Reload the saved voucher before changing it');
    return previous;
  }
  if (requestKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) throw httpError(400, 'Invalid voucher request key');
  if (requestKey) {
    const previous = await AccountingVoucher.findOne(scope(user, { requestKey }));
    if (previous) return existingRequest(previous);
  }
  try { return await inventoryTransaction(async () => {
    const payload = await normalizeVoucherPayload(body, user, null, options);
    if (payload.numberingMode === 'auto' || !payload.voucherNo) payload.voucherNo = await getNextVoucherNo(user.id, payload.voucherType, payload.date, true);
    if (options.postToLedger !== false && payload.status === 'Posted') await applyLines(user.id, payload.lines);
    const voucher = { ...payload, ...(requestKey ? { requestKey, requestHash } : {}), ...(options.recurringJournalId ? { recurringJournalId: options.recurringJournalId } : {}), createdBy: user.id, revision: 1, auditHistory: [] };
    audit(voucher, payload.status === 'Draft' ? 'Draft created' : 'Posted', user.id);
    return AccountingVoucher.create(voucher);
  }); } catch (error) {
    if (error.code === 11000 && requestKey) {
      const previous = await AccountingVoucher.findOne(scope(user, { requestKey }));
      if (previous) return existingRequest(previous);
    }
    throw error;
  }
}

export async function updateAccountingVoucher(id, body, user, options = {}) {
  return inventoryTransaction(async () => {
    const existing = await existingVoucher(id, user);
    if (existing.reversedBy) throw httpError(409, 'A reversed voucher cannot be altered');
    if (existing.reversalOf) throw httpError(409, 'A reversal voucher cannot be altered. Reverse it to create a traceable correction');
    if (existing.sourceType && !options.allowSourceMutation) throw httpError(409, 'Source-linked vouchers must be updated from their original document');
    if (!options.allowSourceMutation && existing.status !== 'Draft') {
      if (existing.voucherType === 'Journal' && existing.status === 'Posted') throw httpError(409, 'Posted journals are immutable. Reverse this journal and create a correction');
      requirePostedControl(user);
      if (existing.status === 'Cancelled') throw httpError(409, 'A cancelled voucher cannot be edited');
      if (!text(body.alterationReason)) throw httpError(409, 'Posted voucher alteration requires a reason');
      if (body.status && body.status !== 'Posted') throw httpError(409, 'A posted voucher cannot be changed to a draft');
    }
    if (body.revision !== undefined && body.revision !== (existing.revision || 1)) throw httpError(409, 'This voucher has changed. Reload it before saving');
    const before = snapshot(existing);
    const payload = await normalizeVoucherPayload(body, user, existing, options);
    const financialSignature = (value) => JSON.stringify({ date: value.date, lines: value.lines.map((line) => ({ ledgerName: line.ledgerName, side: line.side, amount: line.amount, billRef: line.billRef, allocations: plain(line).allocations || [] })) });
    if (existing.status === 'Posted' && financialSignature(existing) !== financialSignature(payload)) await protectSettledReferences(existing, user);
    if (options.postToLedger !== false && existing.status === 'Posted') await applyLines(existing.userId, existing.lines, -1);
    if (options.postToLedger !== false && payload.status === 'Posted') await applyLines(existing.userId, payload.lines);
    Object.assign(existing, payload, { revision: (existing.revision || 1) + 1, bankReconciliations: [], cancelledAt: undefined });
    audit(existing, options.allowSourceMutation ? 'Source document updated' : before.status === 'Draft' && payload.status === 'Posted' ? 'Posted' : before.status === 'Posted' ? 'Altered' : 'Draft updated', user.id, text(body.alterationReason), before);
    return existing.save();
  });
}

export async function deleteAccountingVoucher(id, user) {
  return inventoryTransaction(async () => {
    const voucher = await existingVoucher(id, user);
    if (voucher.status !== 'Draft' || voucher.sourceType) throw httpError(409, 'Only manual drafts can be deleted. Cancel or reverse posted vouchers with a reason');
    await voucher.deleteOne();
    return voucher;
  });
}

export async function cancelAccountingVoucher(id, body, user, options = {}) {
  return inventoryTransaction(async () => {
    const voucher = await existingVoucher(id, user);
    if (voucher.sourceType && !options.allowSourceMutation) throw httpError(409, 'Cancel this voucher from its source document');
    if (voucher.status === 'Cancelled' || voucher.reversedBy) throw httpError(409, 'Voucher is already cancelled or reversed');
    if (voucher.reversalOf) throw httpError(409, 'A reversal voucher cannot be cancelled. Reverse it to create a traceable correction');
    if (!text(body.reason)) throw httpError(400, 'A cancellation reason is required');
    if (voucher.status === 'Posted' && !options.allowSourceMutation) requirePostedControl(user);
    const before = snapshot(voucher);
    if (voucher.status === 'Posted') await protectSettledReferences(voucher, user);
    if (options.postToLedger !== false && voucher.status === 'Posted') await applyLines(voucher.userId, voucher.lines, -1);
    voucher.status = 'Cancelled';
    voucher.cancelledAt = new Date();
    voucher.updatedBy = user.id;
    voucher.revision = (voucher.revision || 1) + 1;
    voucher.bankReconciliations = [];
    audit(voucher, 'Cancelled', user.id, text(body.reason), before);
    return voucher.save();
  });
}

export async function reverseAccountingVoucher(id, body, user) {
  return inventoryTransaction(async () => {
    const voucher = await existingVoucher(id, user);
    if (voucher.sourceType) throw httpError(409, 'Reverse the source document to preserve inventory and billing consistency');
    if (voucher.status !== 'Posted' || voucher.reversedBy) throw httpError(409, 'Only an unreversed posted voucher can be reversed');
    if (!text(body.reason)) throw httpError(400, 'A reversal reason is required');
    requirePostedControl(user);
    const before = snapshot(voucher);
    await protectSettledReferences(voucher, user);
    const reversal = await createAccountingVoucher({
      voucherType: 'Journal', date: body.date || voucher.date, numberingMode: 'auto', status: 'Posted', referenceNo: voucher.voucherNo,
      narration: `Reversal of ${voucher.voucherNo}: ${text(body.reason)}`,
      lines: voucher.lines.map((line) => ({ ...plain(line), ledgerId: undefined, side: line.side === 'debit' ? 'credit' : 'debit' })),
    }, user, { reversal: true });
    reversal.reversalOf = voucher._id;
    audit(reversal, 'Reversal linked', user.id, text(body.reason));
    await reversal.save();
    voucher.reversedBy = reversal._id;
    voucher.revision = (voucher.revision || 1) + 1;
    audit(voucher, 'Reversed', user.id, text(body.reason), before);
    await voucher.save();
    return reversal;
  });
}

export async function reverseSourceVoucher({ userId, sourceType, sourceId, postToLedger = true }) {
  const voucher = await AccountingVoucher.findOne({ userId, sourceType, sourceId });
  if (!voucher || voucher.status === 'Cancelled') return voucher;
  return cancelAccountingVoucher(voucher._id, { reason: 'Source document changed or cancelled' }, { id: userId }, { allowSourceMutation: true, postToLedger });
}

export async function upsertSourceVoucher(body, user, options = {}) {
  if (!body.sourceType || !body.sourceId) throw httpError(400, 'Source voucher requires sourceType and sourceId');
  const existing = await AccountingVoucher.findOne({ userId: user.id, sourceType: body.sourceType, sourceId: body.sourceId });
  const sourceOptions = { ...options, allowSourceMutation: true };
  if (existing) return updateAccountingVoucher(existing._id, { ...body, numberingMode: 'manual' }, user, sourceOptions);
  return createAccountingVoucher({ ...body, numberingMode: 'manual' }, user, sourceOptions);
}

export { VOUCHER_TYPES };
