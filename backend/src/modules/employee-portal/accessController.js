import bcrypt from 'bcryptjs';
import { AppUser } from '../../models/AppUser.js';
import { Employee } from '../../models/Employee.js';
import { EmployeeLogin } from '../../models/EmployeeLogin.js';
import { PendingEmployeeLogin } from '../../models/PendingEmployeeLogin.js';
import { BusinessSettings } from '../../models/BusinessSettings.js';
import { SecuritySession } from '../../models/SecuritySession.js';
import { Attendance } from '../../models/Attendance.js';
import { Leave } from '../../models/Leave.js';
import { Payroll } from '../../models/Payroll.js';
import { HRDocument } from '../../models/Document.js';
import { EmployeePermission } from '../../models/EmployeePermission.js';
import { employeeMonth } from '../../services/employeeMonth.js';
import { EMPLOYEE_ACTIVE_STATUSES, employeeAccessView, rememberEmployeeAccess, resolveEmployeeLink } from '../../services/employeeAccess.js';
import { employeeQrFields, employeeQrProfile, EMPLOYEE_QR_DEFAULTS } from '../../services/employeeQrProfile.js';
import { findStoredFile, pipeStoredFile } from '../../services/gridfsStorage.js';
import { httpError } from '../../utils/httpError.js';

