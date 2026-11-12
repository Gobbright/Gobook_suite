import { AccountingVoucher } from '../../../models/AccountingVoucher.js';
import {
  createAccountingVoucher,
  deleteAccountingVoucher,
  getNextVoucherNo,
  updateAccountingVoucher,
  VOUCHER_TYPES,
  cancelAccountingVoucher,
  reverseAccountingVoucher,
  getVoucherBillReferences,
} from '../../../services/accountingVouchers.js';
import { branchScopedQuery } from '../../../utils/branchScope.js';
import { httpError } from '../../../utils/httpError.js';
import { BusinessSettings } from '../../../models/BusinessSettings.js';
import { voucherFinancialYear } from '../../../services/voucherRules.js';

export function listVoucherTypes(_req, res) {
  res.json({ types: VOUCHER_TYPES });
}

export async function getNextVoucherNumber(req, res, next) {
  try {
    const { voucherType = 'Journal', date } = req.query;
    const voucherNo = await getNextVoucherNo(req.user.id, voucherType, date);
    const settings = await BusinessSettings.findOne({ userId: req.user.id }).lean();
    const fyStart = settings?.fyStart || '01 April';
    res.json({ voucherNo, fyStart, financialYear: voucherFinancialYear(date || new Date().toISOString().slice(0, 10), fyStart) });
  } catch (err) {
    next(err);
  }
}

export async function listVouchers(req, res, next) {
  try {
    const {
      voucherType,
      status,
      from,
      to,
      search,
      page = 1,
      limit = 50,
    } = req.query;
    const filter = await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' });
    if (req.user.businessId) filter.businessId = req.user.businessId;
    if (req.query.financialYear) filter.financialYear = req.query.financialYear;
    if (req.query.account) filter['lines.ledgerName'] = req.query.account;
    if (voucherType && voucherType !== 'All') filter.voucherType = voucherType;
    if (status && status !== 'All') filter.status = status;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }
    if (search) {
      const escaped = String(search).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        ...['voucherNo', 'partyName', 'referenceNo', 'narration', 'sourceNumber', 'lines.ledgerName'].map((field) => ({ [field]: new RegExp(escaped, 'i') })),
      ];
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageLimit = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 50));
    const sortField = ['date', 'voucherNo', 'voucherType', 'debitTotal', 'status'].includes(req.query.sort) ? req.query.sort : 'date';
    const sortDirection = req.query.direction === 'asc' ? 1 : -1;
    const skip = (pageNumber - 1) * pageLimit;
    const [vouchers, total] = await Promise.all([
      AccountingVoucher.find(filter)
        .sort({ [sortField]: sortDirection, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),
      AccountingVoucher.countDocuments(filter),
    ]);

    res.json({ vouchers, total, page: pageNumber, limit: pageLimit });
  } catch (err) {
    next(err);
  }
}

export async function getVoucher(req, res, next) {
  try {
    const voucher = await AccountingVoucher.findOne(
      await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' }, { _id: req.params.id, ...(req.user.businessId ? { businessId: req.user.businessId } : {}) }),
    ).lean();
    if (!voucher) return next(httpError(404, 'Voucher not found'));
    const settings = await BusinessSettings.findOne({ userId: voucher.userId }).lean();
    res.json({ voucher: { ...voucher, fyStart: settings?.fyStart || '01 April' } });
  } catch (err) {
    next(err);
  }
}

async function createVoucherHandler(req, res, next) {
  try {
    const voucher = await createAccountingVoucher(req.body ?? {}, req.user);
    res.status(201).json({ voucher });
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Voucher number already exists'));
    next(err);
  }
}

async function updateVoucherHandler(req, res, next) {
  try {
    const voucher = await updateAccountingVoucher(req.params.id, req.body ?? {}, req.user);
    res.json({ voucher });
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Voucher number already exists'));
    next(err);
  }
}

async function deleteVoucherHandler(req, res, next) {
  try {
    await deleteAccountingVoucher(req.params.id, req.user);
    res.json({ message: 'Voucher deleted' });
  } catch (err) {
    next(err);
  }
}

export const createVoucher = createVoucherHandler;
export const updateVoucher = updateVoucherHandler;
export const deleteVoucher = deleteVoucherHandler;

export async function listBillReferences(req, res, next) {
  try {
    if (!req.query.ledger) throw httpError(400, 'Select a ledger first');
    res.json({ references: await getVoucherBillReferences(req.user, req.query.ledger, req.query.financialYear, req.query.excludeId, req.query.date) });
  } catch (error) { next(error); }
}

export const cancelVoucher = async (req, res, next) => {
  try { res.json({ voucher: await cancelAccountingVoucher(req.params.id, req.body || {}, req.user) }); }
  catch (error) { next(error); }
};

export const reverseVoucher = async (req, res, next) => {
  try { res.status(201).json({ voucher: await reverseAccountingVoucher(req.params.id, req.body || {}, req.user) }); }
  catch (error) { next(error); }
};
