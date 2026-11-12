export const QUOTATION_STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];

export function validateQuotationDetails({ meta, extra = {} }) {
  const errors = {};
  if (!extra.validTill || !Number.isFinite(Date.parse(extra.validTill))) errors.validTill = 'Enter a valid quotation expiry date.';
  else if (meta?.date && extra.validTill < meta.date) errors.validTill = 'Valid till cannot be before the quotation date.';
  if (!['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'].includes(extra.quotationStatus || 'Draft')) errors.quotationStatus = 'Choose a valid quotation status.';
  return errors;
}

export function quotationStatus(quote, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
  if (quote.extra?.convertedInvoiceId) return 'Converted';
  const status = quote.extra?.quotationStatus || quote.extra?.status || 'Draft';
  if (['Rejected', 'Converted'].includes(status)) return status;
  if (quote.extra?.validTill && quote.extra.validTill.slice(0, 10) < today) return 'Expired';
  return QUOTATION_STATUSES.includes(status) ? status : 'Draft';
}

export function quotationAmounts(quote) {
  const lines = (quote.items || []).map((item) => {
    const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    const discount = gross * (Number(item.discount) || 0) / 100;
    const taxable = gross - discount;
    return { gross, discount, taxable, gst: taxable * (Number(item.gstRate) || 0) / 100 };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0);
  const lineDiscount = lines.reduce((sum, line) => sum + line.discount, 0);
  const charges = (quote.charges || []).reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
  const gst = lines.reduce((sum, line) => sum + line.gst, 0) + (quote.charges || []).reduce((sum, charge) => sum + (Number(charge.amount) || 0) * (Number(charge.gstRate) || 0) / 100, 0);
  const taxable = subtotal - lineDiscount + charges;
  const beforeDiscount = taxable + gst;
  const overallDiscount = quote.additionalDiscount?.type === 'percent' ? beforeDiscount * (Number(quote.additionalDiscount.value) || 0) / 100 : Math.min(Number(quote.additionalDiscount?.value) || 0, beforeDiscount);
  const calculated = Math.round(beforeDiscount - overallDiscount - (quote.tds?.enabled ? taxable * (Number(quote.tds.rate) || 0) / 100 : 0) + (quote.tcs?.enabled ? (beforeDiscount - overallDiscount) * (Number(quote.tcs.rate) || 0) / 100 : 0));
  const saved = quote.totals || {};
  return { subtotal: saved.subtotal ?? subtotal, lineDiscount: saved.discount ?? lineDiscount, charges: saved.chargesSubtotal ?? charges, taxable: saved.taxable ?? taxable, gst: saved.totalGst ?? gst, overallDiscount: saved.addDiscAmt ?? overallDiscount, total: saved.finalTotal ?? saved.grandTotal ?? calculated };
}

export function quotationStats(quotes, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
  const deadline = new Date(`${today}T00:00:00Z`); deadline.setUTCDate(deadline.getUTCDate() + 7);
  const lastDay = deadline.toISOString().slice(0, 10);
  return quotes.reduce((stats, quote) => {
    const status = quotationStatus(quote, today);
    stats.total += 1; stats.value += Number(quotationAmounts(quote).total) || 0;
    if (status === 'Sent') stats.awaiting += 1;
    if (status === 'Accepted') stats.accepted += 1;
    const validTill = quote.extra?.validTill?.slice(0, 10);
    if (!['Expired', 'Rejected', 'Converted'].includes(status) && validTill && validTill >= today && validTill <= lastDay) stats.expiring += 1;
    return stats;
  }, { total: 0, value: 0, awaiting: 0, accepted: 0, expiring: 0 });
}

export function filterQuotations(quotes, { search = '', customer = '', status = '', from = '', to = '' }, today) {
  const query = search.trim().toLowerCase();
  return quotes.filter((quote) => {
    const date = (quote.meta?.date || quote.createdAt || '').slice(0, 10);
    return (!query || [quote.number, quote.customer?.name, quote.customer?.phone].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!customer || quote.customer?.name === customer)
      && (!status || quotationStatus(quote, today) === status)
      && (!from || date >= from) && (!to || date <= to);
  });
}
