import { automobileInvoiceRow } from './automobileInvoices.js';

const text = (value) => String(value || '').trim().toLowerCase();
const phone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
export const customerCode = (customer) => `C-${String(customer._id || '').slice(-6).toUpperCase()}`;
export function findInvoiceCustomer(customers, party = {}) {
  let matches = [];
  if (party.gstin) matches = customers.filter((row) => text(row.gstin) === text(party.gstin));
  if (!matches.length && phone(party.phone)) matches = customers.filter((row) => phone(row.phone) === phone(party.phone) && (!party.gstin || !row.gstin || text(row.gstin) === text(party.gstin)));
  if (!matches.length && party.name) matches = customers.filter((row) => text(row.name) === text(party.name) && (!party.gstin || !row.gstin || text(row.gstin) === text(party.gstin)) && (!party.phone || !row.phone || phone(row.phone) === phone(party.phone)));
  return matches.length === 1 ? matches[0] : null;
}
export function customerSummaries(customers, invoices) {
  const map = new Map(customers.map((row) => [String(row._id), { ...row, invoices: [], outstanding: 0, lastInvoice: '' }]));
  for (const source of invoices) {
    if (!['invoice', 'bill-of-supply'].includes(source.documentType || 'invoice')) continue;
    if (['draft', 'cancelled'].includes(source.lifecycleStatus)) continue;
    const match = findInvoiceCustomer(customers, source.customer);
    if (!match) continue;
    const row = map.get(String(match._id));
    const invoice = automobileInvoiceRow(source);
    row.invoices.push(invoice); row.outstanding += invoice.balanceDue;
    if (invoice.date > row.lastInvoice) row.lastInvoice = invoice.date;
  }
  return [...map.values()].map((row) => ({ ...row, outstanding: Math.round(row.outstanding * 100) / 100, invoices: row.invoices.sort((a, b) => b.date.localeCompare(a.date)) }));
}
export function filterCustomers(rows, filters) {
  return rows.filter((row) => (!filters.status || row.status === filters.status)
    && (!filters.type || row.customerType === filters.type)
    && (!filters.city || row.city === filters.city)
    && (!filters.from || String(row.createdAt || '').slice(0, 10) >= filters.from)
    && (!filters.to || String(row.createdAt || '').slice(0, 10) <= filters.to)
    && [row.name, row.phone, row.email, row.gstin, customerCode(row)].join(' ').toLowerCase().includes(text(filters.search)));
}
