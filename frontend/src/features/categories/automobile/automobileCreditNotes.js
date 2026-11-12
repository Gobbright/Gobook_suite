export const creditId = (note) => String(note._id || note.id || '');
export const creditDate = (note) => (note.meta?.date || note.createdAt || '').slice(0, 10);
export const creditStatus = (note) => note.lifecycleStatus === 'cancelled' ? 'Cancelled' : note.lifecycleStatus === 'draft' ? 'Draft' : note.accounting?.posted === true ? 'Posted' : note.accounting?.posted === false ? 'Not Posted' : 'Posting Not Recorded';
const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const saved = (value, fallback) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
export function creditLine(item) {
  const gross = amount(item.qty) * amount(item.rate);
  const discount = item.discountType === 'amount' ? Math.min(gross, amount(item.discount)) : gross * amount(item.discount) / 100;
  const taxable = gross - discount;
  return { gross, discount, taxable, gst: taxable * amount(item.gstRate) / 100 };
}
export function creditAmounts(note) {
  const totals = { subtotal: 0, discount: 0, taxable: 0, totalGst: 0, gstByRate: {} };
  for (const item of note.items || []) {
    const line = creditLine(item); const rate = amount(item.gstRate);
    totals.subtotal += line.gross; totals.discount += line.discount; totals.taxable += line.taxable; totals.totalGst += line.gst;
    const group = totals.gstByRate[rate] ||= { taxable: 0, gst: 0 }; group.taxable += line.taxable; group.gst += line.gst;
  }
  const chargesSubtotal = (note.charges || []).reduce((sum, charge) => sum + amount(charge.amount), 0);
  const chargesGst = (note.charges || []).reduce((sum, charge) => sum + amount(charge.amount) * amount(charge.gstRate) / 100, 0);
  const preDisc = totals.taxable + totals.totalGst + chargesSubtotal + chargesGst;
  const addDiscAmt = note.additionalDiscount?.type === 'percent' ? preDisc * amount(note.additionalDiscount.value) / 100 : Math.min(preDisc, amount(note.additionalDiscount?.value));
  const invoiceTotal = preDisc - addDiscAmt;
  const tdsAmt = note.tds?.enabled ? totals.taxable * amount(note.tds.rate) / 100 : 0;
  const tcsAmt = note.tcs?.enabled ? invoiceTotal * amount(note.tcs.rate) / 100 : 0;
  const netPayable = invoiceTotal - tdsAmt + tcsAmt;
  const finalTotal = saved(note.totals?.finalTotal, saved(note.totals?.grandTotal, Math.round(netPayable)));
  return { ...totals, chargesSubtotal, chargesGst, preDisc, addDiscAmt, invoiceTotal, tdsAmt, tcsAmt, netPayable, grandTotal: preDisc, finalTotal, roundOff: finalTotal - netPayable, balanceDue: finalTotal };
}
export function creditPrintDocument(note) {
  return { ...note, items: (note.items || []).map((item) => item.discountType === 'amount' ? { ...item, discount: creditLine(item).gross > 0 ? creditLine(item).discount / creditLine(item).gross * 100 : 0, discountType: 'percent' } : item), totals: { ...note.totals, finalTotal: creditAmounts(note).finalTotal, manualTotalOverride: true } };
}
export function filterCreditNotes(notes, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  return notes.filter((note) => {
    const date = creditDate(note);
    if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    if (filters.customer && note.customer?.name !== filters.customer) return false;
    if (filters.status && creditStatus(note) !== filters.status) return false;
    return !query || [note.number, note.extra?.originalInvoiceNo, note.extra?.originalRef, note.customer?.name, note.customer?.city, note.extra?.reason, ...(note.items || []).map((item) => item.description)].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}
export function creditStats(notes, now = new Date()) {
  const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  return { total: notes.length, value: notes.filter((note) => !['Cancelled', 'Draft'].includes(creditStatus(note))).reduce((sum, note) => sum + creditAmounts(note).finalTotal, 0), pending: notes.filter((note) => ['Not Posted', 'Posting Not Recorded'].includes(creditStatus(note))).length, posted: notes.filter((note) => creditStatus(note) === 'Posted').length, issued: notes.filter((note) => creditStatus(note) === 'Posted' && creditDate(note).startsWith(month)).length };
}
export function creditHistory(note) {
  const events = [];
  if (note.createdAt) events.push({ label: 'Credit note created', at: note.createdAt });
  for (const event of note.lifecycleEvents || []) events.push({ label: String(event.action || 'Document updated').replaceAll('-', ' '), at: event.at, reason: event.reason });
  if (note.accounting?.posted && note.accounting.postedAt) events.push({ label: 'Accounting posted', at: note.accounting.postedAt, reason: note.accounting.voucherNo });
  if (note.updatedAt && note.updatedAt !== note.createdAt) events.push({ label: 'Last modified', at: note.updatedAt });
  return events.filter((event) => Number.isFinite(Date.parse(event.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
