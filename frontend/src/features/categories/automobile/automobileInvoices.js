import { creditAmounts } from './automobileCreditNotes.js';
import { invoicePaymentSummary } from '../../../utils/invoicePayment.js';

export function automobileInvoiceRow(invoice) {
  const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const amounts = creditAmounts(invoice.documentType === 'bill-of-supply' ? { ...invoice, items: (invoice.items || []).map((item) => ({ ...item, gstRate: 0 })), charges: (invoice.charges || []).map((charge) => ({ ...charge, gstRate: 0 })) } : invoice);
  const payment = invoicePaymentSummary(invoice, amounts.finalTotal);
  return {
    ...invoice, id: String(invoice._id || invoice.id || ''),
    customer: { name: '', phone: '', gstin: '', email: '', address: '', city: '', state: '', pincode: '', ...invoice.customer },
    number: invoice.number || 'Untitled invoice', date: invoice.meta?.date || '', dueDate: invoice.meta?.dueDate || '',
    supplyType: invoice.supplyType || 'intrastate',
    taxable: money(amounts.taxable + amounts.chargesSubtotal), gst: invoice.documentType === 'bill-of-supply' ? 0 : money(amounts.totalGst + amounts.chargesGst),
    total: money(amounts.finalTotal), roundOff: money(amounts.roundOff), ...payment,
  };
}
