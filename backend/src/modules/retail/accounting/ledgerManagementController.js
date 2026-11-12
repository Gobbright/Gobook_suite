import { LedgerAccount } from '../../../models/LedgerAccount.js';
import { LedgerGroup } from '../../../models/LedgerGroup.js';
import { AccountingVoucher } from '../../../models/AccountingVoucher.js';
import { BusinessSettings } from '../../../models/BusinessSettings.js';
import { Customer } from '../../../models/Customer.js';
import { Vendor } from '../../../models/Vendor.js';
import { AuditLog } from '../../../models/AuditLog.js';
import { branchForNewRecord, branchScopedQuery, resolveBranchScope } from '../../../utils/branchScope.js';
import { httpError } from '../../../utils/httpError.js';
import { inventoryTransaction } from '../../../services/inventoryTransaction.js';
import { buildLedgerStatement, canonicalLedgerGroup, ledgerCategory, ledgerCompanyScope, ledgerOutstanding, ledgerPayload, ledgerPeriodBounds, ledgerSnapshot, STANDARD_LEDGER_GROUPS } from '../../../services/ledgerManagement.js';

const text = (value) => String(value || '').trim();
async function accountFilter(req, extra = {}) { return ledgerCompanyScope(await branchScopedQuery(req, { model: LedgerAccount, ownerField: 'userId' }, extra), req.user.businessId); }
async function scopedLedger(req) {
  const ledger = await LedgerAccount.findOne(await accountFilter(req, { _id: req.params.id })).lean();
  if (!ledger) throw httpError(404, 'Ledger account not found');
  if (req.user.businessId && ledger.businessId && String(req.user.businessId) !== String(ledger.businessId)) throw httpError(404, 'Ledger account not found');
  return ledger;
}

async function accountingGroup(userId, group, businessId) {
  const canonical = canonicalLedgerGroup(group);
  if (STANDARD_LEDGER_GROUPS.includes(canonical)) return canonical;
  const custom = await LedgerGroup.findOne({ ...(businessId ? { businessId } : { userId }), nameKey: canonical.toLowerCase() }).lean();
  return custom?.accountingGroup || canonical;
}

async function linkedParty(ledger) {
  const kind = ledgerCategory(ledger.accountingGroup || ledger.group);
  const model = kind === 'Customer' ? Customer : kind === 'Supplier' ? Vendor : null;
  if (!model) return null;
  const matches = await model.find({ userId: ledger.userId, name: ledger.name, ...(ledger.branch ? { branch: { $in: [ledger.branch, ''] } } : {}) }).limit(2).lean();
  return matches.length === 1 ? { model, party: matches[0], kind } : null;
}

async function syncCredit(ledger, payload) {
  if (payload.creditLimit === undefined && payload.creditDays === undefined) return;
  const linked = await linkedParty(ledger);
  if (!linked) return;
  const changes = {};
  if (payload.creditLimit !== undefined) changes.creditLimit = payload.creditLimit;
  if (payload.creditDays !== undefined && linked.kind === 'Supplier') changes.creditDays = payload.creditDays;
  if (Object.keys(changes).length) await linked.model.updateOne({ _id: linked.party._id, userId: ledger.userId }, { $set: changes });
}

