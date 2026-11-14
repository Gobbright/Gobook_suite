const heads = ['cgst', 'sgst', 'igst', 'cess'];
export const annualTax = (row = {}) => heads.reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
export const annualSum = (rows = [], key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
export function annualSummary(data = {}) {
  // 6A is a control total; summing it with the remaining ITC rows counts it twice.
  const available = annualTax((data.table6 || []).find((row) => row.sno === '6A'));
  const reversal = (data.table7 || []).reduce((sum, row) => sum + annualTax(row), 0);
  const liability = annualTax(data.table9?.[0]);
  const inward = annualSum(data.annualDetails?.inwardRows, 'taxable');
  const exceptions = (data.annualDetails?.monthly || []).filter((row) => Math.abs(row.difference) >= 0.01);
  const outward = data.overview ? data.table4 || [] : (data.table4 || []).filter((row) => ['4A', '4B', '4C', '4D', '4E'].includes(row.sno));
  const issues = [];
  if (!data.gstin || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin)) issues.push('Business GSTIN is missing or has an invalid format.');
  if (reversal > available) issues.push('Annual ITC reversals exceed available ITC.');
  for (const table of ['table4', 'table5', 'table6', 'table7', 'table9']) {
    if ((data[table] || []).some((row) => heads.some((head) => !Number.isFinite(Number(row[head] ?? 0))))) issues.push(`${table}: invalid tax amounts need review.`);
  }
  const checks = [Boolean(data.gstin) && !issues.some((issue) => issue.includes('GSTIN')), !exceptions.length, reversal <= available, Boolean(data.annualDetails), !issues.length];
  const hasRecords = (data.annualDetails?.invoiceCount || 0) + (data.annualDetails?.purchaseCount || 0) > 0;
  const progress = hasRecords ? Math.round(checks.filter(Boolean).length / checks.length * 100) : 0;
  return { outward, outwardTotal: annualSum(outward, 'taxable'), inward, available, reversal, eligible: Math.max(0, available - reversal), liability, exceptions, issues, checks, hasRecords, progress };
}
