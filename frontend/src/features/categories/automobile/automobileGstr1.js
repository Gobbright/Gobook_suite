export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isCredit = (row) => ['credit-note', 'sales-return'].includes(row.documentType);
export const isDebit = (row) => row.documentType === 'debit-note';
export const gstinStatus = (row) => !row.gstin ? 'Unregistered' : GSTIN_PATTERN.test(row.gstin) ? 'Format valid' : 'Invalid format';
const amount = (value) => Number(value) || 0;
export function gstr1Documents(data = {}) {
  if (Array.isArray(data.sourceDocuments)) return data.sourceDocuments.map((row, index) => ({ ...row, key: `${row.sourceId || row.invoiceNo}-${index}` }));
  return [
    ...(data.b2b || []).map((row) => ({ ...row, documentType: 'invoice' })),
    ...(data.b2cs || []).map((row) => ({ ...row, documentType: 'b2c-summary', invoiceNo: '', name: 'B2C summary' })),
    ...(data.cdnr || []).map((row) => ({ ...row, invoiceNo: row.noteNo, date: row.noteDate, documentType: row.noteType === 'Debit Note' ? 'debit-note' : 'credit-note', ...Object.fromEntries(['taxable', 'cgst', 'sgst', 'igst'].map((field) => [field, Math.abs(amount(row[field])) * (row.noteType === 'Debit Note' ? 1 : -1)])) })),
  ].map((row, index) => ({ ...row, key: `snapshot-${index}` }));
}
export function filterGstr1Documents(rows, filters) {
  const search = (filters.search || '').trim().toLowerCase();
  return rows.filter((row) => (!filters.branch || row.branch === filters.branch)
    && (!filters.type || row.documentType === filters.type)
    && (!filters.gstin || gstinStatus(row) === filters.gstin)
    && [row.invoiceNo, row.name, row.gstin, row.state].join(' ').toLowerCase().includes(search));
}
export function gstr1RateSummary(rows) {
  const grouped = new Map();
  for (const doc of rows) {
    for (const row of doc.rateRows || [doc]) {
      const rate = amount(row.rate);
      if (!grouped.has(rate)) grouped.set(rate, { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
      const total = grouped.get(rate);
      for (const key of ['taxable', 'cgst', 'sgst', 'igst']) total[key] += amount(row[key]);
    }
  }
  return [...grouped.values()].sort((a, b) => a.rate - b.rate);
}
export function validateGstr1(rows, period, gstin) {
  const issues = [];
  const add = (row, message, blocking = true) => issues.push({ key: `${row.key || 'business'}-${issues.length}`, invoiceNo: row.invoiceNo || 'Business', rowKey: row.key, message, blocking });
  if (!gstin || !GSTIN_PATTERN.test(gstin)) add({}, 'Business GSTIN is missing or has an invalid format.');
  const date = new Date(`1 ${period}`);
  const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const seen = new Set();
  for (const row of rows) {
    if (row.gstin && !GSTIN_PATTERN.test(row.gstin)) add(row, 'Customer GSTIN has an invalid format.');
    if (row.documentType !== 'b2c-summary' && !row.invoiceNo) add(row, 'Document number is missing.');
    if (row.documentType !== 'b2c-summary' && (!row.date || !row.date.startsWith(prefix))) add(row, 'Document date is outside the selected tax period.');
    if (!row.state || row.state === 'N/A') add(row, 'Place of supply is missing.');
    if (row.missingHsn > 0) add(row, `${row.missingHsn} item(s) have no HSN/SAC.`, false);
    if (!Number.isFinite(Number(row.taxable))) add(row, 'Taxable amount is invalid.');
    const identity = `${row.documentType}|${row.invoiceNo}|${row.gstin || ''}`;
    if (row.invoiceNo && seen.has(identity)) add(row, 'Duplicate document number in this section.');
    seen.add(identity);
  }
  return issues;
}
