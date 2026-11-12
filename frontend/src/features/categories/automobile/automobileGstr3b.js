export const TAX_HEADS = ['cgst', 'sgst', 'igst', 'cess'];
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const sum = (rows, key) => round((rows || []).reduce((total, row) => total + (Number(row[key]) || 0), 0));
export function gstr3bSummary(data = {}) {
  const output = {}; const available = {}; const reversed = {}; const eligible = {}; const utilized = {}; const cash = {};
  for (const key of TAX_HEADS) {
    output[key] = sum(data.outwardRows, key);
    available[key] = sum(data.itcAvailable, key);
    reversed[key] = sum(data.itcReversed, key);
    eligible[key] = Math.max(0, round(available[key] - reversed[key]));
    utilized[key] = Math.max(0, Math.min(output[key], eligible[key]));
    cash[key] = Math.max(0, round(output[key] - utilized[key]));
  }
  const total = (values) => round(TAX_HEADS.reduce((amount, key) => amount + values[key], 0));
  const lateFee = round((Number(data.lateFeeCgst) || 0) + (Number(data.lateFeeSgst) || 0));
  return { output, available, reversed, eligible, utilized, cash, taxable: sum(data.outwardRows, 'taxable'), outputTotal: total(output), eligibleTotal: total(eligible), reversalTotal: total(reversed), cashTotal: total(cash), lateFee, payable: round(total(cash) + lateFee) };
}
export function validateGstr3b(data = {}) {
  const issues = [];
  if (!data.gstin || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(data.gstin)) issues.push('Business GSTIN is missing or has an invalid format.');
  for (const group of ['outwardRows', 'itcAvailable', 'itcReversed']) {
    for (const row of data[group] || []) {
      for (const key of TAX_HEADS) {
        if (!Number.isFinite(Number(row[key] ?? 0)) || Number(row[key] ?? 0) < 0) issues.push(`${row.label || row.key}: ${key.toUpperCase()} must be a nonnegative amount.`);
      }
      if (group === 'outwardRows' && !Number.isFinite(Number(row.taxable ?? 0))) issues.push(`${row.label || row.key}: taxable amount is invalid.`);
    }
  }
  for (const key of ['lateFeeCgst', 'lateFeeSgst']) if (!Number.isFinite(Number(data[key] ?? 0)) || Number(data[key] ?? 0) < 0) issues.push('Late fee must be a nonnegative amount.');
  const summary = gstr3bSummary(data);
  for (const key of TAX_HEADS) if (summary.reversed[key] > summary.available[key]) issues.push(`${key.toUpperCase()} reversals exceed available ITC.`);
  return issues;
}
