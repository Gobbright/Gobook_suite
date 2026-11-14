import { createHash } from 'node:crypto';
import { Gstr3b } from '../models/Gstr3b.js';
import { AccountingVoucher } from '../models/AccountingVoucher.js';
import { GstReconciliation } from '../models/GstReconciliation.js';
import { gstDashboardContext } from './gstDashboardContext.js';
import { buildGstr3bFromSales, mergeDraftGstr3b, parsePeriod } from './gstFromSales.js';
import { httpError } from '../utils/httpError.js';

const heads = ['cgst', 'sgst', 'igst', 'cess'];
const round = value => Math.round(Number(value) * 100) / 100;
const canonical = value => Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => key !== '_id').sort().map(key => [key, canonical(value[key])])) : value;
export function gstr3bPeriod(value) {
  const parsed = typeof value === 'string' && parsePeriod(value);
  if (!parsed || !/^[A-Za-z]+ \d{4}$/.test(value) || parsed.year < 2000 || parsed.year > 2100) throw httpError(400, 'Choose a valid return period.');
  return new Date(parsed.year, parsed.monthIdx, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function recordedGstr3bFiling(record) { return record?.status === 'filed' && ['manual', 'provider'].includes(record.filing?.source); }
export function mergeLiveGstr3b(saved, generated) {
  const recorded = recordedGstr3bFiling(saved);
  const result = mergeDraftGstr3b(saved && !recorded ? { ...saved, status: 'draft' } : saved, generated);
  if (!recorded) { delete result.arn; delete result.filedAt; }
  return result;
}
export function validateGstr3bEdits(data) {
  for (const group of ['itcAvailable', 'itcReversed']) {
    if (data[group] == null) continue;
    if (!Array.isArray(data[group]) || data[group].length > 20) throw httpError(400, 'Choose valid ITC rows.');
    const keys = group === 'itcAvailable' ? ['A(1)', 'A(2)', 'A(3)', 'A(5)'] : ['B(1)', 'B(2)'];
    const seen = new Set();
    for (const row of data[group]) {
      if (!row || !keys.includes(row.key) || seen.has(row.key)) throw httpError(400, 'ITC row keys must be supported and unique.');
      seen.add(row.key);
      if (heads.some(key => row[key] != null && (row[key] === '' || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0))) throw httpError(400, 'ITC amounts must be nonnegative numbers.');
    }
  }
  for (const key of ['lateFeeCgst', 'lateFeeSgst']) if (data[key] != null && (data[key] === '' || !Number.isFinite(Number(data[key])) || Number(data[key]) < 0)) throw httpError(400, 'Late fees must be nonnegative numbers.');
}
export async function loadGstr3bData(req, requestedPeriod) {
  const period = gstr3bPeriod(requestedPeriod);
  // Returns cover permitted billing records, independent of table filters.
  const context = await gstDashboardContext({ ...req, query: {} });
  const key = { userId: req.user.id, gstin: context.gstin, period };
  const [saved, generated] = await Promise.all([
    Gstr3b.findOne(key).lean(),
    buildGstr3bFromSales({ ...key, invoiceScope: context.invoiceScope }),
  ]);
  const sourceHash = createHash('sha256').update(JSON.stringify(canonical({ period, gstin: key.gstin, branch: context.branch, outward: generated.outwardRows, interstate: generated.interstateSupplies, inward: generated.untaxedInward, itc: generated.itcAvailable, purchases: generated.purchaseSummaries, invoices: generated.invoiceCount, purchaseCount: generated.purchaseCount }))).digest('hex');
  let accounting = null;
  if (saved?.accountingVoucherId) accounting = await AccountingVoucher.findOne({ _id: saved.accountingVoucherId, userId: req.user.id, ...(req.user.businessId ? { businessId: req.user.businessId } : {}), status: 'Posted' }).select('_id voucherNo postedAt').lean();
  const result = mergeLiveGstr3b(saved, generated);
  // Compare only statement lines linked to purchases the current actor may read.
  // Aggregate statement ITC has no tax-head allocation and must not be auto-claimed.
  const statement = await GstReconciliation.findOne({ ...key, type: '2b' }).lean();
  const reference = row => JSON.stringify([String(row.gstin || '').trim().toUpperCase(), String(row.invoiceNo || '').trim()]);
  const permitted = new Set((generated.purchaseReferences || []).map(reference));
  const seen = new Set();
  const statementEntries = (statement?.entries || []).filter(row => {
    const id = reference(row);
    if (!permitted.has(id) || seen.has(id) || !(row.statementRecorded || Number(row.itcGstr2b) > 0)) return false;
    seen.add(id); return true;
  });
  const gstr2b = { recorded: statementEntries.length > 0, invoiceCount: statementEntries.length, totalItc: round(statementEntries.reduce((sum, row) => sum + (Number(row.itcGstr2b) || 0), 0)), updatedAt: statementEntries.length ? statement.updatedAt : null, source: 'saved reconciliation statement', taxHeadBreakupAvailable: false };
  return { key, saved, generated, context, sourceHash, result: {
    ...result, business: context.business, branchScope: context.branch || 'Permitted business records', generatedAt: new Date().toISOString(), sourceHash,
    invoiceCount: generated.invoiceCount, purchaseCount: generated.purchaseCount,
    interstateSupplies: generated.interstateSupplies, untaxedInward: generated.untaxedInward, gstr2b,
    capabilities: { portalSubmission: false, portalPayment: false, section95: false, ineligibleItc: false, interest: false, inwardClassification: false },
    accountingVoucherId: accounting?._id || null, accountingVoucherNo: accounting?.voucherNo || '', accountingPostedAt: accounting?.postedAt || null,
    ledgerBalances: { cash: null, credit: null, source: 'not-connected' },
    sources: { outward: recordedGstr3bFiling(saved) ? 'saved filing snapshot' : 'billing documents', itc: saved?.itcSourceMode === 'adjustments' ? 'purchase entries + saved adjustments' : saved?.itcAvailable?.length ? 'saved return entries' : 'purchase entries', reversals: saved?.itcReversed?.length ? 'saved return entries' : 'not recorded', fees: saved ? 'saved return entries' : 'not recorded' },
    legacyFiling: saved?.status === 'filed' && !recordedGstr3bFiling(saved) ? { status: 'unverified', arn: saved.arn, filedAt: saved.filedAt } : undefined,
  } };
}
export function gstr3bAdjustments(rows, generated) {
  return generated.map(base => {
    const edited = rows.find(row => row.key === base.key) || base;
    return { key: base.key, label: base.label, ...Object.fromEntries(heads.map(key => [key, round((Number(edited[key]) || 0) - (Number(base[key]) || 0))])) };
  });
}
