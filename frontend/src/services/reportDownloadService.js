import { API_BASE_URL } from './apiBase.js';
import { getToken } from './authToken.js';

function safeFilename(name = 'report') {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'}.csv`;
}

function filenameFromDisposition(disposition, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || '');
  return match?.[1] || fallback;
}

export async function downloadReportCsv(downloadKey, reportName, { branch = '' } = {}) {
  const token = getToken();
  const query = new URLSearchParams({ key: downloadKey });
  if (branch) query.set('branch', branch);
  const response = await fetch(`${API_BASE_URL}/more-modules/reports-download?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Report download failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFromDisposition(response.headers.get('Content-Disposition'), safeFilename(reportName));
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function quoteCsv(value) {
  return `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
}

function csvDownload(name, columns, rows) {
  const csv = [columns, ...rows].map((row) => row.map(quoteCsv).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: safeFilename(name) });
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export function downloadReportTableCsv(reportName, columns = [], rows = []) {
  csvDownload(reportName, columns, rows);
}

export function printReportTable(reportName, columns = [], rows = [], { subtitle = '' } = {}) {
  const frame = document.createElement('iframe');
  frame.title = `Print ${reportName}`;
  frame.style.cssText = 'position:fixed;left:-12000px;width:1100px;height:800px;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(reportName)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#17345c}h1{font-size:22px}p{color:#60738e}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dce7f5;padding:7px;text-align:left}th{background:#edf4fc}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${escapeHtml(reportName)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  doc.close();
  frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 100);
}

export async function downloadReportTablePdf(reportName, columns = [], rows = [], { subtitle = '' } = {}) {
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default || html2pdfModule;
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  const host = document.createElement('div');
  host.innerHTML = `<article style="font-family:Arial,sans-serif;color:#17345c;padding:24px;width:1100px"><h1 style="font-size:22px;margin:0 0 6px">${escapeHtml(reportName)}</h1><p style="color:#60738e;font-size:12px;margin:0 0 18px">${escapeHtml(subtitle || `${rows.length} records`)}</p><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></article>`;
  host.style.cssText = 'position:fixed;left:-12000px;top:0;z-index:-1';
  document.body.appendChild(host);
  try {
    await html2pdf().set({
      margin: 8,
      filename: safeFilename(reportName).replace(/\.csv$/, '.pdf'),
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    }).from(host.firstElementChild).save();
  } finally {
    host.remove();
  }
}

export async function downloadReportPdf(downloadKey, reportName, { branch = '' } = {}) {
  const token = getToken();
  const query = new URLSearchParams({ key: downloadKey });
  if (branch) query.set('branch', branch);
  const response = await fetch(`${API_BASE_URL}/more-modules/reports-download?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Report PDF download failed');
  }
  const parsed = parseCsv(await response.text());
  const columns = parsed.shift() || [];
  const rows = parsed;
  await downloadReportTablePdf(reportName, columns, rows, { subtitle: `${rows.length} records` });
}
