const supplied = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const amount = (value) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
export const invoiceBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function invoicePaymentSummary(invoice, total, today = invoiceBusinessDate()) {
  const lifecycleStatus = String(invoice.lifecycleStatus || 'posted').toLowerCase();
  const paidValue = [invoice.totalPaid, invoice.paidAmount, invoice.advanceReceived].find(supplied);
  const paid = amount(paidValue);
  const balanceValue = [invoice.balance, invoice.balanceDue, invoice.totals?.balanceDue, invoice.remainingBalance].find(supplied);
  const balanceDue = ['draft', 'cancelled'].includes(lifecycleStatus) ? 0
    : amount(supplied(balanceValue) ? balanceValue : Number(total) - amount(invoice.totalCredits) - paid);
  const dueDate = String(invoice.meta?.dueDate || invoice.dueDate || '').slice(0, 10);
  // Match the server: lifecycle first, then settled/partial balances, then overdue/unpaid.
  const paymentStatus = lifecycleStatus === 'draft' ? 'Draft' : lifecycleStatus === 'cancelled' ? 'Cancelled'
    : balanceDue <= 0 ? 'Paid' : paid > 0 ? 'Partial' : /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < today ? 'Overdue' : 'Unpaid';
  return { lifecycleStatus, paid, balanceDue, paymentStatus };
}

export function invoiceActionIds(invoice) {
  const state = String(invoice.lifecycleStatus || 'posted').toLowerCase();
  return ['workflow', ...(state === 'posted' && Number(invoice.balanceDue) > 0 ? ['payment'] : []), 'view', 'pdf', ...(state !== 'cancelled' ? ['edit'] : []), 'share', ...(state !== 'cancelled' ? ['delete'] : [])];
}
