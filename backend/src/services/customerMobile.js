import { httpError } from '../utils/httpError.js';

export function customerMobileDigits(value) {
  const text = String(value || '').trim();
  if (!/^[+\d\s()-]+$/.test(text)) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.length === 10 ? digits : '';
}

export function customerMobileError(value) {
  if (!String(value || '').trim()) return 'Customer mobile number is required.';
  return customerMobileDigits(value) ? '' : 'Enter a valid 10-digit customer mobile number.';
}

export function assertBillingCustomerMobile(invoice) {
  if (!['invoice', 'bill-of-supply', 'pharmacy-bill'].includes(invoice.documentType)
    || !['b2b', 'b2c'].includes(invoice.extra?.billingMode)) return;
  const error = customerMobileError(invoice.customer?.phone);
  if (error) throw httpError(400, error);
}
