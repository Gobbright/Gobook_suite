import { Employee } from '../../models/Employee.js';
import { HRDocument } from '../../models/Document.js';
import { EmployeePermission } from '../../models/EmployeePermission.js';
import { employeeMonth } from '../../services/employeeMonth.js';
import { httpError } from '../../utils/httpError.js';
import { sendHrDocument } from '../retail/hr-payroll/documentController.js';

export async function ownEmployee(req) {
  const employee = await Employee.findOne({ _id: req.employeeUser.employeeObjectId, userId: req.employeeUser.ownerUserId, employeeId: req.employeeUser.employeeId }).lean();
  if (!employee) throw httpError(404, 'Employee profile not found');
  return employee;
}
export async function employeeDocuments(req, res, next) {
  try {
    const employee = await ownEmployee(req);
    const data = await HRDocument.find({ userId: employee.userId, empId: String(employee._id) }).select('name category uploadedBy uploadedOn size mimeType createdAt').sort({ createdAt: -1 }).lean();
    res.json({ data });
  } catch (error) { next(error); }
}
export async function employeeDocumentFile(req, res, next) {
  try {
    const employee = await ownEmployee(req);
    const doc = await HRDocument.findOne({ _id: req.params.documentId, userId: employee.userId, empId: String(employee._id) }).lean();
    if (!doc) throw httpError(404, 'Document not found');
    await sendHrDocument(doc, res, req.query.download !== 'true');
  } catch (error) { next(error); }
}
export async function listEmployeePermissions(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const filter = { ownerUserId: req.employeeUser.ownerUserId, date: period.dates };
    if (req.employeeUser.role === 'employee') filter.employeeObjectId = req.employeeUser.employeeObjectId;
    const data = await EmployeePermission.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ data });
  } catch (error) { next(error); }
}
export async function requestEmployeePermission(req, res, next) {
  try {
    const employee = await ownEmployee(req);
    const { date, fromTime, toTime, reason } = req.body;
    const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validDate || !validTime(fromTime) || !validTime(toTime) || toTime <= fromTime) throw httpError(400, 'Choose a valid date and permission time range');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw httpError(400, 'Enter a reason of up to 1000 characters');
    const data = await EmployeePermission.create({ ownerUserId: employee.userId, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, date, fromTime, toTime, reason: reason.trim(), status: 'Pending' });
    res.status(201).json(data);
  } catch (error) { next(error); }
}
export async function reviewEmployeePermission(req, res, next) {
  try {
    if (!['Approved', 'Rejected'].includes(req.body.status)) throw httpError(400, 'Choose Approved or Rejected');
    const data = await EmployeePermission.findOneAndUpdate({ _id: req.params.id, ownerUserId: req.employeeUser.ownerUserId, status: 'Pending' }, { $set: { status: req.body.status, reviewedBy: req.employeeUser.email || req.employeeUser.id, reviewedAt: new Date() } }, { new: true, runValidators: true });
    if (!data) throw httpError(404, 'Pending permission request not found');
    res.json(data);
  } catch (error) { next(error); }
}
