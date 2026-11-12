import { downloadPdf } from '../../../../../utils/exportData.js';

const columns = [{ key: 'description', label: 'Description' }, { key: 'qty', label: 'Quantity' }, { key: 'rate', label: 'Rate' }, { key: 'amount', label: 'Amount' }];

export function downloadHospitalInvoice(invoice) {
  const items = invoice.items || [];
  downloadPdf({
    title: `${invoice.invoiceNo} - ${invoice.patient} (${invoice.patientId})`, filename: invoice.invoiceNo,
    columns,
    rows: [
      ...items.map((item) => ({ description: item.description || item.name || item.service || item.medicine || 'Service', qty: item.qty ?? item.quantity ?? 1, rate: item.rate ?? item.price ?? '', amount: item.amount ?? (Number(item.qty ?? item.quantity ?? 1) * Number(item.rate ?? item.price ?? 0)) })),
      ...[['Subtotal', invoice.subtotal], ['Discount', invoice.discount], ['Insurance', invoice.insurance], ['Tax', invoice.tax], ['Total', invoice.total], ['Paid', invoice.paid], ['Balance', invoice.balance]].map(([description, amount]) => ({ description, amount })),
    ],
  });
}

export function downloadHospitalReceipt(payment) {
  downloadPdf({ title: `Payment Receipt ${payment.receiptNo}`, filename: payment.receiptNo, columns: [{ key: 'field', label: 'Field' }, { key: 'value', label: 'Value' }], rows: Object.entries({ Receipt: payment.receiptNo, Invoice: payment.invoiceNo, Patient: payment.patient, Amount: payment.amount, Method: payment.method, Date: payment.date, Cashier: payment.cashier, Status: payment.status }).map(([field, value]) => ({ field, value })) });
}
