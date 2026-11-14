import { Types } from 'mongoose';
import { Employee } from '../../models/Employee.js';
import { EmployeeNotification } from '../../models/EmployeeNotification.js';
import { Payroll } from '../../models/Payroll.js';
import { queueEmployeeNotification } from '../../services/employeeNotifications.js';
import { employeeMonth } from '../../services/employeeMonth.js';
import { httpError } from '../../utils/httpError.js';

export function notificationFilter(user, query = {}) {
  const filter = { ownerUserId: user.ownerUserId };
  if (user.role === 'employee') filter.employeeObjectId = user.employeeObjectId;
  else if (query.employee) {
    if (typeof query.employee !== 'string' || !Types.ObjectId.isValid(query.employee)) throw httpError(400, 'Choose a valid employee');
    filter.employeeObjectId = query.employee;
  }
  if (query.month && query.month !== 'all') {
    const period = employeeMonth(query.month);
    filter.createdAt = { $gte: new Date(`${period.start}T00:00:00+05:30`), $lte: new Date(`${period.end}T23:59:59.999+05:30`) };
  }
  if (query.read === 'read') filter.readAt = { $ne: null };
  if (query.read === 'unread') filter.readAt = null;
  return filter;
}
export async function listNotifications(req, res, next) {
  try {
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
    const filter = notificationFilter(req.employeeUser, req.query);
    const own = notificationFilter(req.employeeUser);
    const [data, total, unread, ownerUnread] = await Promise.all([
      EmployeeNotification.find(filter).select(req.employeeUser.role === 'employee' ? '-requestKey -__v -ownerReadAt' : '-requestKey -__v').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 50).limit(50).lean(),
      EmployeeNotification.countDocuments(filter),
      EmployeeNotification.countDocuments({ ...own, readAt: null }),
      req.employeeUser.role === 'employee' ? Promise.resolve(0) : EmployeeNotification.countDocuments({ ...own, ownerReadAt: null, kind: { $ne: 'login-otp' } }),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data, total, unread, ...(req.employeeUser.role !== 'employee' ? { ownerUnread } : {}), page, limit: 50 });
  } catch (error) { next(error); }
}
export async function notificationCount(req, res, next) {
  try { res.json({ unread: await EmployeeNotification.countDocuments({ ...notificationFilter(req.employeeUser), readAt: null }) }); }
  catch (error) { next(error); }
}
export async function readNotification(req, res, next) {
  try {
    const own = { _id: req.params.id, ...notificationFilter(req.employeeUser) };
    if (!Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Notification not found');
    await EmployeeNotification.updateOne({ ...own, readAt: null }, { $set: { readAt: new Date() } });
    const data = await EmployeeNotification.findOne(own).select('-requestKey -__v -ownerReadAt').lean();
    if (!data) throw httpError(404, 'Notification not found');
    res.json(data);
  } catch (error) { next(error); }
}
export async function readAllEmployeeNotifications(req, res, next) {
  try {
    const now = new Date();
    await EmployeeNotification.updateMany({ ...notificationFilter(req.employeeUser), readAt: null, createdAt: { $lte: now } }, { $set: { readAt: now } });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) { next(error); }
}
export async function sendNotifications(req, res, next) {
  try {
    const { title, message, employeeIds, allEmployees, requestId } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof message !== 'string' || !message.trim() || message.length > 5000) throw httpError(400, 'Enter a title (up to 200 characters) and message (up to 5000 characters)');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw httpError(400, 'A valid notification request ID is required');
    if (allEmployees !== true && (!Array.isArray(employeeIds) || !employeeIds.length || employeeIds.length > 1000 || employeeIds.some((id) => typeof id !== 'string' || !Types.ObjectId.isValid(id)))) throw httpError(400, 'Choose employees to notify');
    const ownerUserId = req.employeeUser.ownerUserId;
    const filter = { userId: ownerUserId, ...(allEmployees === true ? {} : { _id: { $in: [...new Set(employeeIds)] } }) };
    const employees = await Employee.find(filter).select('_id employeeId name email').limit(1001).lean();
    if (employees.length > 1000) throw httpError(400, 'Send to at most 1000 employees per batch');
    if (allEmployees !== true && employees.length !== new Set(employeeIds).size) throw httpError(404, 'One or more employees do not belong to your business');
    if (!employees.length) throw httpError(400, 'No employees to notify');
    const existing = await EmployeeNotification.find({ ownerUserId, requestKey: requestId }).select('title message employeeObjectId').lean();
    if (existing.some((row) => row.title !== title.trim() || row.message !== message.trim()) || existing.some((row) => !employees.some((employee) => String(employee._id) === String(row.employeeObjectId)))) throw httpError(409, 'This request ID was already used for a different notification');
    for (const employee of employees) await queueEmployeeNotification(ownerUserId, employee, { requestKey: requestId, title: title.trim(), message: message.trim() });
    const emailDeliveryPaused = process.env.SCHEDULED_JOBS_ENABLED === 'false';
    res.status(202).json({ count: employees.length, message: `Saved ${employees.length} employee notification(s). ${emailDeliveryPaused ? 'Email sending is paused on this server; messages remain in employee inboxes.' : 'Email delivery is queued.'}`, requestId, emailDeliveryPaused });
  } catch (error) { if (error.code === 11000) return next(httpError(409, 'This notification is already being saved. Refresh the history.')); next(error); }
}
export async function retryNotification(req, res, next) {
  try {
    if (!Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Notification not found');
    const data = await EmployeeNotification.findOneAndUpdate({ _id: req.params.id, ownerUserId: req.employeeUser.ownerUserId, emailStatus: 'Failed', kind: { $ne: 'login-otp' }, attempts: { $lt: 5 } }, { $set: { emailStatus: 'Pending', lastError: '' } }, { new: true }).lean();
    if (!data) throw httpError(409, 'Only failed notification emails with fewer than five attempts can be retried');
    res.json({ message: process.env.SCHEDULED_JOBS_ENABLED === 'false' ? 'Retry saved. Email sending is paused on this server; the original inbox notification is preserved.' : 'Email retry queued. The original inbox notification is preserved.' });
  } catch (error) { next(error); }
}

export async function emailEmployeePayslip(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    if (!Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Payslip not found');
    const payroll = await Payroll.findOne({ _id: req.params.id, userId: ownerUserId }).lean();
    if (!payroll) throw httpError(404, 'Payslip not found');
    const employee = await Employee.findOne({ userId: ownerUserId, employeeId: payroll.employeeId }).lean();
    if (!employee) throw httpError(404, 'Employee not found');
    if (typeof req.body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(req.body.requestId)) throw httpError(400, 'A valid request ID is required');
    await queueEmployeeNotification(ownerUserId, employee, { requestKey: `payslip:${req.body.requestId}`, kind: 'payslip', title: `Payslip for ${payroll.month}`, message: `Your payslip for ${payroll.month} is attached to this email and available in your employee portal.`, report: { kind: 'payroll', month: payroll.month } });
    res.status(202).json({ message: process.env.SCHEDULED_JOBS_ENABLED === 'false' ? 'Payslip notification saved. Email sending is paused on this server.' : 'Payslip email queued. Check Employee Notifications for email and read status.' });
  } catch (error) { next(error); }
}
