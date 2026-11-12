import { RecurringJournal } from '../models/RecurringJournal.js';
import { AccountingVoucher } from '../models/AccountingVoucher.js';
import { createAccountingVoucher, normalizeVoucherPayload } from './accountingVouchers.js';
import { voucherFinancialYear } from './voucherRules.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { httpError } from '../utils/httpError.js';

const frequencies = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];
export function nextJournalDate(date, frequency, anchorDay = Number(date.slice(-2))) {
  voucherFinancialYear(date);
  if (!frequencies.includes(frequency)) throw httpError(400, 'Select a recurring frequency');
  const next = new Date(`${date}T12:00:00Z`);
  if (frequency === 'Weekly') next.setUTCDate(next.getUTCDate() + 7);
  else {
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + ({ Monthly: 1, Quarterly: 3, Yearly: 12 }[frequency]));
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(anchorDay, lastDay));
  }
  return next.toISOString().slice(0, 10);
}

export function recurringScope(user, extra = {}) {
  return { userId: user.id, ...(user.businessId ? { businessId: user.businessId } : {}), ...(user.branch && user.accountType !== 'owner' && !user.isSuperAdmin ? { branch: user.branch } : {}), ...extra };
}

export async function createRecurringJournal(body, user) {
  return inventoryTransaction(async () => {
    const name = String(body.name || '').trim();
    if (!name || name.length > 120) throw httpError(400, 'Enter a recurring journal name (up to 120 characters)');
    voucherFinancialYear(body.nextDate);
    nextJournalDate(body.nextDate, body.frequency);
    if (body.endDate) {
      voucherFinancialYear(body.endDate);
      if (body.endDate < body.nextDate) throw httpError(400, 'End date cannot be before the first date');
    }
    const source = await AccountingVoucher.findOne(recurringScope(user, { _id: body.sourceVoucher, voucherType: 'Journal', status: { $in: ['Draft', 'Posted'] } })).lean();
    if (!source) throw httpError(404, 'Select an available journal in this company');
    const template = { voucherType: 'Journal', numberingMode: 'auto', narration: source.narration, bookGroup: source.bookGroup, branch: source.branch, entryMode: 'manual', lines: source.lines.map((line) => ({ ledgerName: line.ledgerName, ledgerId: line.ledgerId, side: line.side, amount: line.amount, narration: line.narration, costCenter: line.costCenter, allocations: [] })) };
    await normalizeVoucherPayload({ ...template, date: body.nextDate, status: 'Draft' }, user, null, { requireBalancedDraft: true });
    return RecurringJournal.create({ userId: user.id, businessId: user.businessId, branch: source.branch, name, sourceVoucher: source._id, frequency: body.frequency, nextDate: body.nextDate, anchorDay: Number(body.nextDate.slice(-2)), endDate: body.endDate || '', template, auditHistory: [{ action: 'Configured', actorId: user.id }] });
  });
}

export async function generateRecurringJournal(id, expectedDate, user) {
  voucherFinancialYear(expectedDate);
  return inventoryTransaction(async () => {
    const schedule = await RecurringJournal.findOne(recurringScope(user, { _id: id }));
    if (!schedule) throw httpError(404, 'Recurring journal not found');
    if (schedule.lastDate === expectedDate && schedule.lastVoucher) {
      const previous = await AccountingVoucher.findOne(recurringScope(user, { _id: schedule.lastVoucher }));
      if (!previous) throw httpError(409, 'The generated draft was removed. This occurrence cannot be generated again');
      return previous;
    }
    if (!schedule.active) throw httpError(409, 'This recurring journal is paused or complete');
    if (schedule.nextDate !== expectedDate) throw httpError(409, 'The recurring date has changed. Reload before generating');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (expectedDate > today || schedule.endDate && expectedDate > schedule.endDate) throw httpError(400, 'Only due occurrences can be generated');
    const voucher = await createAccountingVoucher({ ...schedule.template, date: expectedDate, status: 'Draft', requestKey: `recurring_${schedule._id}_${expectedDate}` }, user, { requireBalancedDraft: true, recurringJournalId: schedule._id });
    schedule.lastDate = expectedDate;
    schedule.lastVoucher = voucher._id;
    schedule.nextDate = nextJournalDate(expectedDate, schedule.frequency, schedule.anchorDay);
    if (schedule.endDate && schedule.nextDate > schedule.endDate) schedule.active = false;
    schedule.revision += 1;
    schedule.auditHistory.push({ action: 'Draft generated', actorId: user.id, date: expectedDate, voucherId: voucher._id });
    await schedule.save();
    return voucher;
  });
}
