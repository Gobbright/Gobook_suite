// GST portal GSTR-1 guide: B2CL interstate invoice threshold changed from
// INR 250,000 to INR 100,000 from the August 2024 return period.
// https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_Return_in_GSTR-1.htm
export function gstr1Category(row, period = '') {
  if (['credit-note', 'sales-return', 'debit-note'].includes(row.documentType)) return 'notes';
  if (['export-wp', 'export-wop'].includes(row.invoiceType)) return 'exports';
  if (row.gstin) return 'b2b';
  const selectedDate = new Date(`1 ${period}`);
  const month = row.date?.slice(0, 7) || (Number.isNaN(selectedDate.getTime()) ? '' : `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`);
  const threshold = month >= '2024-08' ? 100000 : 250000;
  const interstate = row.supplyType ? row.supplyType.toLowerCase() === 'interstate' : Number(row.igst) > 0;
  const invoiceValue = row.value ?? ['taxable', 'cgst', 'sgst', 'igst', 'cess'].reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
  return interstate && Number(invoiceValue) > threshold ? 'b2cl' : 'b2cs';
}
