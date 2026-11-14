import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const round = value => Math.round((Number(value) || 0) * 100) / 100;
export const invoiceKey = row => JSON.stringify([String(row.gstin || '').trim().toUpperCase(), String(row.invoiceNo || '').trim().toUpperCase()]);
const compact = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const day = value => value && !Number.isNaN(Date.parse(value)) ? Math.floor(Date.parse(value) / 86400000) : null;
const known = value => value != null && Number.isFinite(Number(value));
const add = (map, key, row) => { if (!map.has(key)) map.set(key, []); map.get(key).push(row); };
const amountKey = row => `${row.gstin}|${round(row.taxable)}|${round(row.gst)}`;
export const STATUS_LABELS = { matched: 'Exact Match', partial: 'Partial Match', probable: 'Probable Match', mismatch: 'Mismatch', not_in_2b: 'Missing in 2B', not_in_books: 'Missing in Books' };

function comparison(book, portal) {
  const differences = [], missing = [];
  for (const field of ['taxable', 'gst', 'igst', 'cgst', 'sgst', 'cess']) {
    if (field !== 'taxable' && field !== 'gst' && !known(book[field]) && !known(portal[field])) continue;
    if (!known(book[field]) || !known(portal[field])) { if (['taxable', 'gst'].includes(field)) missing.push(field); continue; }
    if (Math.abs(round(book[field] - portal[field])) >= .01) differences.push({ field, amount: round(book[field] - portal[field]) });
  }
  if (!book.date || !portal.date) missing.push('date');
  if (book.date && portal.date && book.date !== portal.date) differences.push({ field: 'date' });
  if (book.gstin !== portal.gstin) differences.push({ field: 'gstin' });
  if (String(book.invoiceNo).toUpperCase() !== String(portal.invoiceNo).toUpperCase()) differences.push({ field: 'invoiceNo' });
  const significant = differences.some(row => row.amount != null && Math.abs(row.amount) > 1 || row.field === 'gstin');
  return { status: significant ? 'mismatch' : differences.length || missing.length ? 'partial' : 'matched', differences, missing };
}

export function reconcileInvoices(books, portals, workspace = {}) {
  const exact = new Map(), normalized = new Map(), datedAmounts = new Map(), bookCounts = new Map();
  for (const book of books) bookCounts.set(invoiceKey(book), (bookCounts.get(invoiceKey(book)) || 0) + 1);
  for (const portal of portals) {
    add(exact, invoiceKey(portal), portal);
    add(normalized, `${portal.gstin}|${compact(portal.invoiceNo)}`, portal);
    if (known(portal.taxable) && known(portal.gst) && day(portal.date) != null) add(datedAmounts, `${amountKey(portal)}|${day(portal.date)}`, portal);
  }
  const manual = workspace.links || [], used = new Set(), rows = [];
  const manualByBook = new Map(manual.map(row => [row.bookId, row]));
  const portalById = new Map(portals.map(row => [row.id, row]));
  const decisions = new Map((workspace.decisions || []).map(row => [row.id, row]));
  const blocked = new Set((workspace.blocked || []).map(row => `${row.bookId}|${row.portalId}`));
  // Manual links reserve their statement record before automatic matching runs.
  const reserved = new Map(manual.map(row => [row.portalId, row.bookId]));
  function candidates(list, book) { return list.filter(row => !used.has(row.id) && (!reserved.has(row.id) || reserved.get(row.id) === book.id) && !blocked.has(`${book.id}|${row.id}`)); }
  function rowFor(book, portal, status, info = {}) {
    const fingerprint = digest([book || null, portal || null]);
    const id = book ? `b:${book.id}` : `p:${portal.id}`;
    const savedDecision = decisions.get(id), decision = savedDecision?.fingerprint === fingerprint ? savedDecision : null;
    return { id, book: book || null, portal: portal || null, status, ...info, fingerprint, resolution: decision?.resolution || 'none', reviewNote: decision?.note || '', eligibility: decision?.eligibility || 'review', eligibilityNote: decision?.eligibilityNote || '',
      taxableDifference: book && portal && known(book.taxable) && known(portal.taxable) ? round(book.taxable - portal.taxable) : !portal ? book?.taxable ?? null : !book && known(portal.taxable) ? -portal.taxable : null,
      gstDifference: book && portal ? round(book.gst - portal.gst) : book ? book.gst : -portal.gst,
      duplicate: Boolean(book && bookCounts.get(invoiceKey(book)) > 1 || portal && exact.get(invoiceKey(portal))?.length > 1),
      reviewInvalidated: !decision && Boolean(savedDecision),
    };
  }
  for (const book of books) {
    const link = manualByBook.get(book.id), explicit = link && portalById.get(link.portalId);
    if (explicit && !used.has(explicit.id)) { used.add(explicit.id); const result = comparison(book, explicit); rows.push(rowFor(book, explicit, result.status, { ...result, manual: true, linkNote: link.note })); continue; }
    const primary = candidates(exact.get(invoiceKey(book)) || [], book);
    if (primary.length === 1 && bookCounts.get(invoiceKey(book)) === 1 && exact.get(invoiceKey(primary[0]))?.length === 1) {
      const portal = primary[0]; used.add(portal.id); const result = comparison(book, portal); rows.push(rowFor(book, portal, result.status, result)); continue;
    }
    let possible = primary;
    if (!possible.length) possible = candidates(normalized.get(`${book.gstin}|${compact(book.invoiceNo)}`) || [], book);
    if (!possible.length && day(book.date) != null && known(book.taxable) && known(book.gst)) {
      for (let offset = -7; offset <= 7; offset++) possible.push(...candidates(datedAmounts.get(`${amountKey(book)}|${day(book.date) + offset}`) || [], book));
    }
    if (possible.length === 1 && bookCounts.get(invoiceKey(book)) === 1 && exact.get(invoiceKey(possible[0]))?.length === 1) {
      const portal = possible[0]; used.add(portal.id); rows.push(rowFor(book, portal, 'probable', { ...comparison(book, portal), status: 'probable', candidateIds: [portal.id] }));
    } else rows.push(rowFor(book, null, possible.length ? 'probable' : 'not_in_2b', { candidateIds: possible.map(row => row.id), ambiguous: possible.length > 0 }));
  }
  for (const portal of portals) if (!used.has(portal.id)) rows.push(rowFor(null, portal, 'not_in_books'));
  return rows;
}

export function reconciliationTotals(rows) {
  const sum = (records, field) => round(records.reduce((total, row) => total + (Number(row?.[field]) || 0), 0));
  const books = rows.filter(row => row.book), portals = rows.filter(row => row.portal);
  const total = side => ({ count: side.length, taxable: side.every(row => known(row.taxable)) ? sum(side, 'taxable') : null, gst: sum(side, 'gst'), value: side.every(row => known(row.taxable)) ? round(sum(side, 'taxable') + sum(side, 'gst')) : null });
  return { books: total(books.map(row => row.book)), portal: total(portals.map(row => row.portal)),
    statuses: Object.fromEntries(Object.keys(STATUS_LABELS).map(status => [status, rows.filter(row => row.status === status).length])),
    eligibleBooks: sum(books.filter(row => row.eligibility === 'eligible').map(row => row.book), 'gst'),
    eligiblePortal: sum(portals.filter(row => row.eligibility === 'eligible').map(row => row.portal), 'gst'),
    pending: rows.filter(row => row.resolution === 'none').length, duplicates: rows.filter(row => row.duplicate).length,
  };
}
