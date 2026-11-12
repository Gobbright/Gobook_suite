import { downloadReportTableCsv } from '../services/reportDownloadService.js';

export function exportRows(name, rows, fields) {
  const columns = (fields?.length ? fields : [...new Set(rows.flatMap((row) => Object.keys(row)))]).filter((key) => !/password|secret|token/i.test(key));
  downloadReportTableCsv(name, columns, rows.map((row) => columns.map((key) => {
    const value = row[key];
    return value && typeof value === 'object' ? JSON.stringify(value) : value ?? '';
  })));
}
