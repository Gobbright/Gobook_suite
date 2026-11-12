import { findInvoiceCustomer } from './automobileCustomers.js';
import { purchaseEntryRow } from './automobilePurchaseEntries.js';
export const vendorCode = (vendor) => `VE-${String(vendor._id || '').slice(-6).toUpperCase()}`;
export function vendorSummaries(vendors, purchases, returns = [], accounts = []) {
  const map = new Map(vendors.map((vendor) => {
    const ledgers = accounts.filter((account) => String(account.name || '').trim().toLowerCase() === vendor.name.trim().toLowerCase());
    return [String(vendor._id), { ...vendor, purchases: [], returns: [], payable: 0, lastPurchase: '', ledger: ledgers.length === 1 ? ledgers[0] : null }];
  }));
  for (const purchase of purchases) {
    if (purchase.documentType !== 'purchase-entry' || ['draft', 'cancelled'].includes(purchase.lifecycleStatus)) continue;
    const vendor = findInvoiceCustomer(vendors, purchase.customer); if (!vendor) continue;
    const summary = map.get(String(vendor._id)); const row = purchaseEntryRow(purchase);
    summary.purchases.push(row); summary.payable += row.balanceDue;
    if (row.date > summary.lastPurchase) summary.lastPurchase = row.date;
  }
  for (const note of returns) {
    if (note.lifecycleStatus === 'cancelled') continue;
    const vendor = findInvoiceCustomer(vendors, note.customer); if (vendor) map.get(String(vendor._id)).returns.push(note);
  }
  return [...map.values()].map((vendor) => ({ ...vendor, payable: Math.round(vendor.payable * 100) / 100, purchases: vendor.purchases.sort((a, b) => b.date.localeCompare(a.date)), pendingReturns: vendor.returns.filter((row) => row.lifecycleStatus === 'draft' || row.accounting?.posted === false || ['requested', 'received'].includes(row.returnStatus)).length }));
}
export function filterVendors(vendors, filters) {
  return vendors.filter((vendor) => (!filters.status || vendor.status === filters.status) && (!filters.category || vendor.category === filters.category) && (!filters.branch || vendor.branch === filters.branch) && (filters.days === '' || String(vendor.creditDays ?? '') === filters.days) && [vendor.name, vendor.contact, vendor.phone, vendor.email, vendor.gstin, vendorCode(vendor)].join(' ').toLowerCase().includes(String(filters.search || '').trim().toLowerCase()));
}
export function vendorDueDate(purchase, vendor) {
  if (purchase.meta?.dueDate) return purchase.meta.dueDate;
  if (!purchase.date || vendor.creditDays === null || vendor.creditDays === undefined || vendor.creditDays === '') return '';
  const date = new Date(`${purchase.date}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + Number(vendor.creditDays));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
