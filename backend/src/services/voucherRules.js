import { httpError } from '../utils/httpError.js';

export const ALLOCATION_TYPES = ['New Reference', 'Against Reference', 'Advance', 'On Account'];
export const voucherMoney = (value) => Math.round(Number(value) * 100) / 100;

export function voucherFinancialYear(dateValue, fyStart = '01 April') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '')) throw httpError(400, 'Enter a valid voucher date');
  const date = new Date(`${dateValue}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) throw httpError(400, 'Enter a valid voucher date');
  const start = new Date(`${fyStart} 2000 12:00:00 GMT`);
  if (!Number.isFinite(start.getTime())) throw httpError(400, 'Invalid financial year start in business settings');
  const beforeStart = date.getUTCMonth() < start.getUTCMonth() || date.getUTCMonth() === start.getUTCMonth() && date.getUTCDate() < start.getUTCDate();
  const year = date.getUTCFullYear() - Number(beforeStart);
  return `${year}-${String(year + 1).slice(-2)}`;
}

export function normalizeVoucherLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 200) throw httpError(400, 'Enter between two and 200 valid ledger entries');
  return lines.map((line) => {
    const ledgerName = String(line.ledgerName || line.accountName || line.name || '').trim();
    const amount = voucherMoney(line.amount);
    if (!ledgerName || !['debit', 'credit'].includes(line.side) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
      throw httpError(400, 'Every voucher line needs an active ledger, debit/credit side and a positive finite amount');
    }
    if (line.allocations !== undefined && !Array.isArray(line.allocations)) throw httpError(400, 'Invalid bill allocations');
    const allocations = (line.allocations || []).map((allocation) => {
      const allocationAmount = voucherMoney(allocation.amount);
      const reference = String(allocation.reference || '').trim();
      if (!ALLOCATION_TYPES.includes(allocation.type) || !Number.isFinite(allocationAmount) || allocationAmount <= 0) throw httpError(400, 'Invalid bill allocation type or amount');
      if (allocation.type !== 'On Account' && !reference) throw httpError(400, 'A bill reference is required for this allocation');
      return { type: allocation.type, reference: allocation.type === 'On Account' ? '' : reference, amount: allocationAmount };
    });
    if (allocations.length && voucherMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)) !== amount) throw httpError(400, 'Bill allocations must equal the ledger line amount');
    return {
      ledgerId: line.ledgerId || undefined, ledgerName, ledgerGroup: String(line.ledgerGroup || line.group || '').trim(),
      side: line.side, amount, billRef: String(line.billRef || '').trim(), costCenter: String(line.costCenter || '').trim(),
      narration: String(line.narration || '').trim(), allocations,
    };
  });
}

export function voucherTotals(lines) {
  return {
    debitTotal: voucherMoney(lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0)),
    creditTotal: voucherMoney(lines.filter((line) => line.side === 'credit').reduce((sum, line) => sum + line.amount, 0)),
  };
}

export function billBalances(vouchers, ledgerName) {
  const references = new Map();
  for (const voucher of vouchers) {
    if (voucher.status !== 'Posted') continue;
    for (const line of voucher.lines || []) {
      if (line.ledgerName !== ledgerName) continue;
      const allocations = line.allocations?.length ? line.allocations : line.billRef ? [{ reference: line.billRef, amount: line.amount }] : [];
      for (const allocation of allocations) {
        if (!allocation.reference || allocation.type === 'On Account') continue;
        const key = allocation.reference;
        references.set(key, voucherMoney((references.get(key) || 0) + Number(allocation.amount) * (line.side === 'debit' ? 1 : -1)));
      }
    }
  }
  return [...references].map(([reference, balance]) => ({ reference, balance, outstanding: Math.abs(balance), side: balance >= 0 ? 'debit' : 'credit' }));
}
