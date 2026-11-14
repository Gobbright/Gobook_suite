import { Gstr1 } from '../../../models/Gstr1.js';
import { GstReconciliation } from '../../../models/GstReconciliation.js';
import { Invoice } from '../../../models/Invoice.js';
import { Gstr3b } from '../../../models/Gstr3b.js';
import { httpError } from '../../../utils/httpError.js';
import { buildGstr3bFromSales, buildPurchaseReconciliationFromSales, gstInvoicePeriodMatch, mergeDraftGstr3b, parsePeriod } from '../../../services/gstFromSales.js';
import { gstDashboardContext } from '../../../services/gstDashboardContext.js';
import { ACTIVE_FINANCIAL_FILTER } from '../../../services/salesLifecycle.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TAX_KEYS = ['igst', 'cgst', 'sgst', 'cess'];
const periodFromDate = date => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
const sumField = (rows = [], key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
const sumTax = rows => TAX_KEYS.reduce((sum, key) => sum + sumField(rows, key), 0);
const netItc = record => sumTax(record.itcAvailable) - sumTax(record.itcReversed);
const recentPeriods = (count, anchor) => Array.from({ length: count }, (_, index) => periodFromDate(new Date(anchor.getFullYear(), anchor.getMonth() - count + index + 1, 1)));
const invoiceKey = entry => `${String(entry.gstin || '').trim().toUpperCase()}|${String(entry.invoiceNo || '').trim().toLowerCase()}`;
const filingStatus = records => records.length ? records.every(row => row.status === 'filed') ? 'filed' : 'draft' : 'not-started';

export async function getGstDashboard(req, res, next) {
  try {
    const requestedPeriod = req.query.period || periodFromDate(new Date());
    const parsed = typeof requestedPeriod === 'string' && parsePeriod(requestedPeriod);
    if (!parsed || parsed.year < 2000 || parsed.year > 2100) throw httpError(400, 'Invalid dashboard period');
    const anchor = new Date(parsed.year, parsed.monthIdx, 1);
    const currentPeriod = periodFromDate(anchor);
    const trendPeriods = recentPeriods(parsed.monthIdx >= 3 ? parsed.monthIdx - 2 : parsed.monthIdx + 10, anchor);
    const { business, gstin, invoiceScope, owners, branch } = await gstDashboardContext(req);
    const savedScope = { userId: { $in: owners }, gstin, period: { $in: trendPeriods } };
    const [savedGstr1, savedGstr3b, reconciliations] = await Promise.all([
      Gstr1.find(savedScope).lean(), Gstr3b.find(savedScope).lean(),
      GstReconciliation.find({ userId: { $in: owners }, gstin, period: currentPeriod, type: '2b' }).lean(),
    ]);
    const generated = await Promise.all(trendPeriods.map(async period => {
      const records = await Promise.all(owners.map(async userId => {
        const source = await buildGstr3bFromSales({ userId, period, gstin, invoiceScope: { ...invoiceScope, userId } });
        const saved = savedGstr3b.find(row => String(row.userId) === String(userId) && row.period === period);
        // Whole-return snapshots cannot replace figures restricted to a branch.
        return { source, record: branch ? source : mergeDraftGstr3b(saved, source) };
      }));
      return {
        month: period.slice(0, 3), period,
        outwardRows: records.flatMap(({ record }) => record.outwardRows || []),
        itcAvailable: records.flatMap(({ record }) => record.itcAvailable || []),
        itcReversed: records.flatMap(({ record }) => record.itcReversed || []),
        invoiceCount: records.reduce((sum, { source }) => sum + (source.invoiceCount || 0), 0),
        b2bInvoiceCount: records.reduce((sum, { source }) => sum + (source.b2bInvoiceCount || 0), 0),
        b2cInvoiceCount: records.reduce((sum, { source }) => sum + (source.b2cInvoiceCount || 0), 0),
      };
    }));
    const current = generated.at(-1);
    const monthlyTrend = generated.map(row => ({ month: row.month, period: row.period, output: sumTax(row.outwardRows), itc: netItc(row), ...Object.fromEntries(TAX_KEYS.map(key => [key, sumField(row.outwardRows, key)])) }));
    const outputTax = sumTax(current.outwardRows), itcAvailable = netItc(current);
    const filingCalendar = [['GSTR-1', savedGstr1, 11, '/gstr-1'], ['GSTR-3B', savedGstr3b, 20, '/gstr-3b']].map(([name, saved, day, href]) => {
      const records = saved.filter(row => row.period === currentPeriod).map(row => name === 'GSTR-1' && row.status === 'filed' && !['manual', 'provider'].includes(row.filing?.source) ? { ...row, status: 'unverified' } : row);
      const due = new Date(parsed.year, parsed.monthIdx + 1, day);
      return { return: name, period: currentPeriod, status: filingStatus(records), recorded: records.length > 0,
        dueDate: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        daysLeft: Math.ceil((due - Date.now()) / 86_400_000), href, arn: records.find(row => row.arn)?.arn || null };
    });
    const purchaseRegister = await buildPurchaseReconciliationFromSales({ userId: req.user.id, period: currentPeriod, gstin, invoiceScope });
    // Match statement entries by supplier GSTIN AND bill number, as the reconciliation page does.
    const savedEntries = new Map(reconciliations.flatMap(record => record.entries || []).map(entry => [invoiceKey(entry), entry]));
    const reconciliationEntries = purchaseRegister.entries.map(entry => {
      const saved = savedEntries.get(invoiceKey(entry));
      const recorded = Boolean(saved?.statementRecorded) || Number(saved?.itcGstr2b) > 0;
      const difference = (Number(entry.itcBooks) || 0) - (Number(saved?.itcGstr2b) || 0);
      return { ...entry, difference, recorded, status: recorded ? Math.abs(difference) < .01 ? 'matched' : 'mismatch' : 'not_in_2b' };
    });
    const exceptions = reconciliationEntries.filter(entry => entry.status !== 'matched').length;
    const reviewed = reconciliations.length > 0;
    const latestInvoices = await Invoice.find({ ...invoiceScope, ...ACTIVE_FINANCIAL_FILTER, documentType: { $in: ['invoice', 'bill-of-supply', 'e-invoice', 'purchase-entry', 'credit-note', 'debit-note', 'sales-return'] }, $and: [...(invoiceScope.$and || []), gstInvoicePeriodMatch(currentPeriod)] })
      .select('number documentType updatedAt createdAt meta.date').sort({ updatedAt: -1 }).limit(5).lean();
    const activity = [
      ...savedGstr1.map(row => ({ date: row.updatedAt, label: `GSTR-1 ${row.status === 'filed' && ['manual', 'provider'].includes(row.filing?.source) ? 'filing acknowledgement recorded' : 'preparation record updated'}`, period: row.period, status: row.status === 'filed' && ['manual', 'provider'].includes(row.filing?.source) ? 'filed' : 'draft' })),
      ...savedGstr3b.map(row => ({ date: row.updatedAt, label: `GSTR-3B ${row.status === 'filed' ? 'filed' : 'draft updated'}`, period: row.period, status: row.status })),
      ...reconciliations.map(row => ({ date: row.updatedAt, label: 'GSTR-2B reconciliation updated', period: row.period, status: 'reviewed' })),
      ...latestInvoices.map(row => ({ date: row.updatedAt || row.createdAt, label: `${row.documentType === 'purchase-entry' ? 'Purchase' : 'Sales'} document ${row.number} saved`, period: currentPeriod, status: 'recorded' })),
    ].filter(row => row.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const actions = [
      ...filingCalendar.filter(row => (row.recorded || current.invoiceCount > 0 || purchaseRegister.entries.length > 0) && row.status !== 'filed').map(row => ({ key: row.return, label: `${row.return} ${row.recorded ? 'draft awaiting review' : 'preparation needed'} (${currentPeriod})`, to: row.href, action: 'Review Return', urgent: row.daysLeft <= 0 })),
      ...(exceptions ? [{ key: 'reconcile', label: `${exceptions} purchase invoice${exceptions === 1 ? '' : 's'} ${reviewed ? 'need GSTR-2B reconciliation' : 'await GSTR-2B statement review'} (${currentPeriod})`, to: '/gst-reconciliation', action: 'Reconcile' }] : []),
      ...(!gstin ? [{ key: 'gstin', label: 'Add your business GSTIN to complete GST setup', to: '/business-settings', action: 'Set Up', urgent: true }] : []),
    ];
    res.json({
      business, gstin, currentPeriod, generatedAt: new Date().toISOString(),
      stats: { outputTax, itcAvailable, netTaxPayable: Math.max(0, outputTax - itcAvailable), pendingFilings: filingCalendar.filter(row => row.status !== 'filed').length },
      filingCalendar, monthlyTrend, actions,
      overview: {
        invoiceCount: current.invoiceCount, b2bInvoiceCount: current.b2bInvoiceCount, b2cInvoiceCount: current.b2cInvoiceCount,
        salesTaxable: sumField(current.outwardRows, 'taxable'),
        purchaseTaxable: sumField(purchaseRegister.entries, 'invoiceValue') - sumField(purchaseRegister.entries, 'itcBooks'),
        taxBreakup: TAX_KEYS.map(key => ({ key, label: key.toUpperCase(), value: sumField(current.outwardRows, key) })),
        reconciliation: { reviewed, exceptions, purchases: reconciliationEntries.length }, activity,
      },
    });
  } catch (error) { next(error); }
}
