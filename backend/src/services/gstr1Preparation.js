import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { Gstr1 } from '../models/Gstr1.js';
import { gstDashboardContext } from './gstDashboardContext.js';
import { buildGstr1FromSales, parsePeriod } from './gstFromSales.js';
import { httpError } from '../utils/httpError.js';
import { gstr1Category } from './gstr1Categories.js';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const fields = ['taxable', 'igst', 'cgst', 'sgst', 'cess'];
const isCredit = row => ['credit-note', 'sales-return'].includes(row.documentType);
const isDebit = row => row.documentType === 'debit-note';
const canonical = value => Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => key !== '_id').sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const totals = rows => {
  const sums = Object.fromEntries(fields.map(key => [key, rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)]));
  sums.tax = sums.igst + sums.cgst + sums.sgst + sums.cess;
  sums.total = sums.taxable + sums.tax;
  return sums;
};
export function gstr1Identity(req) {
  const input = req.method === 'GET' ? req.query : req.body;
  const period = input?.period, filingType = input?.filingType || 'monthly';
  const parsed = parsePeriod(period);
  if (typeof period !== 'string' || !parsed || parsed.year < 2000 || parsed.year > 2100 || !/^[A-Za-z]+ \d{4}$/.test(period)) throw httpError(400, 'Choose a valid return period.');
  if (filingType !== 'monthly') throw httpError(400, 'This preparation workflow supports monthly returns. Choose a monthly period.');
  const month = new Date(parsed.year, parsed.monthIdx, 1).toLocaleDateString('en-US', { month: 'long' });
  return { period: `${month} ${parsed.year}`, filingType };
}
function sourceDocuments(data) {
  if (Array.isArray(data.sourceDocuments)) return data.sourceDocuments;
  return [...(data.b2b || []).map(row => ({ ...row, documentType: 'invoice' })), ...(data.b2cs || []).map(row => ({ ...row, documentType: 'b2c-summary' }))];
}
export function validateGstr1Source(data, allowEmpty = false) {
  const rows = sourceDocuments(data), issues = [];
  const add = (row, index, message, blocking = true) => issues.push({ key: `${index}-${issues.length}`, rowKey: row ? `${row.sourceId || row.invoiceNo}-${index}` : undefined, invoiceNo: row?.invoiceNo || 'Business', message, blocking });
  if (!GSTIN.test(data.gstin || '')) add(null, 'business', 'Business GSTIN is missing or has an invalid format.');
  if (!rows.length && !allowEmpty) add(null, 'empty', 'No source records. Confirm an empty-period return before validating.');
  const prefix = parsePeriod(data.period).monthPrefix;
  const seen = new Set();
  rows.forEach((row, index) => {
    if (row.gstin && !GSTIN.test(row.gstin)) add(row, index, 'Customer GSTIN has an invalid format.');
    if (row.documentType !== 'b2c-summary' && !row.invoiceNo) add(row, index, 'Document number is missing.');
    if (row.documentType !== 'b2c-summary' && (!row.date || !row.date.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date)) add(row, index, 'Document date is missing, invalid or outside the selected period.');
    if (!row.state || row.state === 'N/A') add(row, index, 'Place of supply is missing.');
    if (row.missingHsn > 0) add(row, index, `${row.missingHsn} item(s) have no HSN/SAC.`, false);
    if (fields.some(key => row[key] != null && !Number.isFinite(Number(row[key])))) add(row, index, 'A taxable or tax amount is invalid.');
    const key = `${row.documentType}|${row.invoiceNo}|${row.gstin || ''}`;
    if (row.invoiceNo && seen.has(key)) add(row, index, 'Duplicate document number in this section.');
    seen.add(key);
  });
  return { issues, errors: issues.filter(issue => issue.blocking).length, warnings: issues.filter(issue => !issue.blocking).length };
}
export async function loadGstr1Preparation(req) {
  const identity = gstr1Identity(req);
  // The return always covers the actor's permitted billing scope, not table filters.
  const context = await gstDashboardContext({ ...req, query: {} });
  const key = { userId: req.user.id, gstin: context.gstin, ...identity };
  const saved = await Gstr1.findOne(key).lean();
  const recordedFiling = saved?.status === 'filed' && ['manual', 'provider'].includes(saved.filing?.source);
  const source = recordedFiling ? { ...saved, sourceDocuments: sourceDocuments(saved) }
    : await buildGstr1FromSales({ userId: req.user.id, ...identity, gstin: context.gstin, invoiceScope: context.invoiceScope });
  const hsnSnapshot = (source.hsn || []).map(row => Object.fromEntries(['hsn', 'desc', 'qty', 'value', ...fields].map(key => [key, row[key] ?? (['hsn', 'desc'].includes(key) ? '' : 0)])));
  const sourceHash = hash({ version: 1, ...identity, gstin: context.gstin, branch: context.branch, documents: sourceDocuments(source), hsn: hsnSnapshot });
  const preparation = saved?.preparation || {};
  const current = preparation.sourceHash === sourceHash;
  const validation = validateGstr1Source(source, current && preparation.allowEmpty === true);
  const validated = current && Boolean(preparation.validatedAt) && validation.errors === 0;
  const summaryGenerated = validated && Boolean(preparation.summaryGeneratedAt);
  const state = {
    draft: true, validated, summaryGenerated, exportReady: summaryGenerated, filed: recordedFiling,
    sourceHash, stale: Boolean(preparation.sourceHash) && !current, validation,
    allowEmpty: current && preparation.allowEmpty === true,
    validatedAt: validated ? preparation.validatedAt : null,
    summaryGeneratedAt: summaryGenerated ? preparation.summaryGeneratedAt : null,
    exportedAt: current ? preparation.exportedAt || null : null,
    summary: summaryGenerated ? preparation.summary : null,
    history: preparation.history || [],
  };
  return { key, saved, source, sourceHash, validation, state, context, recordedFiling };
}
export function gstr1Response(context) {
  const { source, saved, state, context: businessContext, recordedFiling } = context;
  return { ...source, sourceDocuments: sourceDocuments(source).map(row => ({ ...row, returnSection: row.returnSection || gstr1Category(row, source.period) })), capabilities: { taxableAdvances: false, portalSubmission: false }, status: recordedFiling ? 'filed' : 'draft', business: businessContext.business,
    arn: recordedFiling ? saved.arn : undefined, filedAt: recordedFiling ? saved.filedAt : undefined,
    filing: recordedFiling ? saved.filing : undefined, generatedAt: new Date().toISOString(), workflow: state,
    legacyFiling: saved?.status === 'filed' && !recordedFiling ? { arn: saved.arn, verification: 'unverified' } : undefined };
}
function requireCurrent(context, expectedHash) {
  if (expectedHash && expectedHash !== context.sourceHash) throw httpError(409, 'Billing data changed. Refresh and validate the return again.');
}
function snapshot(context) {
  const { source } = context;
  return { b2b: source.b2b || [], b2cs: source.b2cs || [], cdnr: source.cdnr || [], hsn: source.hsn || [], sourceDocuments: sourceDocuments(source) };
}
async function persist(context, stage, update = {}, extra = {}) {
  const now = new Date();
  const oldHistory = context.saved?.preparation?.history || [];
  const preparation = { ...update, history: [...oldHistory, { stage, date: now.toISOString(), sourceHash: context.sourceHash }].slice(-50) };
  const match = context.saved ? { _id: context.saved._id, __v: context.saved.__v || 0 } : context.key;
  // Concurrent mutations must not overwrite a newer validation, export or filing.
  if (context.saved && context.saved.__v == null) { delete match.__v; match.$or = [{ __v: 0 }, { __v: { $exists: false } }]; }
  let saved;
  try {
    saved = context.saved
      ? await Gstr1.findOneAndUpdate(match, { $set: { ...context.key, ...snapshot(context), preparation, ...extra }, $inc: { __v: 1 } }, { new: true, runValidators: true }).lean()
      : (await Gstr1.create({ ...context.key, ...snapshot(context), preparation, ...extra })).toObject();
  } catch (error) { if (error.code === 11000) throw httpError(409, 'This return changed in another request. Refresh and try again.'); throw error; }
  if (!saved) throw httpError(409, 'This return changed in another request. Refresh and try again.');
  context.saved = saved;
  return saved;
}
export async function prepareGstr1(req, stage) {
  const context = await loadGstr1Preparation(req);
  requireCurrent(context, req.body.expectedSourceHash);
  if (context.recordedFiling) throw httpError(409, 'This filed snapshot is locked. You can preview or export it.');
  const now = new Date().toISOString();
  if (stage === 'draft') {
    await persist(context, 'draft-saved', { sourceHash: context.sourceHash }, { status: 'draft' });
  } else if (stage === 'validate') {
    const allowEmpty = req.body.allowEmpty === true;
    const validation = validateGstr1Source(context.source, allowEmpty);
    const retainSummary = context.state.validated && validation.errors === 0;
    await persist(context, validation.errors ? 'validation-failed' : 'validated', {
      ...(retainSummary ? context.saved.preparation : {}), sourceHash: context.sourceHash, allowEmpty, validation,
      validatedAt: validation.errors === 0 ? now : null,
    }, { status: 'draft' });
  } else if (stage === 'summary') {
    if (!context.state.validated) throw httpError(409, 'Validate the current billing data successfully before generating a summary.');
    const documents = sourceDocuments(context.source);
    const sections = Object.fromEntries(['b2b', 'b2cl', 'b2cs', 'exports', 'notes'].map(key => [key, documents.filter(row => gstr1Category(row, context.key.period) === key)]));
    sections.credit = documents.filter(isCredit); sections.debit = documents.filter(isDebit);
    const summary = { period: context.key.period, gstin: context.key.gstin, sourceHash: context.sourceHash, recordCount: documents.length,
      ...totals(documents), sections: Object.fromEntries(Object.entries(sections).map(([key, rows]) => [key, { count: rows.length, ...totals(rows) }])) };
    await persist(context, 'summary-generated', { ...context.saved.preparation, summary, summaryGeneratedAt: now, exportReadyAt: now });
  }
  return gstr1Response(await loadGstr1Preparation(req));
}
export async function recordGstr1Filing(req) {
  const context = await loadGstr1Preparation(req);
  const arn = typeof req.body.arn === 'string' ? req.body.arn.trim().toUpperCase() : '';
  const filedAt = req.body.filedAt;
  if (!/^[A-Z0-9/-]{3,64}$/.test(arn)) throw httpError(400, 'Enter the acknowledgement reference received from the GST portal.');
  if (req.body.confirmed !== true) throw httpError(400, 'Confirm that you already filed this return on the GST portal.');
  if (typeof filedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(filedAt) || Number.isNaN(Date.parse(filedAt)) || new Date(filedAt).toISOString().slice(0, 10) !== filedAt || filedAt > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) throw httpError(400, 'Choose a valid filing date that is not in the future.');
  if (context.recordedFiling) {
    if (context.saved.arn === arn && new Date(context.saved.filedAt).toISOString().slice(0, 10) === filedAt) return gstr1Response(context);
    throw httpError(409, 'This return already has a filing acknowledgement. Its snapshot is locked.');
  }
  requireCurrent(context, req.body.expectedSourceHash);
  if (!context.state.exportReady) throw httpError(409, 'Validate and generate the current return summary before recording a filing.');
  await persist(context, 'portal-filing-recorded', context.saved.preparation, { status: 'filed', arn, filedAt: new Date(`${filedAt}T00:00:00Z`), filing: { source: 'manual', sourceHash: context.sourceHash, recordedBy: req.user.id, recordedAt: new Date() } });
  return gstr1Response(await loadGstr1Preparation(req));
}
function reviewPdf(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 35 }), chunks = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.fontSize(19).text(`GSTR-1 Review - ${payload.period}`); doc.moveDown(.4);
    doc.fontSize(10).text(`GSTIN: ${payload.gstin} | Source: ${payload.sourceHash.slice(0, 12)}`);
    doc.text(`Taxable: INR ${payload.summary.taxable.toFixed(2)} | GST: INR ${payload.summary.tax.toFixed(2)} | Total: INR ${payload.summary.total.toFixed(2)}`);
    doc.moveDown().fontSize(9).text('Review and reconciliation copy. This file does not submit a return to the GST portal.'); doc.moveDown();
    for (const row of payload.documents) {
      doc.fontSize(9).text(`${row.invoiceNo || 'Summary'} | ${row.date || '-'} | ${row.name || '-'} | ${row.gstin || 'B2C'} | Taxable INR ${(Number(row.taxable) || 0).toFixed(2)} | GST INR ${totals([row]).tax.toFixed(2)}`); doc.moveDown(.4);
    }
    doc.end();
  });
}
export async function exportGstr1Preparation(req) {
  const context = await loadGstr1Preparation(req);
  requireCurrent(context, req.body.expectedSourceHash);
  if (!context.state.exportReady && !context.recordedFiling) throw httpError(409, 'Validate and generate the current summary before exporting the return.');
  const format = req.body.format;
  if (!['csv', 'json', 'pdf'].includes(format)) throw httpError(400, 'Choose CSV, JSON or PDF.');
  const payload = { period: context.key.period, gstin: context.key.gstin, business: context.context.business, sourceHash: context.sourceHash, summary: context.state.summary, validation: context.state.validation, documents: sourceDocuments(context.source), hsn: context.source.hsn || [] };
  if (!payload.summary) throw httpError(409, 'The saved summary is unavailable. Refresh and review this return.');
  let content, mimeType, encoding = 'utf8';
  if (format === 'json') { content = JSON.stringify(payload, null, 2); mimeType = 'application/json'; }
  else if (format === 'pdf') { content = (await reviewPdf(payload)).toString('base64'); mimeType = 'application/pdf'; encoding = 'base64'; }
  else {
    const keys = ['invoiceNo', 'date', 'documentType', 'name', 'gstin', 'state', ...fields];
    const quote = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    content = '\uFEFF' + [keys, ...payload.documents.map(row => keys.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n'); mimeType = 'text/csv;charset=utf-8';
  }
  await persist(context, `exported-${format}`, { ...context.saved.preparation, exportedAt: new Date().toISOString() });
  return { filename: `GSTR-1-Review-${context.key.period.replace(' ', '-')}.${format}`, content, mimeType, encoding, sourceHash: context.sourceHash, workflow: { ...context.state, exportedAt: context.saved.preparation.exportedAt, history: context.saved.preparation.history } };
}
