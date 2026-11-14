import { GstReconciliation } from '../models/GstReconciliation.js';
import { Gstr1 } from '../models/Gstr1.js';
import { gstDashboardContext } from './gstDashboardContext.js';
import { buildPurchaseReconciliationFromSales, buildGstr1FromSales } from './gstFromSales.js';
import { gstr3bPeriod } from './gstr3bData.js';
import { reconcileInvoices, reconciliationTotals, digest, round } from './reconciliationMatching.js';
import { httpError } from '../utils/httpError.js';

const heads = ['igst', 'cgst', 'sgst', 'cess'];
const gst = row => round(heads.reduce((total, head) => total + (Number(row[head]) || 0), 0));
const amount = value => value == null || value === '' ? null : round(value);
const clean = row => ({ id: row.id, sourceId: row.sourceId || null, origin: row.origin || '', branch: row.branch || '', supplier: String(row.supplier || ''), gstin: String(row.gstin || '').trim().toUpperCase(), invoiceNo: String(row.invoiceNo || '').trim(), date: row.date || '', taxable: amount(row.taxable), gst: Number(row.gst) || 0, ...Object.fromEntries(heads.map(head => [head, amount(row[head])])), statementEligibility: row.statementEligibility || 'unknown' });
function records(input, period, side) {
  if (!Array.isArray(input) || !input.length || input.length > 5000) throw httpError(400, 'Import between 1 and 5,000 invoice rows.');
  return input.map((row, index) => {
    if (!row || typeof row.invoiceNo !== 'string' || !row.invoiceNo.trim() || row.invoiceNo.length > 160 || (row.supplier != null && typeof row.supplier !== 'string') || String(row.supplier || '').length > 250 || (row.gstin != null && typeof row.gstin !== 'string')) throw httpError(400, `Row ${index + 1}: enter an invoice number and valid text fields.`);
    if (row.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(row.gstin.trim().toUpperCase())) throw httpError(400, `Row ${index + 1}: GSTIN has an invalid format.`);
    if (row.period && (typeof row.period !== 'string' || row.period.toLowerCase() !== period.toLowerCase())) throw httpError(400, 'The imported return period does not match this workspace.');
    if (row.date && (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date)) throw httpError(400, `Row ${index + 1}: use a valid invoice date in YYYY-MM-DD format.`);
    for (const key of ['taxable', 'gst', ...heads]) if (row[key] != null && row[key] !== '' && (!Number.isFinite(Number(row[key])) || Math.abs(Number(row[key])) > 1e13)) throw httpError(400, `Row ${index + 1}: invalid ${key} amount.`);
    if (row.gst == null || row.gst === '') throw httpError(400, `Row ${index + 1}: total GST is required, including explicit zero.`);
    if (heads.every(head => row[head] != null && row[head] !== '') && Math.abs(gst(row) - Number(row.gst)) >= .02) throw httpError(400, `Row ${index + 1}: tax heads do not equal total GST.`);
    if (row.statementEligibility && !['eligible', 'ineligible', 'unknown'].includes(row.statementEligibility)) throw httpError(400, 'Statement eligibility must be eligible, ineligible or unknown.');
    const normalized = clean({ ...row, origin: side === 'portal' ? 'uploaded statement' : 'uploaded purchase register' });
    // Replacing an import is idempotent, while duplicate source rows remain distinct and visible.
    normalized.id = `${side}:${digest([normalized, index]).slice(0, 24)}`;
    return normalized;
  });
}
const legacyPortal = saved => (saved?.entries || []).filter(row => row.statementRecorded || Number(row.itcGstr2b) > 0).map((row, index) => clean({ id: `legacy:${row._id || index}`, supplier: row.supplier, gstin: row.gstin, invoiceNo: row.invoiceNo, gst: row.itcGstr2b, origin: 'legacy statement ITC only' }));