export async function createManagedLedger(req, res, next) {
  try {
    const account = await inventoryTransaction(async () => {
      const payload = ledgerPayload(req.body || {});
      const duplicate = await LedgerAccount.findOne({ userId: req.user.id, name: new RegExp(`^${payload.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
      if (duplicate) throw httpError(409, 'A ledger with this name already exists');
      const branch = await branchForNewRecord(req, req.body?.branch || req.user.branch || '');
      const record = { ...payload, accountingGroup: await accountingGroup(req.user.id, payload.group, req.user.businessId), userId: req.user.id, businessId: req.user.businessId, branch, opening: payload.opening || 0 };
      const at = new Date();
      record.openingHistory = [{ at, actorId: req.user.id, before: 0, after: record.opening, reason: 'Ledger created' }];
      record.auditHistory = [{ at, actorId: req.user.id, action: 'Created', reason: 'Ledger created', after: ledgerSnapshot(record) }];
      const created = await LedgerAccount.create(record);
      await syncCredit(created, payload);
      return created;
    });
    res.status(201).json({ account });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'Ledger name or code already exists') : error); }
}

export async function updateManagedLedger(req, res, next) {
  try {
    const account = await inventoryTransaction(async () => {
      const existing = await scopedLedger(req);
      const payload = ledgerPayload(req.body || {}, existing);
      if (req.body.revision !== undefined && Number(req.body.revision) !== (existing.revision || 1)) throw httpError(409, 'Ledger has changed. Reload before saving');
      const history = await AccountingVoucher.exists({ userId: existing.userId, 'lines.ledgerName': existing.name });
      if (payload.name && payload.name !== existing.name && history) throw httpError(409, 'A ledger with accounting history cannot be renamed. Deactivate it or create a new ledger.');
      const openingChanged = payload.opening !== undefined && payload.opening !== Number(existing.opening || 0);
      if (openingChanged && await AccountingVoucher.exists({ userId: existing.userId, status: 'Posted', 'lines.ledgerName': existing.name })) throw httpError(409, 'Opening balances with posted history cannot be overwritten. Post an Opening Balance adjustment voucher instead');
      if (openingChanged && !text(req.body.changeReason)) throw httpError(400, 'An opening balance change reason is required');
      if (payload.name && payload.name !== existing.name) {
        const duplicate = await LedgerAccount.findOne({ userId: existing.userId, _id: { $ne: existing._id }, name: new RegExp(`^${payload.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
        if (duplicate) throw httpError(409, 'A ledger with this name already exists');
      }
      if (payload.group !== undefined) payload.accountingGroup = await accountingGroup(existing.userId, payload.group, existing.businessId || req.user.businessId);
      if (req.body.branch !== undefined) payload.branch = await branchForNewRecord(req, req.body.branch);
      const at = new Date();
      const reason = text(req.body.changeReason).slice(0, 500) || (payload.active !== undefined ? payload.active ? 'Ledger activated' : 'Ledger deactivated' : 'Ledger details updated');
      const changes = { $set: { ...payload, revision: (existing.revision || 1) + 1 }, $inc: { billAllocationVersion: 1 }, $push: { auditHistory: { at, actorId: req.user.id, action: payload.active !== undefined ? payload.active ? 'Activated' : 'Deactivated' : 'Updated', reason, before: ledgerSnapshot(existing), after: ledgerSnapshot({ ...existing, ...payload }) } } };
      if (payload.code === '') { delete changes.$set.codeKey; changes.$unset = { codeKey: 1 }; }
      if (openingChanged) changes.$push.openingHistory = { at, actorId: req.user.id, before: existing.opening || 0, after: payload.opening, reason };
      const updated = await LedgerAccount.findOneAndUpdate(await accountFilter(req, { _id: existing._id }), changes, { new: true, runValidators: true }).lean();
      if (!updated) throw httpError(404, 'Ledger account not found');
      await syncCredit(updated, payload);
      return updated;
    });
    res.json({ account });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'Ledger name or code already exists') : error); }
}

export async function ledgerHistoryVouchers(req, ledger) {
  const filter = await branchScopedQuery({ ...req, query: { ...req.query, branch: '' } }, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted', 'lines.ledgerName': ledger.name });
  filter.userId = ledger.userId;
  if (req.user.businessId) filter.businessId = req.user.businessId;
  const branch = (await resolveBranchScope(req)).branch;
  if (branch) filter.branch = branch;
  const vouchers = await AccountingVoucher.find(filter).sort({ date: 1, createdAt: 1, _id: 1 }).lean();
  return branch ? vouchers.filter((voucher) => voucher.branch === branch) : vouchers;
}

export async function getManagedLedger(req, res, next) {
  try {
    const ledger = await scopedLedger({ ...req, query: { ...req.query, branch: '' } });
    const [linked, vouchers, settings, logs] = await Promise.all([
      linkedParty(ledger), ledgerHistoryVouchers(req, ledger), BusinessSettings.findOne({ userId: ledger.userId }).lean(),
      AuditLog.find({ documentId: ledger._id, modelName: 'LedgerAccount', ...(req.user.businessId ? { businessId: req.user.businessId } : {}) }).sort({ performedAt: -1 }).lean(),
    ]);
    const bounds = { ...ledgerPeriodBounds(req.query, settings?.fyStart), branch: (await resolveBranchScope(req)).branch };
    const profile = { ...ledger };
    for (const key of ['gstin', 'contact', 'phone', 'email', 'address']) profile[key] ||= linked?.party[key] || '';
    profile.creditLimit = ledger.creditLimit ?? linked?.party.creditLimit ?? 0;
    profile.creditDays = ledger.creditDays ?? linked?.party.creditDays ?? null;
    const statement = buildLedgerStatement(ledger, vouchers, bounds);
    const exposure = ledgerCategory(ledger.accountingGroup || ledger.group) === 'Supplier' ? Math.max(0, -statement.totals.closing) : Math.max(0, statement.totals.closing);
    res.json({
      account: profile, totals: statement.totals, outstanding: ledgerOutstanding(vouchers, ledger.name, bounds.to, profile.creditDays),
      credit: { limit: profile.creditLimit, days: profile.creditDays, exposure, available: profile.creditLimit > 0 ? Math.max(0, profile.creditLimit - exposure) : null, exceeded: profile.creditLimit > 0 && exposure > profile.creditLimit },
      openingHistory: ledger.openingHistory || [], openingAdjustments: vouchers.filter((voucher) => voucher.voucherType === 'Opening Balance').map((voucher) => ({ id: voucher._id, date: voucher.date, number: voucher.voucherNo, narration: voucher.narration })),
      auditHistory: ledger.auditHistory || [], legacyAudit: logs, hasHistory: vouchers.length > 0, linkedParty: linked ? { id: linked.party._id, kind: linked.kind } : null,
      financialYears: [...new Set(vouchers.map((voucher) => voucher.financialYear).filter(Boolean))].sort().reverse(), fyStart: settings?.fyStart || '01 April',
    });
  } catch (error) { next(error); }
}

export async function listLedgerGroups(req, res, next) {
  try {
    const groups = await LedgerGroup.find(req.user.businessId ? { businessId: req.user.businessId } : { userId: req.user.id }).sort({ name: 1 }).lean();
    res.json({ groups, standardGroups: STANDARD_LEDGER_GROUPS });
  } catch (error) { next(error); }
}

export async function createLedgerGroup(req, res, next) {
  try {
    const name = text(req.body.name), parent = canonicalLedgerGroup(text(req.body.parent));
    if (!name || name.length > 100 || !parent || name.toLowerCase() === parent.toLowerCase()) throw httpError(400, 'Enter a group name and a different parent group');
    if ([...STANDARD_LEDGER_GROUPS, 'Customer', 'Customers', 'Supplier', 'Suppliers', 'Assets', 'Liabilities', 'Income', 'Expenses'].some((group) => group.toLowerCase() === name.toLowerCase())) throw httpError(409, 'This account group already exists');
    const parentRecord = STANDARD_LEDGER_GROUPS.includes(parent) ? { accountingGroup: parent } : await LedgerGroup.findOne({ ...(req.user.businessId ? { businessId: req.user.businessId } : { userId: req.user.id }), nameKey: parent.toLowerCase() }).lean();
    if (!parentRecord) throw httpError(400, 'Select an existing parent account group');
    const group = await LedgerGroup.create({ userId: req.user.id, businessId: req.user.businessId, name, nameKey: name.toLowerCase(), parent, accountingGroup: parentRecord.accountingGroup, category: ledgerCategory(parentRecord.accountingGroup), createdBy: req.user.id });
    res.status(201).json({ group });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'This account group already exists') : error); }
}
