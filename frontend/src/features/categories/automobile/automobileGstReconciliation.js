export const reconciliationKey = (row) => `${String(row.gstin || '').trim().toUpperCase()}|${String(row.invoiceNo || '').trim().toLowerCase()}`;
export function matchReconciliation(rows) {
  return rows.map((row) => {
    const diff = Math.round(((Number(row.itcBooks) || 0) - (Number(row.itcGstr2b) || 0)) * 100) / 100;
    return { ...row, diff, status: Math.abs(diff) < 0.01 ? 'matched' : row.statementRecorded || Number(row.itcGstr2b) > 0 ? 'mismatch' : 'not_in_2b' };
  });
}
export function reconciliationSummary(rows) {
  const sum = (list, field) => list.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const matched = rows.filter((row) => row.status === 'matched');
  const missing = rows.filter((row) => row.status === 'not_in_2b');
  const differences = rows.filter((row) => row.status === 'mismatch');
  const pending = rows.filter((row) => row.status !== 'matched' && (!row.resolution || row.resolution === 'none'));
  return { matched, missing, differences, pending, books: sum(rows, 'itcBooks'), statement: sum(rows, 'itcGstr2b'), risk: rows.reduce((total, row) => total + Math.abs(Number(row.diff) || 0), 0), completion: rows.length ? matched.length / rows.length * 100 : 0 };
}
export function filterReconciliation(rows, filters) {
  return rows.filter((row) => (!filters.status || row.status === filters.status)
    && (!filters.branch || row.branch === filters.branch)
    && (!filters.pending || row.status !== 'matched' && (!row.resolution || row.resolution === 'none'))
    && (!filters.unmatched || row.status !== 'matched')
    && [row.gstin, row.supplier].join(' ').toLowerCase().includes((filters.party || '').trim().toLowerCase())
    && [row.invoiceNo, row.supplier, row.gstin].join(' ').toLowerCase().includes((filters.search || '').trim().toLowerCase()));
}
export function parseReconciliationCsv(text, required = ['invoiceno', 'gstin', 'itcgstr2b']) {
  const records = []; let row = []; let cell = ''; let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) records.push(row); row = []; cell = ''; if (ch === '\r' && source[i + 1] === '\n') i++; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row);
  const headers = (records.shift() || []).map((header) => header.toLowerCase());
  if (!required.every((key) => headers.includes(key))) throw new Error(`CSV headers must include ${required.join(',')}.`);
  return records.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
}
export function parseWorkspaceImport(text, filename = '') {
  let records;
  if (filename.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(records)) throw new Error('Use a normalized JSON array of invoice records. Raw portal JSON must be converted to the supplied template first.');
    records = records.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])));
  } else records = parseReconciliationCsv(text, ['invoiceno', 'gstin']);
  const numeric = value => {
    if (value == null || value === '') return null;
    const amount = Number(String(value).replaceAll(',', ''));
    if (!Number.isFinite(amount)) throw new Error('Import contains an invalid numeric amount.');
    return amount;
  };
  return records.map(row => ({ invoiceNo: row.invoiceno, gstin: row.gstin || '', supplier: row.supplier || row.name || '', date: row.date || '', period: row.period || '', taxable: numeric(row.taxable), gst: numeric(row.gst ?? row.itcgstr2b), igst: numeric(row.igst), cgst: numeric(row.cgst), sgst: numeric(row.sgst), cess: numeric(row.cess), statementEligibility: row.statementeligibility || 'unknown' }));
}
export function filterWorkspace(rows, filters) {
  return rows.filter(row => {
    const identity = row.book || row.portal;
    const text = [identity.supplier, identity.gstin, identity.invoiceNo, row.portal?.invoiceNo, row.reviewNote, row.eligibilityNote].join(' ').toLowerCase();
    return (!filters.search || text.includes(filters.search.trim().toLowerCase()))
      && (!filters.exceptions || row.status !== 'matched' || row.duplicate)
      && (!filters.status || row.status === filters.status)
      && (!filters.party || identity.gstin === filters.party || identity.supplier === filters.party)
      && (!filters.eligibility || row.eligibility === filters.eligibility)
      && (!filters.resolution || row.resolution === filters.resolution)
      && (!filters.duplicates || row.duplicate)
      && (!filters.difference || Math.max(Math.abs(row.gstDifference || 0), Math.abs(row.taxableDifference || 0)) >= Number(filters.difference));
  });
}
export function importReconciliationCsv(entries, text, period) {
  const records = parseReconciliationCsv(text); const seen = new Set(); const updates = new Map(); const skipped = [];
  for (const row of records) {
    const key = reconciliationKey({ gstin: row.gstin, invoiceNo: row.invoiceno });
    const candidates = entries.filter((entry) => reconciliationKey(entry) === key);
    const amount = Number(row.itcgstr2b.replaceAll(',', ''));
    if (seen.has(key)) throw new Error(`Duplicate statement record: ${row.invoiceno}.`);
    seen.add(key);
    if (row.period && row.period.toLowerCase() !== period.toLowerCase()) throw new Error(`Statement period does not match ${period}.`);
    if (!row.itcgstr2b || !Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ITC amount for ${row.invoiceno}.`);
    if (candidates.length !== 1) { skipped.push({ invoiceNo: row.invoiceno, reason: candidates.length ? 'Ambiguous purchase records' : 'No matching purchase GSTIN and invoice' }); continue; }
    updates.set(key, amount);
  }
  return { entries: matchReconciliation(entries.map((entry) => updates.has(reconciliationKey(entry)) ? { ...entry, itcGstr2b: updates.get(reconciliationKey(entry)), statementRecorded: true, resolution: 'none' } : entry)), imported: updates.size, skipped };
}
