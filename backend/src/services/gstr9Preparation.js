import { createHash, randomUUID } from 'node:crypto';
import { Gstr9 } from '../models/Gstr9.js';
import { Gstr1 } from '../models/Gstr1.js';
import { Gstr3b } from '../models/Gstr3b.js';
import { gstDashboardContext } from './gstDashboardContext.js';
import { buildGstr9FromSales, periodsForFy } from './gstFromSales.js';
import { mergeLiveGstr3b, recordedGstr3bFiling } from './gstr3bData.js';
import { httpError } from '../utils/httpError.js';

const heads = ['igst', 'cgst', 'sgst', 'cess'], fields = ['taxable', ...heads];
const round = value => Math.round((Number(value) || 0) * 100) / 100;
const sum = (rows, keys = fields) => Object.fromEntries(keys.map(key => [key, round(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0))]));
const tax = row => round(heads.reduce((total, key) => total + (Number(row?.[key]) || 0), 0));
const canonical = value => Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => !['_id', '__v', 'generatedAt'].includes(key)).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const ANNUAL_ADJUSTMENT_TYPES = {
  outwardIncrease: 'Annual outward increase', outwardDecrease: 'Annual outward decrease',
  itcIncrease: 'Annual ITC addition', itcReversal: 'Annual ITC reversal',
  previousIncrease: 'Part V: FY supplies reported later (+)', previousDecrease: 'Part V: FY supplies reported later (-)',
  previousItc: 'Part V: FY ITC claimed later', previousReversal: 'Part V: FY ITC reversed later',
  taxPaidCash: 'Tax paid in cash (portal receipt)', taxPaidItc: 'Tax paid through ITC (portal record)',
};
export function annualIdentity(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}$/.test(value) || Number(value.slice(5)) !== (Number(value.slice(0, 4)) + 1) % 100) throw httpError(400, 'Choose a financial year such as 2026-27.');
  return value;
}
function validAdjustments(input) {
  if (!Array.isArray(input) || input.length > 200) throw httpError(400, 'Provide up to 200 annual adjustment records.');
  const seen = new Set();
  return input.map(row => {
    if (!row || !Object.hasOwn(ANNUAL_ADJUSTMENT_TYPES, row.type) || typeof row.reference !== 'string' || !row.reference.trim() || row.reference.length > 160 || typeof row.note !== 'string' || !row.note.trim() || row.note.length > 1000) throw httpError(400, 'Each adjustment needs a supported type, reference and explanation.');
    for (const key of fields) if (row[key] != null && (row[key] === '' || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0 || Number(row[key]) > 1e13)) throw httpError(400, 'Adjustment amounts must be nonnegative finite numbers.');
    const id = typeof row.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(row.id) ? row.id : randomUUID();
    if (seen.has(id)) throw httpError(400, 'Adjustment IDs must be unique.');
    seen.add(id);
    if (!fields.some(key => Number(row[key]) > 0)) throw httpError(400, 'Enter at least one adjustment amount.');
    if (!['outwardIncrease', 'outwardDecrease', 'previousIncrease', 'previousDecrease'].includes(row.type) && Number(row.taxable) > 0) throw httpError(400, 'ITC and tax payment records cannot change taxable turnover.');
    return { id, type: row.type, reference: row.reference.trim(), note: row.note.trim(), ...Object.fromEntries(fields.map(key => [key, round(row[key])])) };
  });
}
const recordStatus = record => !record ? 'not-saved' : record.status === 'filed' ? (['manual', 'provider'].includes(record.filing?.source) ? 'filed-record' : 'unverified') : 'draft';
const gstr1Rows = doc => Array.isArray(doc?.sourceDocuments) ? doc.sourceDocuments : [...(doc?.b2b || []), ...(doc?.b2cs || [])];

