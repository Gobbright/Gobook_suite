export const receivableId = (row) => String(row.id || row._id || '');
export const indiaToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const balanceOf = (row) => Math.max(0, amount(row.balance));
export function ageInDays(row, today = indiaToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate || '') || !Number.isFinite(Date.parse(row.dueDate)) || new Date(row.dueDate).toISOString().slice(0, 10) !== row.dueDate) return null;
  return Math.max(0, Math.floor((Date.parse(today) - Date.parse(row.dueDate)) / 86400000));
}
export function ageingBucket(row, today) {
  if (balanceOf(row) <= 0) return 'Paid';
  const days = ageInDays(row, today);
  return days === null ? 'No Due Date' : days === 0 ? 'Current' : days <= 30 ? '1–30 Days' : days <= 60 ? '31–60 Days' : days <= 90 ? '61–90 Days' : '90+ Days';
}
export const RECEIVABLE_BUCKETS = ['Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'No Due Date'];
export function receivablesSummary(rows, today) {
  const open = rows.filter((row) => balanceOf(row) > 0);
  const totalOutstanding = open.reduce((sum, row) => sum + balanceOf(row), 0);
  const totalPaid = rows.reduce((sum, row) => sum + Math.max(0, amount(row.totalPaid)), 0);
  const buckets = RECEIVABLE_BUCKETS.map((label) => ({ label, value: open.filter((row) => ageingBucket(row, today) === label).reduce((sum, row) => sum + balanceOf(row), 0) }));
  const customers = new Map();
  for (const row of open) { const name = row.customer || 'Unnamed customer'; const entry = customers.get(name) || { name, balance: 0, invoices: 0 }; entry.balance += balanceOf(row); entry.invoices++; customers.set(name, entry); }
  return { totalOutstanding, totalOverdue: open.filter((row) => ageInDays(row, today) > 0).reduce((sum, row) => sum + balanceOf(row), 0), totalPaid, coverage: totalPaid + totalOutstanding > 0 ? totalPaid / (totalPaid + totalOutstanding) * 100 : 0, customers: [...customers.values()].sort((a, b) => b.balance - a.balance), buckets };
}
export function filterReceivables(rows, filters, today) {
  const search = String(filters.search || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (balanceOf(row) <= 0) return false;
    if (filters.from && row.date < filters.from || filters.to && row.date > filters.to) return false;
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.bucket && ageingBucket(row, today) !== filters.bucket) return false;
    if (filters.status === 'Paid') return false;
    if (filters.status === 'Overdue' && !(ageInDays(row, today) > 0)) return false;
    if (filters.status === 'Partial' && !(amount(row.totalPaid) > 0)) return false;
    if (filters.status === 'Unpaid' && amount(row.totalPaid) > 0) return false;
    if (filters.status === 'Current' && ageInDays(row, today) !== 0) return false;
    return !search || [row.customer, row.number, row.customerPhone].filter(Boolean).join(' ').toLowerCase().includes(search);
  });
}
export const receivableViewHref = (row) => `/billing/${row.documentType === 'bill-of-supply' ? 'bill-of-supply' : 'invoice'}/${receivableId(row)}/view`;
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Online'];
export function validateReceivablePayment(row, form) {
  const value = Number(form.amount);
  if (!row || !receivableId(row) || balanceOf(row) <= 0) return 'Select an outstanding invoice.';
  if (!Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return 'Enter a positive amount with up to two decimal places.';
  if (Math.round(value * 100) > Math.round(balanceOf(row) * 100)) return 'Payment cannot exceed the selected invoice balance.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '') || !Number.isFinite(Date.parse(form.date)) || new Date(form.date).toISOString().slice(0, 10) !== form.date) return 'Enter a valid payment date.';
  if (!PAYMENT_METHODS.includes(form.method)) return 'Select a supported payment method.';
  return '';
}
