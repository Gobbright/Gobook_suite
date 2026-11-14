import mongoose from 'mongoose';
import { EmployeeWork } from '../../models/EmployeeWork.js';
import { Employee } from '../../models/Employee.js';
import { httpError } from '../../utils/httpError.js';
import { EMPLOYEE_ACTIVE_STATUSES } from '../../services/employeeAccess.js';

const statuses = ['Assigned', 'In Progress', 'Completed'];
const priorities = ['Low', 'Normal', 'High', 'Urgent'];
const objectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw httpError(400, `Enter a valid ${name} of up to ${max} characters`);
  return value.trim();
}
function dueDate(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw httpError(400, 'Choose a valid due date');
  return value;
}
function scope(req) {
  return { ownerUserId: new mongoose.Types.ObjectId(req.employeeUser.ownerUserId), ...(req.employeeUser.role === 'employee' ? { employeeObjectId: new mongoose.Types.ObjectId(req.employeeUser.employeeObjectId) } : {}) };
}
export async function listWork(req, res, next) {
  try {
    const base = scope(req);
    const { status = '', employee = '', q = '', page = '1' } = req.query;
    if (typeof status !== 'string' || (status && !statuses.includes(status)) || typeof q !== 'string' || q.length > 160 || typeof page !== 'string' || !/^\d{1,6}$/.test(page) || Number(page) < 1) throw httpError(400, 'Invalid work filters');
    if (req.employeeUser.role !== 'employee' && employee) {
      if (!objectId(employee)) throw httpError(400, 'Choose a valid employee');
      base.employeeObjectId = new mongoose.Types.ObjectId(employee);
    }
    if (q.trim()) {
      const match = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      base.$or = [{ title: match }, { employeeName: match }, { employeeId: match }];
    }
    const filter = { ...base, ...(status ? { status } : {}) };
    const [data, total, counts] = await Promise.all([
      EmployeeWork.find(filter).sort({ createdAt: -1, _id: -1 }).skip((Number(page) - 1) * 12).limit(12).lean(),
      EmployeeWork.countDocuments(filter),
      EmployeeWork.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'Completed'] }, { $ne: ['$dueDate', ''] }, { $lt: ['$dueDate', today()] }] }, 1, 0] } } } }]),
    ]);
    const summary = { total: 0, assigned: 0, inProgress: 0, completed: 0, overdue: 0 };
    for (const row of counts) { summary.total += row.count; summary.overdue += row.overdue; summary[{ Assigned: 'assigned', 'In Progress': 'inProgress', Completed: 'completed' }[row._id]] = row.count; }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data, total, page: Number(page), limit: 12, summary });
  } catch (error) { next(error); }
}
export async function assignWork(req, res, next) {
  try {
    const body = req.body || {};
    const title = text(body.title, 'work title', 160, true);
    const description = text(body.description ?? '', 'description', 5000);
    const due = dueDate(body.dueDate ?? '');
    const priority = body.priority ?? 'Normal';
    if (!priorities.includes(priority)) throw httpError(400, 'Choose a valid priority');
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId)) throw httpError(400, 'A valid assignment request is required');
    if (body.allEmployees !== undefined && typeof body.allEmployees !== 'boolean') throw httpError(400, 'Choose whether to assign all employees');
    const all = body.allEmployees === true;
    const ids = body.employeeIds ?? [];
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => !objectId(id))) throw httpError(400, 'Choose valid employees');
    const selected = [...new Set(ids)];
    if (!all && !selected.length) throw httpError(400, 'Select at least one employee');
    const employees = await Employee.find({ userId: req.employeeUser.ownerUserId, status: { $in: EMPLOYEE_ACTIVE_STATUSES }, ...(!all ? { _id: { $in: selected } } : {}) }).select('_id name employeeId').lean();
    if (!employees.length || (!all && employees.length !== selected.length)) throw httpError(404, 'One or more active employees were not found in your business');
    // Each employee gets an independent completion record. Retried requests do
    // not create duplicate assignments or overwrite an employee's progress.
    await EmployeeWork.bulkWrite(employees.map((employee) => ({ updateOne: {
      filter: { ownerUserId: req.employeeUser.ownerUserId, employeeObjectId: employee._id, requestId: body.requestId },
      update: { $setOnInsert: { title, description, dueDate: due, priority, employeeId: employee.employeeId, employeeName: employee.name, status: 'Assigned', note: '', completedAt: null, assignedBy: req.employeeUser.name || req.employeeUser.email || 'Business administrator', __v: 0 } },
      upsert: true,
    } })));
    res.status(201).json({ count: employees.length, message: `Work assigned to ${employees.length} employee${employees.length === 1 ? '' : 's'}.` });
  } catch (error) { next(error); }
}
export async function updateWork(req, res, next) {
  try {
    if (!objectId(req.params.id)) throw httpError(400, 'Invalid work ID');
    const body = req.body || {};
    const employee = req.employeeUser.role === 'employee';
    const allowed = employee ? ['status', 'note', 'version'] : ['title', 'description', 'dueDate', 'priority', 'status', 'note', 'version'];
    if (Object.keys(body).some((key) => !allowed.includes(key))) throw httpError(400, 'This work field cannot be changed');
    if (!Number.isInteger(body.version) || body.version < 0) throw httpError(400, 'Refresh the work before updating it');
    const current = await EmployeeWork.findOne({ _id: req.params.id, ...scope(req) }).lean();
    if (!current) throw httpError(404, 'Work not found');
    if (current.__v !== body.version) throw httpError(409, 'This work has changed. Refresh and try again.');
    const changes = {};
    if (body.status !== undefined) {
      if (!statuses.includes(body.status)) throw httpError(400, 'Choose a valid work status');
      if (employee && current.status === 'Completed' && body.status !== 'Completed') throw httpError(400, 'Ask your administrator to reopen completed work');
      changes.status = body.status;
      changes.completedAt = body.status === 'Completed' ? current.completedAt || new Date() : null;
    }
    if (body.note !== undefined) changes.note = text(body.note, 'progress note', 2000);
    if (!employee) {
      if (body.title !== undefined) changes.title = text(body.title, 'work title', 160, true);
      if (body.description !== undefined) changes.description = text(body.description, 'description', 5000);
      if (body.dueDate !== undefined) changes.dueDate = dueDate(body.dueDate);
      if (body.priority !== undefined) { if (!priorities.includes(body.priority)) throw httpError(400, 'Choose a valid priority'); changes.priority = body.priority; }
    }
    if (!Object.keys(changes).length) throw httpError(400, 'Choose a change to save');
    const data = await EmployeeWork.findOneAndUpdate({ _id: current._id, ...scope(req), __v: body.version }, { $set: changes, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!data) throw httpError(409, 'This work has changed. Refresh and try again.');
    res.json(data);
  } catch (error) { next(error); }
}