export async function loadAnnual(req, fyValue) {
  const fy = annualIdentity(fyValue), periods = periodsForFy(fy);
  const context = await gstDashboardContext({ ...req, query: {} });
  const key = { userId: req.user.id, gstin: context.gstin, fy };
  const [saved, sources, saved1, saved3] = await Promise.all([
    Gstr9.findOne(key).lean(), buildGstr9FromSales({ ...key, invoiceScope: context.invoiceScope }),
    Gstr1.find({ userId: req.user.id, gstin: key.gstin, filingType: 'monthly', period: { $in: periods } }).lean(),
    Gstr3b.find({ userId: req.user.id, gstin: key.gstin, period: { $in: periods } }).lean(),
  ]);
  if (saved?.filing?.source === 'manual' && saved.snapshot) return { key, saved, context, sourceHash: saved.preparation.sourceHash, result: { ...saved.snapshot, status: 'filed', filing: saved.filing, workflow: { ...saved.snapshot.workflow, filed: true, history: saved.preparation.history || [] }, generatedAt: new Date().toISOString() } };
  const adjustments = saved?.adjustments || [];
  const { gstr1Docs, gstr3bDocs: generated3 } = sources;
  const prepared3 = generated3.map(doc => {
    const savedMonthly = saved3.find(item => item.period === doc.period);
    // Legacy 'filed' flags without a real acknowledgement must not inject old/sample ITC.
    return mergeLiveGstr3b(savedMonthly?.status === 'filed' && !recordedGstr3bFiling(savedMonthly) ? null : savedMonthly, doc);
  });
  const allDocuments = gstr1Docs.flatMap(doc => doc.sourceDocuments || []);
  // A transport document is not an additional sale. Keep it in compliance only.
  const documents = allDocuments.filter(row => row.documentType !== 'e-way-bill');
  // Notes are signed in the source document ledger. Never add credit/debit totals a second time.
  const books = sum(documents), purchaseRows = generated3.flatMap(doc => doc.purchaseSummaries || []);
  const booksItc = tax(sum(generated3.flatMap(doc => doc.itcAvailable || [])));
  const adjustmentRows = type => adjustments.filter(row => row.type === type).map(row => ({ ...row, desc: `${ANNUAL_ADJUSTMENT_TYPES[type]}: ${row.reference}` }));
  const signedOutward = adjustments.filter(row => ['outwardIncrease', 'outwardDecrease'].includes(row.type)).map(row => ({ ...row, ...Object.fromEntries(fields.map(field => [field, row[field] * (row.type === 'outwardDecrease' ? -1 : 1)])) }));
  const isExport = row => row.returnSection === 'exports' || String(row.invoiceType).startsWith('export');
  const sourceCategories = [
    ['4A', 'B2C supplies (net notes)', row => !isExport(row) && !row.gstin && row.documentType !== 'bill-of-supply'],
    ['4B', 'B2B supplies (net notes)', row => !isExport(row) && Boolean(row.gstin) && row.documentType !== 'bill-of-supply'],
    ['4C', 'Exports (recorded billing classification)', isExport],
    ['other', 'Other supplies / bill of supply', row => row.documentType === 'bill-of-supply' && !isExport(row)],
  ];
  // Note rows retain the supply classification metadata; they are allocated to the same supply group.
  const table4 = sourceCategories.map(([sno, desc, matches]) => ({ sno, desc, ...sum(documents.filter(matches)) }));
  const baseOutward = sum(table4);
  table4.push(...signedOutward.map(row => ({ ...row, sno: row.id, desc: `${ANNUAL_ADJUSTMENT_TYPES[row.type]}: ${row.reference}` })));
  const annualOutward = sum(table4);
  const availableBase = sum(prepared3.flatMap(doc => doc.itcAvailable || []));
  const available = sum([availableBase, ...adjustmentRows('itcIncrease')]);
  const reversals = sum([...prepared3.flatMap(doc => doc.itcReversed || []), ...adjustmentRows('itcReversal')]);
  const output = sum([books, ...signedOutward]);
  const cashRecords = adjustmentRows('taxPaidCash'), itcRecords = adjustmentRows('taxPaidItc');
  const paidCash = sum(cashRecords), paidItc = sum(itcRecords), paid = sum([...cashRecords, ...itcRecords]);
  const table6 = [{ sno: '6A', desc: 'Prepared ITC available (including annual additions)', ...available }, { sno: '6B', desc: 'Monthly prepared ITC', ...availableBase }, ...adjustmentRows('itcIncrease')];
  const table7 = [{ sno: '7', desc: 'Monthly reversals and annual reversal adjustments', ...reversals }];
  const table9 = [{ desc: 'Prepared tax liability (not proof of payment)', ...output }, { desc: 'Recorded paid through ITC', ...paidItc }, { desc: 'Recorded paid in cash', ...paidCash }];
  const previousRows = adjustments.filter(row => row.type.startsWith('previous')).map(row => ({ ...row, desc: `${ANNUAL_ADJUSTMENT_TYPES[row.type]}: ${row.reference}` }));
  const branchMap = new Map();
  const branchRow = name => { const branch = name || 'Unassigned'; if (!branchMap.has(branch)) branchMap.set(branch, { branch, outward: 0, inward: 0, outputTax: 0 }); return branchMap.get(branch); };
  for (const row of documents) { const branch = branchRow(row.branch); branch.outward = round(branch.outward + row.taxable); branch.outputTax = round(branch.outputTax + tax(row)); }
  for (const row of purchaseRows) { const branch = branchRow(row.branch); branch.inward = round(branch.inward + row.taxable); }
  const monthly = periods.map((period, index) => {
    const one = saved1.find(row => row.period === period), three = saved3.find(row => row.period === period);
    const source = sum(gstr1Rows(gstr1Docs[index]).filter(row => row.documentType !== 'e-way-bill'));
    const returns = three && (three.status !== 'filed' || recordedGstr3bFiling(three)) ? sum(three.outwardRows || []) : null;
    return { period, sourceTaxable: source.taxable, returnTaxable: returns?.taxable ?? null, difference: returns ? round(source.taxable - returns.taxable) : null, status: recordStatus(three), gstr1Status: recordStatus(one), gstr3bStatus: recordStatus(three) };
  });
  const usable1 = saved1.filter(doc => (doc.status !== 'filed' || ['manual', 'provider'].includes(doc.filing?.source)) && (Array.isArray(doc.sourceDocuments) || Array.isArray(doc.b2b) || Array.isArray(doc.b2cs)));
  const usable3 = saved3.filter(doc => doc.status !== 'filed' || recordedGstr3bFiling(doc));
  const oneTotals = sum(usable1.flatMap(gstr1Rows).filter(row => row.documentType !== 'e-way-bill')), threeTotals = sum(usable3.flatMap(doc => doc.outwardRows || []));
  const threeItc = tax(sum(usable3.flatMap(doc => doc.itcAvailable || []))) - tax(sum(usable3.flatMap(doc => doc.itcReversed || [])));
  const scopeComplete = !context.branch && (req.user.accountType === 'owner' || req.user.isSuperAdmin === true);
  // Saved returns have no reliable branch allocation. Do not compare them with a partial books scope.
  const comparison = [
    { metric: 'Turnover', books: books.taxable, gstr1: scopeComplete && usable1.length ? oneTotals.taxable : null, gstr3b: scopeComplete && usable3.length ? threeTotals.taxable : null },
    { metric: 'Output Tax', books: tax(books), gstr1: scopeComplete && usable1.length ? tax(oneTotals) : null, gstr3b: scopeComplete && usable3.length ? tax(threeTotals) : null },
    { metric: 'ITC (net of reversals)', books: booksItc, gstr1: null, gstr3b: scopeComplete && usable3.length ? round(threeItc) : null },
    { metric: 'Tax Paid', books: null, gstr1: null, gstr3b: null },
  ].map(row => ({ ...row, gstr1Variance: row.books != null && row.gstr1 != null ? round(row.books - row.gstr1) : null, gstr3bVariance: row.books != null && row.gstr3b != null ? round(row.books - row.gstr3b) : null }));
  const hsnMap = new Map();
  for (const row of gstr1Docs.flatMap(doc => doc.hsn || [])) { const hsn = row.hsn || 'Not recorded'; if (!hsnMap.has(hsn)) hsnMap.set(hsn, { desc: hsn, qty: 0, ...sum([]) }); const total = hsnMap.get(hsn); total.qty = round(total.qty + (Number(row.qty) || 0)); for (const field of fields) total[field] = round(total[field] + (Number(row[field]) || 0)); }
  const errors = [], warnings = [];
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(key.gstin)) errors.push('Business GSTIN is missing or invalid.');
  for (const head of heads) { if (reversals[head] > available[head]) errors.push(`${head.toUpperCase()} reversals exceed available ITC.`); if (output[head] < 0 || available[head] < 0) errors.push(`${head.toUpperCase()} annual amounts cannot be negative.`); }
  if (annualOutward.taxable < 0) errors.push('Annual turnover cannot be negative.');
  if (!scopeComplete) warnings.push('This is a restricted books scope. Saved monthly returns are not directly comparable to a partial scope.');
  warnings.push(`${saved1.length}/12 GSTR-1 and ${saved3.length}/12 GSTR-3B records saved. Draft or legacy records are not verified portal filings.`);
  warnings.push('Review portal Table 8A, refunds, demands, interest, late fees and untracked supply classifications separately.');
  if (!cashRecords.length && !itcRecords.length) warnings.push('No portal payment evidence recorded. Tax paid is unavailable, not estimated from liability.');
  const closedYear = new Date() >= new Date(`${Number(fy.slice(0, 4)) + 1}-04-01T00:00:00+05:30`);
  if (!closedYear) warnings.push('This financial year is still in progress. Annual filing is unavailable.');
  const sourceHash = digest({ fy, gstin: key.gstin, branch: context.branch, documents, hsn: [...hsnMap.values()], purchaseRows, prepared3, saved1, saved3, adjustments });
  const current = saved?.preparation?.sourceHash === sourceHash, prep = saved?.preparation || {};
  const workflow = { draft: true, validated: current && Boolean(prep.validatedAt) && !errors.length, summaryGenerated: current && Boolean(prep.summaryAt) && !errors.length, readyToFile: current && Boolean(prep.summaryAt) && prep.reviewed === true && !errors.length && closedYear, filed: false, reviewed: current && prep.reviewed === true, stale: Boolean(prep.sourceHash) && !current, history: prep.history || [], savedAt: saved?.updatedAt || null };
  const result = { fy, gstin: key.gstin, business: context.business, branchScope: context.branch || 'Permitted business records', periods, sourceHash, status: 'draft', generatedAt: new Date().toISOString(), workflow, validation: { errors, warnings }, adjustments, adjustmentTypes: ANNUAL_ADJUSTMENT_TYPES,
    overview: { turnover: annualOutward.taxable, outputTax: tax(output), itcClaimed: tax(available), taxPaid: cashRecords.length + itcRecords.length ? tax(paid) : null, variance: scopeComplete && usable1.length === 12 ? round(books.taxable - oneTotals.taxable) : null, annualOutwardAdjustment: round(annualOutward.taxable - baseOutward.taxable) },
    annualDetails: { inwardRows: [true, false].map(registered => ({ desc: registered ? 'GST-registered suppliers' : 'Unregistered suppliers', ...sum(purchaseRows.filter(row => row.registered === registered)) })), branches: [...branchMap.values()], monthly, invoiceCount: documents.length, purchaseCount: generated3.reduce((total, doc) => total + doc.purchaseCount, 0), sourceTaxable: books.taxable, comparison, previousRows },
    compliance: { eInvoices: allDocuments.filter(row => row.documentType === 'e-invoice').map(row => ({ ...row, desc: row.invoiceNo })), eWayBills: allDocuments.filter(row => row.documentType === 'e-way-bill').map(row => ({ ...row, desc: row.invoiceNo })), hsn: [...hsnMap.values()], amendments: adjustments.filter(row => !row.type.startsWith('taxPaid')).map(row => ({ ...row, desc: row.reference })) },
    turnoverBreakdown: [...table4.slice(0, 3).map(row => ({ label: row.sno === '4A' ? 'B2C Supplies' : row.sno === '4B' ? 'B2B Supplies' : 'Exports', value: row.taxable })), { label: 'Other Supplies', value: round(table4[3].taxable + sum(signedOutward).taxable) }],
    table4, table5: [], table6, table7, table9,
    capabilities: { portalSubmission: false, officialUpload: false, paymentVerification: false },
  };
  return { key, saved, context, sourceHash, result };
}