export async function loadWorkspace(req, input) {
  const period = gstr3bPeriod(input?.period), type = input?.type || '2b';
  if (!['2b', '2a', '1'].includes(type)) throw httpError(400, 'Choose purchase GSTR-2B or sales GSTR-1 reconciliation.');
  const context = await gstDashboardContext({ ...req, query: {} });
  const key = { userId: req.user.id, gstin: context.gstin, period, type };
  const saved = await GstReconciliation.findOne(key).lean();
  const ws = saved?.workspace || {};
  let books, defaultPortal = [], source = 'No statement imported';
  if (type === '1') {
    const [generated, monthly] = await Promise.all([buildGstr1FromSales({ ...key, invoiceScope: context.invoiceScope }), Gstr1.findOne({ userId: req.user.id, gstin: context.gstin, period, filingType: 'monthly' }).lean()]);
    const convert = (row, index, origin) => clean({ ...row, id: `${origin}:${row.sourceId || index}`, supplier: row.name, gst: gst(row), origin });
    books = generated.sourceDocuments.filter(row => row.documentType !== 'e-way-bill').map((row, index) => convert(row, index, 'billing'));
    const documents = Array.isArray(monthly?.sourceDocuments) ? monthly.sourceDocuments : (monthly?.b2b || []).filter(row => row.invoiceNo);
    defaultPortal = documents.filter(row => row.documentType !== 'e-way-bill').map((row, index) => convert(row, index, 'saved-gstr1'));
    if (monthly) source = `Saved GSTR-1 ${monthly.status === 'filed' && !['manual', 'provider'].includes(monthly.filing?.source) ? 'unverified filed' : monthly.status || 'draft'} snapshot (not a live portal connection)`;
  } else {
    const generated = await buildPurchaseReconciliationFromSales({ ...key, invoiceScope: context.invoiceScope });
    books = generated.entries.map(row => clean({ ...row, id: `billing:${row.sourceId}`, origin: 'billing', taxable: row.bookTax?.taxable, gst: row.itcBooks, ...row.bookTax }));
    defaultPortal = legacyPortal(saved);
    if (defaultPortal.length) source = 'Saved legacy ITC amounts; date and taxable values need importing';
  }
  const uploaded = ws.register || [];
  const booksByIdentity = new Set(books.map(row => `${row.gstin}|${row.invoiceNo.toUpperCase()}`));
  const supplemental = uploaded.filter(row => !booksByIdentity.has(`${row.gstin}|${row.invoiceNo.toUpperCase()}`));
  books = [...books, ...supplemental];
  const portalSource = ws.portalSource || (type === '1' && !Array.isArray(ws.portal) ? 'saved' : 'upload');
  const portals = type === '1' && portalSource === 'saved' ? defaultPortal : Array.isArray(ws.portal) ? ws.portal : defaultPortal;
  if (Array.isArray(ws.portal) && portalSource === 'upload') source = 'Uploaded statement records';
  const bookIds = new Set(books.map(row => row.id)), portalIds = new Set(portals.map(row => row.id));
  const workspace = { ...ws, portalSource, portal: portals, register: uploaded, links: (ws.links || []).filter(row => bookIds.has(row.bookId) && portalIds.has(row.portalId)), blocked: (ws.blocked || []).filter(row => bookIds.has(row.bookId) && portalIds.has(row.portalId)), decisions: ws.decisions || [], history: ws.history || [] };
  const rows = reconcileInvoices(books, portals, workspace);
  const sourceHash = digest([books, portals, workspace.links, workspace.blocked, workspace.decisions, saved?.__v || 0]);
  return { key, saved, workspace, books, portals, rows, sourceHash, result: { period, type, business: context.business, gstin: context.gstin, branchScope: context.branch || 'Permitted business records', generatedAt: new Date().toISOString(), sourceHash, rows, summary: reconciliationTotals(rows), history: workspace.history, statementSource: source,
    register: { uploaded: uploaded.length, supplemental: supplemental.length, sourceDuplicatesSkipped: uploaded.length - supplemental.length },
    capabilities: { portalConnection: false, statutoryEligibilityVerification: false },
    matchingRules: { exact: 'GSTIN, invoice number, date, taxable value and GST match to the cent', partial: 'Same invoice identity with missing fields, date differences or amount differences up to INR 1', probable: 'Same GSTIN with punctuation-normalized number, or equal amounts within seven days; requires review', mismatch: 'Same identity with a GSTIN conflict or amount difference above INR 1' },
  } };
}

