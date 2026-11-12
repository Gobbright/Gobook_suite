import { RecurringJournal } from '../../../models/RecurringJournal.js';
import { createRecurringJournal, generateRecurringJournal, recurringScope } from '../../../services/recurringJournals.js';
import { inventoryTransaction } from '../../../services/inventoryTransaction.js';
import { httpError } from '../../../utils/httpError.js';

export async function listRecurringJournals(req, res, next) {
  try { res.json({ schedules: await RecurringJournal.find(recurringScope(req.user)).select('-template').sort({ nextDate: 1 }).lean() }); }
  catch (error) { next(error); }
}
export async function configureRecurringJournal(req, res, next) {
  try { res.status(201).json({ schedule: await createRecurringJournal(req.body || {}, req.user) }); }
  catch (error) { next(error.code === 11000 ? httpError(409, 'A recurring journal with this name already exists') : error); }
}
export async function toggleRecurringJournal(req, res, next) {
  try {
    const schedule = await inventoryTransaction(async () => {
      const existing = await RecurringJournal.findOne(recurringScope(req.user, { _id: req.params.id }));
      if (!existing) throw httpError(404, 'Recurring journal not found');
      if (typeof req.body.active !== 'boolean' || req.body.revision !== existing.revision) throw httpError(409, 'Reload the recurring journal before changing its status');
      existing.active = req.body.active;
      existing.revision += 1;
      existing.auditHistory.push({ action: existing.active ? 'Resumed' : 'Paused', actorId: req.user.id });
      return existing.save();
    });
    res.json({ schedule });
  } catch (error) { next(error); }
}
export async function generateRecurringDraft(req, res, next) {
  try { res.status(201).json({ voucher: await generateRecurringJournal(req.params.id, req.body?.date, req.user) }); }
  catch (error) { next(error); }
}