async function persist(loaded, stage, fieldsToSet) {
  const history = [...(loaded.saved?.preparation?.history || []), { stage, date: new Date().toISOString(), sourceHash: loaded.sourceHash }].slice(-100);
  const preparation = { ...fieldsToSet.preparation, history };
  let saved;
  try {
    if (loaded.saved) {
      const version = loaded.saved.__v;
      const match = { _id: loaded.saved._id, ...(version == null ? { $or: [{ __v: { $exists: false } }, { __v: 0 }] } : { __v: version }) };
      saved = await Gstr9.findOneAndUpdate(match, { $set: { ...fieldsToSet, preparation }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    } else saved = await Gstr9.create({ ...loaded.key, ...fieldsToSet, preparation });
  } catch (error) { if (error.code === 11000) throw httpError(409, 'Annual return changed. Refresh and try again.'); throw error; }
  if (!saved) throw httpError(409, 'Annual return changed. Refresh and try again.');
}
export async function prepareAnnual(req, stage) {
  const allowed = ['fy', 'expectedSourceHash', ...(stage === 'draft' ? ['adjustments'] : []), ...(stage === 'summary' ? ['reviewed'] : []), ...(stage === 'filed' ? ['arn', 'filedAt', 'confirmed'] : [])];
  if (Object.keys(req.body || {}).some(key => !allowed.includes(key))) throw httpError(400, 'Unsupported annual preparation fields.');
  const loaded = await loadAnnual(req, req.body?.fy);
  if (!req.body.expectedSourceHash || req.body.expectedSourceHash !== loaded.sourceHash) throw httpError(409, 'Annual source data changed. Refresh and review the return again.');
  if (loaded.saved?.filing) throw httpError(409, 'This filed annual snapshot is locked.');
  const prep = { ...(loaded.saved?.preparation || {}), sourceHash: loaded.sourceHash };
  let updates = {};
  if (stage === 'draft') {
    const adjustments = req.body.adjustments == null ? loaded.result.adjustments : validAdjustments(req.body.adjustments);
    const changed = digest(adjustments) !== digest(loaded.result.adjustments);
    updates.adjustments = adjustments;
    if (changed || loaded.result.workflow.stale) { delete prep.validatedAt; delete prep.summaryAt; prep.reviewed = false; }
  } else if (stage === 'validate') {
    if (loaded.result.validation.errors.length) throw httpError(400, loaded.result.validation.errors.join(' '));
    prep.validatedAt = new Date().toISOString(); delete prep.summaryAt; prep.reviewed = false;
  } else if (stage === 'summary') {
    if (!loaded.result.workflow.validated) throw httpError(409, 'Validate the current annual data before calculating the summary.');
    prep.summaryAt = new Date().toISOString(); prep.reviewed = req.body.reviewed === true;
  } else if (stage === 'filed') {
    if (!loaded.result.workflow.readyToFile) throw httpError(409, 'Validate, calculate and review annual warnings before recording a filing.');
    const end = new Date(`${Number(loaded.key.fy.slice(0, 4)) + 1}-04-01T00:00:00+05:30`);
    const date = new Date(req.body.filedAt);
    if (req.body.confirmed !== true || !/^[A-Z0-9]{15}$/.test(req.body.arn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.filedAt || '') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== req.body.filedAt || date < end || date > new Date()) throw httpError(400, 'Enter the actual 15-character portal ARN and a valid filing date after the financial year ended, and confirm external filing.');
    updates = { filing: { source: 'manual', arn: req.body.arn, filedAt: req.body.filedAt, recordedBy: req.user.id, recordedAt: new Date().toISOString(), verification: 'not-portal-verified' }, snapshot: loaded.result };
  }
  await persist(loaded, stage, { ...updates, preparation: prep });
  return (await loadAnnual(req, loaded.key.fy)).result;
}