export async function mutateWorkspace(req) {
  const body = req.body || {};
  const fields = ['period', 'type', 'expectedSourceHash', 'action', 'records', 'filename', 'bookId', 'portalId', 'note', 'rowIds', 'resolution', 'eligibility'];
  if (Object.keys(body).some(key => !fields.includes(key))) throw httpError(400, 'Use the reconciliation import, matching or review actions.');
  const loaded = await loadWorkspace(req, body);
  if (!body.expectedSourceHash || body.expectedSourceHash !== loaded.sourceHash) throw httpError(409, 'Reconciliation source data changed. Refresh and review again.');
  const ws = structuredClone(loaded.workspace), action = body.action;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 1000) throw httpError(400, 'Review notes must be at most 1,000 characters.');
  let detail = '';
  if (action === 'importPortal' || action === 'importRegister') {
    if (action === 'importRegister' && loaded.key.type === '1') throw httpError(400, 'Sales books come from billing. Import the GSTR-1 statement instead.');
    const imported = records(body.records, loaded.key.period, action === 'importPortal' ? 'portal' : 'register');
    if (action === 'importPortal' && loaded.key.type !== '1' && imported.some(row => !row.gstin)) throw httpError(400, 'GSTR-2B statement invoices need a supplier GSTIN.');
    if (action === 'importPortal') { ws.portal = imported; ws.portalSource = 'upload'; ws.links = []; ws.blocked = []; }
    else ws.register = imported;
    detail = `${String(body.filename || 'Upload').slice(0, 160)}: ${imported.length} rows; replaces previous ${action === 'importPortal' ? 'statement' : 'uploaded register'}`;
  } else if (action === 'auto') detail = 'Recalculated using current books, statement records and saved manual links';
  else if (action === 'useSavedGstr1') {
    if (loaded.key.type !== '1') throw httpError(400, 'Choose the sales workspace to import a saved GSTR-1 snapshot.');
    ws.portalSource = 'saved'; ws.portal = []; ws.links = []; ws.blocked = []; detail = 'Use the current saved GSTR-1 snapshot; no portal submission or sync is claimed';
  }
  else if (action === 'link') {
    const book = loaded.books.find(row => row.id === body.bookId), portal = loaded.portals.find(row => row.id === body.portalId);
    if (!book || !portal || !note) throw httpError(400, 'Choose a permitted book invoice, a statement invoice and a matching explanation.');
    const other = loaded.rows.find(row => row.portal?.id === portal.id && row.book && row.book.id !== book.id);
    if (other || ws.links.some(row => row.portalId === portal.id && row.bookId !== book.id)) throw httpError(409, 'This statement invoice is already linked. Unlink its current match first.');
    ws.links = ws.links.filter(row => row.bookId !== book.id); ws.links.push({ bookId: book.id, portalId: portal.id, note });
    ws.decisions = ws.decisions.filter(row => row.id !== `b:${book.id}` && row.id !== `p:${portal.id}`);
    ws.blocked = ws.blocked.filter(row => !(row.bookId === book.id && row.portalId === portal.id)); detail = `${book.invoiceNo} linked to ${portal.invoiceNo}: ${note}`;
  } else if (action === 'unlink') {
    const row = loaded.rows.find(row => row.book?.id === body.bookId && row.portal);
    if (!row || !note) throw httpError(400, 'Choose a paired invoice and explain why it should be unlinked.');
    ws.links = ws.links.filter(link => link.bookId !== row.book.id);
    ws.decisions = ws.decisions.filter(item => item.id !== row.id);
    ws.blocked.push({ bookId: row.book.id, portalId: row.portal.id }); detail = `${row.book.invoiceNo}: ${note}`;
  } else if (action === 'resolve' || action === 'eligibility') {
    if (!Array.isArray(body.rowIds) || !body.rowIds.length || body.rowIds.length > 5000 || new Set(body.rowIds).size !== body.rowIds.length || body.rowIds.some(id => !loaded.rows.some(row => row.id === id))) throw httpError(400, 'Choose current permitted reconciliation records.');
    if (!note) throw httpError(400, 'A review explanation is required.');
    if (action === 'resolve' && !['accepted', 'rejected', 'none'].includes(body.resolution)) throw httpError(400, 'Choose accepted, rejected or none.');
    if (action === 'eligibility' && (!['eligible', 'ineligible', 'review'].includes(body.eligibility) || loaded.key.type === '1')) throw httpError(400, 'Choose an ITC review status for purchase records.');
    for (const id of body.rowIds) {
      const row = loaded.rows.find(row => row.id === id);
      if (action === 'eligibility' && body.eligibility === 'eligible' && (!row.book || !row.portal || row.duplicate || row.ambiguous || row.portal.statementEligibility === 'ineligible' || row.resolution === 'rejected')) throw httpError(400, 'Resolve duplicate, missing, rejected or statement-ineligible invoices before marking ITC eligible.');
      if (action === 'resolve' && body.resolution === 'accepted' && (!row.book || !row.portal || row.ambiguous || row.duplicate)) throw httpError(400, 'Link and resolve duplicate or missing records before accepting a match.');
      const old = ws.decisions.find(item => item.id === id && item.fingerprint === row.fingerprint) || { id, fingerprint: row.fingerprint, resolution: 'none', eligibility: 'review' };
      ws.decisions = ws.decisions.filter(item => item.id !== id);
      ws.decisions.push(action === 'resolve' ? { ...old, resolution: body.resolution, note, ...(body.resolution === 'rejected' ? { eligibility: 'review' } : {}) } : { ...old, eligibility: body.eligibility, eligibilityNote: note });
    }
    detail = `${body.rowIds.length} record(s): ${action === 'resolve' ? body.resolution : body.eligibility}; ${note}`;
  } else throw httpError(400, 'Choose an import, auto-match, manual-link or review action.');
  ws.history = [...ws.history, { action, detail, date: new Date().toISOString(), actor: String(req.user.id) }].slice(-200);
  // Compatibility projection for the existing dashboard and GSTR-3B comparison.
  // Uploaded register entries never become accounting invoices or claimed ITC.
  const nextBooks = action === 'importRegister' ? [...loaded.books.filter(row => row.origin !== 'uploaded purchase register'), ...ws.register.filter(row => !loaded.books.some(book => book.origin !== 'uploaded purchase register' && book.gstin === row.gstin && book.invoiceNo.toUpperCase() === row.invoiceNo.toUpperCase()))] : loaded.books;
  const matched = reconcileInvoices(nextBooks, ws.portal, ws);
  const entries = matched.map(row => { const identity = row.portal || row.book; return { supplier: identity.supplier, gstin: identity.gstin, invoiceNo: identity.invoiceNo, date: identity.date, invoiceValue: round((row.book?.taxable || 0) + (row.book?.gst || 0)), itcBooks: row.book?.gst || 0, itcGstr2b: row.portal?.gst || 0, statementRecorded: Boolean(row.portal), diff: row.gstDifference, status: row.status, resolution: row.resolution === 'accepted' ? 'accepted' : row.resolution === 'rejected' ? 'disputed' : 'none' }; });
  try {
    if (loaded.saved) {
      const match = { _id: loaded.saved._id, ...(loaded.saved.__v == null ? { $or: [{ __v: { $exists: false } }, { __v: 0 }] } : { __v: loaded.saved.__v }) };
      if (!await GstReconciliation.findOneAndUpdate(match, { $set: { workspace: ws, entries }, $inc: { __v: 1 } }, { new: true, runValidators: true })) throw httpError(409, 'Another review changed this workspace. Refresh and try again.');
    } else await GstReconciliation.create({ ...loaded.key, workspace: ws, entries });
  } catch (error) { if (error.code === 11000) throw httpError(409, 'Another review changed this workspace. Refresh and try again.'); throw error; }
  return (await loadWorkspace(req, loaded.key)).result;
}
