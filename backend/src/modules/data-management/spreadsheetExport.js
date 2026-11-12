import ExcelJS from 'exceljs';
import { httpError } from '../../utils/httpError.js';

export function exportDateRange(from, to) {
  if (!from && !to) return null;
  const valid = (value) => { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
  if (from && !valid(from) || to && !valid(to) || from && to && from > to) throw httpError(400, 'Choose a valid export date range');
  return { from: from || '', to: to || '' };
}
function dateKey(value) {
  if (value == null || value === '') return '';
  if (/^\d{4}-\d{2}$/.test(String(value))) return `${value}-01`;
  const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function recordInExportRange(record, collection, range) {
  if (!range) return true;
  const fields = collection.key === 'leaves' ? ['from', 'createdAt'] : collection.dateFields || ['createdAt'];
  const values = fields.map((field) => field.split('.').reduce((value, key) => value?.[key], record));
  const day = values.map(dateKey).find(Boolean);
  return Boolean(day && (!range.from || day >= range.from) && (!range.to || day <= range.to));
}
export function recordInExportCategory(record, key, category) {
  if (key === 'invoices' && ['sales', 'purchase'].includes(category)) {
    const purchase = ['purchase-order', 'purchase-entry', 'supplier-return'].includes(record.documentType);
    return category === 'purchase' ? purchase : !purchase;
  }
  if (key === 'moduleRecords' && category === 'online') return /online[-/]?store/i.test(record.moduleKey || '');
  return true;
}
const PRIVATE_FIELDS = new Set(['password', 'passwordHash', 'loginPassword', 'accessToken', 'refreshToken', 'token', 'smtpPass', 'emailSmtpPass', 'gspClientSecret', 'gspPassword', '__v']);
export function sanitizeExportValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeExportValue);
  if (value && typeof value === 'object') {
    if (value._bsontype === 'ObjectId') return String(value);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_FIELDS.has(key)).map(([key, item]) => [key, sanitizeExportValue(item)]));
  }
  return value;
}
function cell(value) { const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); return /^[=+@-]/.test(text) ? `'${text}` : text; }
export function exportTables(data) {
  return Object.entries(data).map(([key, documents]) => {
    const records = documents.map(sanitizeExportValue); const fields = [...new Set(records.flatMap((record) => Object.keys(record)))];
    return { key, fields, rows: records.map((record) => fields.map((field) => cell(record[field]))) };
  });
}
export async function createSpreadsheet(data, format) {
  const tables = exportTables(data);
  if (format === 'csv') {
    const fields = [...new Set(tables.flatMap((table) => table.fields))]; const rows = [['Collection', ...fields]];
    tables.forEach((table) => table.rows.forEach((values) => { const record = Object.fromEntries(table.fields.map((field, index) => [field, values[index]])); rows.push([table.key, ...fields.map((field) => record[field] || '')]); }));
    return Buffer.from('\uFEFF' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n'), 'utf8');
  }
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'GoBook Suite'; workbook.created = new Date();
  tables.forEach((table, index) => { const sheet = workbook.addWorksheet(`${index + 1}-${table.key}`.slice(0, 31)); sheet.addRow(table.fields.length ? table.fields : ['No records']); table.rows.forEach((row) => sheet.addRow(row.map((value) => value.slice(0, 32767)))); sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0874FF' } }; sheet.columns.forEach((column) => { column.width = 24; }); sheet.views = [{ state: 'frozen', ySplit: 1 }]; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
