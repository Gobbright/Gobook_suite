import { FollowUp } from '../../../models/FollowUp.js';
import { Lead } from '../../../models/Lead.js';
import { Customer } from '../../../models/Customer.js';
import { httpError } from '../../../utils/httpError.js';

const EDITABLE_FIELDS = ['branch', 'leadId', 'customerId', 'previousFollowUpId', 'person', 'regarding', 'date', 'time', 'status', 'owner', 'followUpType', 'priority', 'duration', 'notes', 'outcome', 'reminderAt'];
function followUpPayload(body) {
  return Object.fromEntries(EDITABLE_FIELDS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, ['leadId', 'customerId', 'previousFollowUpId'].includes(key) && !body[key] ? null : body[key]]));
}
async function validateLinks(payload, userId) {
  for (const [key, Model] of [['leadId', Lead], ['customerId', Customer], ['previousFollowUpId', FollowUp]]) {
    if (payload[key] && !await Model.exists({ _id: payload[key], userId })) throw httpError(404, 'Linked record not found');
  }
  if (payload.leadId && payload.customerId) throw httpError(400, 'Choose a customer or a lead for this follow-up.');
}

// GET /api/crm/follow-ups
export async function listFollowUps(req, res, next) {
  try {
    const followUps = await FollowUp.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ followUps });
  } catch (err) {
    next(err);
  }
}

// POST /api/crm/follow-ups
export async function createFollowUp(req, res, next) {
  try {
    const payload = followUpPayload(req.body);
    await validateLinks(payload, req.user.id);
    const followUp = await FollowUp.create({ ...payload, userId: req.user.id, outcomeLog: [{ at: new Date(), by: req.user.name || String(req.user.id), note: 'Follow-up created', status: payload.status || 'Pending' }] });
    res.status(201).json(followUp);
  } catch (err) {
    next(err);
  }
}

// PUT /api/crm/follow-ups/:id
export async function updateFollowUp(req, res, next) {
  try {
    const existing = await FollowUp.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!existing) throw httpError(404, 'Follow-up not found');
    const payload = followUpPayload(req.body);
    await validateLinks(payload, req.user.id);
    const linked = { ...existing, ...payload };
    if (linked.leadId && linked.customerId) throw httpError(400, 'Choose a customer or a lead for this follow-up.');
    const changedStatus = payload.status && payload.status !== existing.status;
    const changedOutcome = payload.outcome !== undefined && payload.outcome !== (existing.outcome || '');
    const event = changedStatus || changedOutcome ? { at: new Date(), by: req.user.name || String(req.user.id), note: payload.outcome || (changedStatus ? `Status changed to ${payload.status === 'Done' ? 'Completed' : payload.status}` : 'Outcome updated'), status: payload.status || existing.status } : null;
    const followUp = await FollowUp.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: payload, ...(event ? { $push: { outcomeLog: event } } : {}) },
      { new: true, runValidators: true },
    ).lean();
    if (!followUp) return next(httpError(404, 'Follow-up not found'));
    res.json(followUp);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/crm/follow-ups/:id
export async function deleteFollowUp(req, res, next) {
  try {
    const followUp = await FollowUp.findOneAndDelete({ _id: req.params.id, userId: req.user.id }).lean();
    if (!followUp) return next(httpError(404, 'Follow-up not found'));
    res.json({ message: 'Follow-up deleted' });
  } catch (err) {
    next(err);
  }
}