export async function getEmployeeLinkContext(req, res, next) {
  try {
    const { owner, employee } = await resolveEmployeeLink(req.query);
    const loginConfigured = await EmployeeLogin.exists({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, loginEnabled: true, status: 'Active', passwordHash: { $exists: true, $ne: '' } });
    const view = employeeAccessView(employee, owner);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ businessName: view.businessName, businessUsername: view.businessUsername, employeeUsername: employee.name, employeeEmail: employee.email, ownerUserId: String(owner._id), employeeId: employee.employeeId, qrProfile: view.qrProfile, loginEnabled: Boolean(loginConfigured && view.loginEnabled) });
  } catch (error) { next(error); }
}
export async function getEmployeeLinkPhoto(req, res, next) {
  try {
    const { employee } = await resolveEmployeeLink(req.query);
    if (!employeeQrFields(employee.qrDisplayFields).photo || !employee.photo?.gridFsFileId) throw httpError(404, 'Photo not available.');
    const file = await findStoredFile(employee.photo.gridFsFileId, { 'metadata.kind': 'employee-photo' });
    if (!file || String(file.metadata?.userId) !== String(employee.userId) || !['image/png', 'image/jpeg'].includes(file.contentType)) throw httpError(404, 'Photo not available.');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pipeStoredFile(file._id, res);
  } catch (error) { next(error); }
}
async function ownedEmployee(req) {
  const employee = await Employee.findOne({ _id: req.params.id, userId: req.employeeUser.ownerUserId });
  if (!employee) throw httpError(404, 'Employee not found');
  return employee;
}
async function accessView(employee) {
  const owner = await AppUser.findById(employee.userId).select('businessName name email').lean();
  const login = await EmployeeLogin.findOne({ ownerUserId: employee.userId, employeeObjectId: employee._id }).select('+passwordHash').lean();
  const settings = await BusinessSettings.findOne({ userId: employee.userId }).select('emailSmtpVerifiedAt').lean();
  if (!owner) throw httpError(404, 'Business owner not found');
  const view = await rememberEmployeeAccess(employee, owner);
  const photoUrl = employee.photo?.gridFsFileId ? `/api/employee/auth/link-photo?${new URLSearchParams({ businessSlug: view.businessSlug, employeeId: employee.employeeId })}` : '';
  return { ...view, identity: employeeQrProfile(employee, Object.fromEntries(Object.keys(EMPLOYEE_QR_DEFAULTS).map((key) => [key, true])), photoUrl), emailOtpReady: Boolean(settings?.emailSmtpVerifiedAt), passwordConfigured: Boolean(login?.passwordHash), loginEnabled: Boolean(employee.loginAccess && login?.loginEnabled && login.status === 'Active' && EMPLOYEE_ACTIVE_STATUSES.includes(employee.status)) };
}
export async function getEmployeeAccess(req, res, next) {
  try { res.json(await accessView(await ownedEmployee(req))); } catch (error) { next(error); }
}
export async function setEmployeeQrDisplay(req, res, next) {
  try {
    const employee = await ownedEmployee(req);
    employee.qrDisplayFields = employeeQrFields(req.body?.fields, true);
    await employee.save();
    res.json(await accessView(employee));
  } catch (error) { next(error); }
}
export async function getEmployeeOverview(req, res, next) {
  try {
    const employee = await ownedEmployee(req);
    const period = employeeMonth(req.query?.month);
    const filter = { userId: employee.userId, employeeId: employee.employeeId };
    const [attendance, leaves, payroll, permissions, documents] = await Promise.all([
      Attendance.find({ ...filter, date: period.dates }).sort({ date: -1 }).lean(),
      Leave.find({ userId: employee.userId, empId: employee.employeeId, ...period.leaves }).sort({ from: -1 }).lean(),
      Payroll.find({ ...filter, month: period.month }).lean(),
      EmployeePermission.find({ ownerUserId: employee.userId, employeeObjectId: employee._id, date: period.dates }).lean(),
      HRDocument.countDocuments({ userId: employee.userId, empId: String(employee._id) }),
    ]);
    res.json({ employee, month: period.month, attendance, leaves, payroll, permissions, documents });
  } catch (error) { next(error); }
}
export async function setEmployeeAccess(req, res, next) {
  try {
    const employee = await ownedEmployee(req);
    const { password, loginEnabled } = req.body;
    if (typeof loginEnabled !== 'boolean') throw httpError(400, 'Choose whether employee login is enabled');
    if (password !== undefined && (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) throw httpError(400, 'Password must be at least 8 characters and at most 72 bytes');
    const login = await EmployeeLogin.findOne({ ownerUserId: employee.userId, employeeObjectId: employee._id }).select('+passwordHash');
    if (loginEnabled && !password && !login?.passwordHash) throw httpError(400, 'Set a password before enabling employee login');
    if ((loginEnabled || password) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(employee.email || '').trim())) throw httpError(400, 'Add a valid employee email before enabling login');
    const loginUpdate = { ownerUserId: employee.userId, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, category: employee.category, role: 'employee', loginEnabled, status: EMPLOYEE_ACTIVE_STATUSES.includes(employee.status) ? 'Active' : 'Inactive' };
    if (password) loginUpdate.passwordHash = await bcrypt.hash(password, 12);
    if (login || password) await EmployeeLogin.findOneAndUpdate({ ownerUserId: employee.userId, employeeId: employee.employeeId }, { $set: loginUpdate, $unset: { loginPassword: 1 } }, { upsert: true, new: true, runValidators: true });
    employee.loginAccess = loginEnabled;
    employee.employeeRole = 'employee';
    await employee.save();
    if (login && (password || !loginEnabled)) await SecuritySession.updateMany({ subject: String(login._id), scope: 'employee-portal', revokedAt: null }, { $set: { revokedAt: new Date() } });
    if (login && (password || !loginEnabled)) await PendingEmployeeLogin.deleteMany({ employeeLoginId: login._id });
    res.json(await accessView(employee));
  } catch (error) { next(error); }
}
export async function resetEmployeeQr(req, res, next) {
  try {
    const employee = await Employee.findOneAndUpdate({ _id: req.params.id, userId: req.employeeUser.ownerUserId }, [{ $set: { portalVersion: { $add: [{ $ifNull: ['$portalVersion', 1] }, 1] } } }], { new: true });
    if (!employee) throw httpError(404, 'Employee not found');
    const login = await EmployeeLogin.findOne({ ownerUserId: employee.userId, employeeObjectId: employee._id }).lean();
    if (login) await SecuritySession.updateMany({ subject: String(login._id), scope: 'employee-portal', revokedAt: null }, { $set: { revokedAt: new Date() } });
    if (login) await PendingEmployeeLogin.deleteMany({ employeeLoginId: login._id });
    res.json(await accessView(employee));
  } catch (error) { next(error); }
}
