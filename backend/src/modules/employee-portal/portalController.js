import { signPortalToken, safePortalUser } from '../../services/employeePortalSession.js';
import bcrypt from 'bcryptjs';

import multer from 'multer';
import { Types } from 'mongoose';

import { env } from '../../config/env.js';
import { AppUser } from '../../models/AppUser.js';
import { BusinessSettings } from '../../models/BusinessSettings.js';
import { Attendance } from '../../models/Attendance.js';
import { AttendanceCorrection } from '../../models/AttendanceCorrection.js';
import { Employee } from '../../models/Employee.js';
import { EmployeeLogin } from '../../models/EmployeeLogin.js';
import { Holiday } from '../../models/Holiday.js';
import { Leave } from '../../models/Leave.js';
import { Payroll } from '../../models/Payroll.js';
import { reverseGeocodeLocation } from '../../services/reverseGeocode.js';
import { hasExpectedFileSignature, storeBuffer } from '../../services/gridfsStorage.js';
import { httpError } from '../../utils/httpError.js';


import { employeeMonth, leaveDaysInRange } from '../../services/employeeMonth.js';
import { EMPLOYEE_ACTIVE_STATUSES, rememberEmployeeAccess, employeesWithAccess } from '../../services/employeeAccess.js';
import { HRDocument } from '../../models/Document.js';
import { EmployeePermission } from '../../models/EmployeePermission.js';
import { employeeQrFields } from '../../services/employeeQrProfile.js';
import { employeeDetails } from '../../services/employeeDetails.js';
import { queueEmployeeEvent, queueEmployeeNotification } from '../../services/employeeNotifications.js';
import { breakSummary, netAttendanceHours } from '../../services/attendanceBreaks.js';

const SALT_ROUNDS = 12;

export const leaveAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    cb(allowed.has(file.mimetype) ? null : httpError(400, 'Only PDF, JPG and PNG files are allowed'), allowed.has(file.mimetype));
  },
});

export const employeePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png']);
    cb(allowed.has(file.mimetype) ? null : httpError(400, 'Only JPG and PNG files are allowed'), allowed.has(file.mimetype));
  },
});

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'employee';
}

const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return [byType.year, byType.month, byType.day].join('-');
}

function timeNow() {
  return new Date().toLocaleTimeString('en-IN', { timeZone: ATTENDANCE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on', 'enable'].includes(String(value).trim().toLowerCase());
}

function parseObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function salaryNumber(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function defaultSalaryStructure(basicSalary = 0) {
  const basic = salaryNumber(basicSalary);
  return {
    hra: Math.round(basic * 0.32),
    specialAllowance: Math.round(basic * 0.2),
    conveyanceAllowance: 1600,
    medicalAllowance: 1000,
    otherAllowances: 0,
    pf: Math.round(basic * 0.12),
    esi: Math.round(basic * 0.02),
    professionalTax: 200,
    tds: Math.round(basic * 0.07),
    otherDeduction: 500,
    loanDeduction: 0,
  };
}

function normalizeSalaryStructure(input, basicSalary = 0, existing = {}) {
  const source = parseObject(input, {});
  const defaults = { ...defaultSalaryStructure(basicSalary), ...(existing || {}) };
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, salaryNumber(source[key], salaryNumber(fallback))]),
  );
}

function datesBetween(from, to = from) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) return [];
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [];
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function saveLeaveAttachment(file, userId) {
  if (!file) return undefined;
  if (!hasExpectedFileSignature(file.buffer, file.mimetype)) throw httpError(400, 'Attachment content does not match its declared file type');
  const stored = await storeBuffer({ buffer: file.buffer, filename: file.originalname, contentType: file.mimetype, metadata: { kind: 'employee-leave-attachment', userId } });
  return {
    originalName: file.originalname || stored.filename,
    fileName: stored.filename,
    gridFsFileId: stored.id,
    url: `/api/files/employee-assets/${stored.id}`,
    size: file.size || 0,
    mimeType: file.mimetype || '',
    uploadedAt: new Date(),
  };
}

async function saveEmployeePhoto(file, userId) {
  if (!file) return undefined;
  if (!hasExpectedFileSignature(file.buffer, file.mimetype)) throw httpError(400, 'Photo content does not match its declared image type');
  const stored = await storeBuffer({ buffer: file.buffer, filename: file.originalname, contentType: file.mimetype, metadata: { kind: 'employee-photo', userId } });
  return {
    originalName: file.originalname || stored.filename,
    fileName: stored.filename,
    gridFsFileId: stored.id,
    url: `/api/files/employee-assets/${stored.id}`,
    size: file.size || 0,
    mimeType: file.mimetype || '',
    uploadedAt: new Date(),
  };
}

function hoursBetween(start, end) {
  if (!start || !end || start === '--' || end === '--') return '--';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return '--';
  const minutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function normalizeAttendanceLocation(value) {
  const source = value && typeof value === 'object' ? value : null;
  if (!source) throw httpError(400, 'Live location is required to mark attendance');
  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng);
  const accuracy = Number(source.accuracy ?? 0);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw httpError(400, 'Valid live location is required to mark attendance');
  }
  const lookup = await reverseGeocodeLocation(latitude, longitude);
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    capturedAt: source.capturedAt ? new Date(source.capturedAt) : new Date(),
    mapUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
    ...(lookup ?? {}),
  };
}

async function resolveOwnerCategory(ownerUserId) {
  const owner = await AppUser.findById(ownerUserId, { category: 1 }).lean();
  return owner?.category || 'retail';
}
async function nextEmployeeId(ownerUserId) {
  const last = await Employee.findOne({ userId: ownerUserId }, { employeeId: 1 }, { sort: { createdAt: -1 } });
  const n = last ? Number.parseInt(String(last.employeeId).split('-').pop(), 10) : 0;
  return `EMP-${String(Number.isNaN(n) ? 1 : n + 1).padStart(3, '0')}`;
}

async function nextLeaveId(ownerUserId) {
  const last = await Leave.findOne({ userId: ownerUserId }, { leaveId: 1 }, { sort: { createdAt: -1 } });
  const n = last ? Number.parseInt(String(last.leaveId).split('-').pop(), 10) : 0;
  return `LV-${String(Number.isNaN(n) ? 1 : n + 1).padStart(3, '0')}`;
}

async function currentEmployee(req) {
  const { ownerUserId, employeeId } = req.employeeUser;
  if (!employeeId) throw httpError(403, 'Employee profile is required for this action');
  const employee = await Employee.findOne({ userId: ownerUserId, employeeId }).lean();
  if (!employee) throw httpError(404, 'Employee profile not found');
  return employee;
}

export { startEmployeeLogin as loginEmployeePortal } from './employeeLoginController.js';

export async function exchangeMainToken(req, res, next) {
  try {
    if (!req.user.isSuperAdmin) return next(httpError(403, 'Employee management access denied'));
    const owner = await AppUser.findById(req.user.id).lean();
    if (!owner || owner.status !== 'Active') return next(httpError(403, 'Account is not active'));
    const user = {
      id: owner._id,
      ownerUserId: owner._id,
      name: owner.name,
      email: owner.email,
      role: 'admin',
      category: owner.category || 'retail',
    };
    res.json({ token: signPortalToken(user, req.user.sessionId, { mainSession: true, authTime: req.user.authTime }), user: safePortalUser(user) });
  } catch (err) {
    next(err);
  }
}export async function getEmployeePortalMe(req, res, next) {
  try {
    let employee = null;
    if (req.employeeUser.employeeId) {
      employee = await Employee.findOne({ userId: req.employeeUser.ownerUserId, employeeId: req.employeeUser.employeeId }).lean();
    }
    const [owner, settings] = await Promise.all([
      AppUser.findById(req.employeeUser.ownerUserId).select('name businessName').lean(),
      BusinessSettings.findOne({ userId: req.employeeUser.ownerUserId }).select('logoUrl').lean(),
    ]);
    const access = employee && owner ? await rememberEmployeeAccess(employee, owner) : null;
    res.json({ user: { ...req.employeeUser, businessName: owner?.businessName || owner?.name || '', businessLogoUrl: settings?.logoUrl || '', ...(access ? { loginPath: '/employee-login', portalBasePath: access.portalBasePath } : {}) }, employee });
  } catch (err) {
    next(err);
  }
}

export async function employeeDashboard(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const employeeId = req.employeeUser.employeeId;
    const filter = { userId: ownerUserId, employeeId };
    const period = employeeMonth(req.query?.month);
    const [attendanceRows, leavesRows, payslipsRows, documents, permissions] = await Promise.all([
      Attendance.find({ ...filter, date: period.dates }).select('date status checkIn checkOut hours').sort({ date: -1 }).lean(),
      Leave.find({ userId: ownerUserId, empId: employeeId, ...period.leaves }).select('status from to days type').lean(),
      Payroll.find({ ...filter, month: period.month }).select('month net status').lean(),
      HRDocument.countDocuments({ userId: ownerUserId, empId: String(req.employeeUser.employeeObjectId) }),
      EmployeePermission.countDocuments({ ownerUserId, employeeObjectId: req.employeeUser.employeeObjectId, date: period.dates, status: 'Pending' }),
    ]);
    res.json({ month: period.month, attendance: attendanceRows.length, leaves: leavesRows.length, payslips: payslipsRows.length, presentDays: attendanceRows.filter((row) => ['Present', 'Late', 'WFH', 'On Duty'].includes(row.status)).length, pendingLeaves: leavesRows.filter((row) => row.status === 'Pending').length, documents, pendingPermissions: permissions, recentAttendance: attendanceRows.slice(0, 5), salary: payslipsRows[0] || null });
  } catch (err) {
    next(err);
  }
}

export async function checkIn(req, res, next) {
  try {
    const employee = await currentEmployee(req);
    const date = today();
    const existing = await Attendance.findOne({ userId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, date }).lean();
    if (existing?.checkIn && existing.checkIn !== '--') {
      return next(httpError(409, 'Check in already saved for today'));
    }

    const checkInTime = timeNow();
    const checkInLocation = await normalizeAttendanceLocation(req.body.location);
    const record = await Attendance.findOneAndUpdate(
      { userId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, date, $or: [{ checkIn: { $exists: false } }, { checkIn: '--' }, { checkIn: '' }] },
      { $setOnInsert: { name: employee.name, dept: employee.dept, checkOut: '--', hours: '--' }, $set: { checkIn: checkInTime, checkInLocation, status: 'Present' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.status(201).json(record);
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Check in already saved for today'));
    next(err);
  }
}

export async function checkOut(req, res, next) {
  try {
    const employee = await currentEmployee(req);
    const date = today();
    const existing = await Attendance.findOne({ userId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, date });
    if (!existing?.checkIn || existing.checkIn === '--') {
      return next(httpError(400, 'Check in first to save check out'));
    }
    if (existing.checkOut && existing.checkOut !== '--') {
      return next(httpError(409, 'Check out already saved for today'));
    }

    const checkOutTime = timeNow();
    const checkOutLocation = await normalizeAttendanceLocation(req.body.location);
    const checkIn = existing.checkIn;
    const breakUpdate = breakSummary(existing.breaks || [], checkOutTime);
    const record = await Attendance.findOneAndUpdate(
      { _id: existing._id, userId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, date, updatedAt: existing.updatedAt, __v: existing.__v, $or: [{ checkOut: { $exists: false } }, { checkOut: '--' }, { checkOut: '' }] },
      { $set: { ...breakUpdate, checkOut: checkOutTime, checkOutLocation, hours: netAttendanceHours(checkIn, checkOutTime, breakUpdate.breaks), status: existing.status === 'Late' ? 'Late' : 'Present' }, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    ).lean();
    if (!record) throw httpError(409, 'Check out already saved for today');
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function employeeMonthlyAttendance(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Attendance.find({ userId: req.employeeUser.ownerUserId, employeeId: req.employeeUser.employeeId, date: period.dates }).sort({ date: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCorrection(req, res, next) {
  try {
    const employee = await currentEmployee(req);
    const { date, checkIn = '', checkOut = '', reason } = req.body;
    if (!date || !reason) return next(httpError(400, 'Date and reason are required'));
    const correction = await AttendanceCorrection.create({ ownerUserId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, date, checkIn, checkOut, reason });
    res.status(201).json(correction);
  } catch (err) {
    next(err);
  }
}

export async function applyLeave(req, res, next) {
  try {
    const employee = await currentEmployee(req);
    const { type = 'Casual Leave', from, to, reason = '' } = req.body;
    if (!from || !to) return next(httpError(400, 'From and to dates are required'));
    const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(from) || !validDate(to) || to < from) throw httpError(400, 'Choose a valid leave date range');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw httpError(400, 'Enter a leave reason of up to 1000 characters');
    const calendarDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
    const leave = await Leave.create({ userId: req.employeeUser.ownerUserId, leaveId: await nextLeaveId(req.employeeUser.ownerUserId), name: employee.name, empId: employee.employeeId, dept: employee.dept, type, from, to, days: calendarDays, reason: reason.trim(), applied: today(), status: 'Pending', recordedBy: 'Employee Portal' });
    res.status(201).json(leave);
  } catch (err) {
    next(err);
  }
}

export async function employeeLeaveStatus(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Leave.find({ userId: req.employeeUser.ownerUserId, empId: req.employeeUser.employeeId, ...period.leaves }).sort({ from: -1, createdAt: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function employeeLeaveHistory(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Leave.find({ userId: req.employeeUser.ownerUserId, empId: req.employeeUser.employeeId, ...period.leaves }).sort({ from: -1, createdAt: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function employeePayslips(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Payroll.find({ userId: req.employeeUser.ownerUserId, employeeId: req.employeeUser.employeeId, month: period.month }).sort({ month: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function employeeHolidays(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Holiday.find({ ownerUserId: req.employeeUser.ownerUserId, date: period.dates }).sort({ date: 1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function adminDashboard(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const period = employeeMonth(req.query?.month);
    const todayDate = today();
    const ownerObjectId = new Types.ObjectId(String(ownerUserId));
    const [
      employeeStatuses,
      attendanceStatuses,
      pendingLeaves,
      pendingCorrections,
      recentEmployees,
      pendingPermissions,
    ] = await Promise.all([
      Employee.aggregate([
        { $match: { userId: ownerObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $match: { userId: ownerObjectId, date: todayDate } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Leave.countDocuments({ userId: ownerUserId, status: 'Pending', ...period.leaves }),
      AttendanceCorrection.countDocuments({ ownerUserId, status: 'Pending', date: period.dates }),
      Employee.find(
        { userId: ownerUserId },
        { employeeId: 1, name: 1, dept: 1, designation: 1, status: 1, createdAt: 1 },
      ).sort({ createdAt: -1 }).limit(5).lean(),
      EmployeePermission.countDocuments({ ownerUserId, date: period.dates, status: 'Pending' }),
    ]);

    const employeeCounts = Object.fromEntries(employeeStatuses.map((row) => [row._id, row.count]));
    const attendanceCounts = Object.fromEntries(attendanceStatuses.map((row) => [row._id, row.count]));
    const activeEmployees = employeeCounts.Active || 0;
    const inactiveEmployees = employeeCounts.Inactive || 0;
    const employees = activeEmployees + inactiveEmployees;
    const present = attendanceCounts.Present || 0;
    const late = attendanceCounts.Late || 0;
    const absent = attendanceCounts.Absent || 0;
    const onLeave = attendanceCounts['On Leave'] || 0;
    const marked = present + late + absent + onLeave;
    const notMarked = Math.max(0, activeEmployees - marked);
    const attendanceRate = activeEmployees > 0
      ? Math.round(((present + late) / activeEmployees) * 100)
      : 0;

    res.json({
      date: todayDate,
      employees,
      activeEmployees,
      inactiveEmployees,
      present,
      late,
      absent,
      onLeave,
      notMarked,
      attendanceRate,
      pendingLeaves,
      pendingCorrections,
      recentEmployees,
      pendingPermissions,
    });
  } catch (err) {
    next(err);
  }
}

export async function listAdminEmployees(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const data = await Employee.find({ userId: ownerUserId }).sort({ createdAt: -1 }).lean();
    res.json({ data: await employeesWithAccess(data, ownerUserId) });
  } catch (err) {
    next(err);
  }
}

export async function createAdminEmployee(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const owner = await AppUser.findById(ownerUserId).select('name businessName email category').lean();
    if (!owner) throw httpError(404, 'Business owner not found');
    const category = owner.category || 'retail';
    const {
      employeeId, name, email, mobileNumber, phone, department, dept, designation, joiningDate, joinDate,
      password, loginAccess = false, status = 'Active', role = 'employee', basicSalary = 0,
      gender = '', dateOfBirth = '', bloodGroup = '', address = '', branch = '', reportingManager = '',
      employmentType = 'Full Time', shift = '', workLocation = '', emergencyContact = {}, salaryStructure,
    } = req.body;
    const finalLoginAccess = parseBoolean(loginAccess, false);
    const details = employeeDetails(req.body);
    const finalEmergencyContact = parseObject(emergencyContact);
    if (password !== undefined && typeof password !== 'string') throw httpError(400, 'Password must be text');
    const visiblePassword = password || '';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) return next(httpError(400, 'Employee name and a valid email are required'));
    if (finalLoginAccess && !visiblePassword) return next(httpError(400, 'Login password is required when login access is enabled'));
    if (visiblePassword && (visiblePassword.length < 8 || Buffer.byteLength(visiblePassword, 'utf8') > 72)) return next(httpError(400, 'Password must be at least 8 characters and at most 72 bytes'));
    if (finalLoginAccess && await EmployeeLogin.exists({ ownerUserId, email: normalizeEmail(email) })) throw httpError(409, 'An employee login with this email already exists');
    const finalRole = 'employee';
    const finalEmployeeId = String(employeeId || await nextEmployeeId(ownerUserId)).trim();
    const photo = await saveEmployeePhoto(req.file, ownerUserId);
    const finalBasicSalary = salaryNumber(basicSalary);
    const employee = await Employee.create({
      ...details,
      userId: ownerUserId,
      category,
      employeeId: finalEmployeeId,
      name,
      email: normalizeEmail(email),
      phone: mobileNumber || phone || '',
      dept: department || dept || '',
      designation: designation || '',
      joinDate: joiningDate || joinDate || '',
      status,
      loginAccess: finalLoginAccess,
      employeeRole: finalRole,
      qrDisplayFields: req.body.qrDisplayFields === undefined ? employeeQrFields() : employeeQrFields(parseObject(req.body.qrDisplayFields, null), true),
      basicSalary: finalBasicSalary,
      salaryStructure: normalizeSalaryStructure(salaryStructure, finalBasicSalary),
      ...(photo ? { photo } : {}),
      gender,
      dateOfBirth,
      bloodGroup,
      address,
      branch,
      reportingManager,
      employmentType,
      shift,
      workLocation,
      emergencyContact: {
        name: String(finalEmergencyContact?.name || '').trim(),
        relationship: String(finalEmergencyContact?.relationship || '').trim(),
        phone: String(finalEmergencyContact?.phone || '').trim(),
      },
    });
    const loginSlug = slugify(employee.name);
    if (finalLoginAccess && visiblePassword) {
      await EmployeeLogin.findOneAndUpdate(
        { ownerUserId, employeeId: employee.employeeId },
        { $set: { ownerUserId, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: normalizeEmail(email), category, loginSlug, passwordHash: await bcrypt.hash(visiblePassword, 12), role: finalRole, loginEnabled: true, status: EMPLOYEE_ACTIVE_STATUSES.includes(status) ? 'Active' : 'Inactive' }, $unset: { loginPassword: 1 } },
        { upsert: true, new: true, runValidators: true },
      );
    }
    const payload = employee.toObject();
    await queueEmployeeNotification(ownerUserId, employee, { requestKey: `employee-created:${employee._id}`, kind: 'profile', title: 'Employee profile created', message: `Your employee profile ${employee.employeeId} has been created by ${owner.businessName || owner.name}. Use your employee login link and email OTP when login access is enabled.` });
    res.status(201).json({
      ...payload,
      portalAccess: await rememberEmployeeAccess(employee, owner),
      loginContext: {
        ownerUserId: String(ownerUserId),
        category,
        employeeId: employee.employeeId,
        slug: loginSlug,
      },
    });
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Employee ID or login email already exists for this account'));
    next(err);
  }
}
export async function updateAdminEmployee(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const existing = await Employee.findOne({ _id: req.params.id, userId: ownerUserId });
    if (!existing) return next(httpError(404, 'Employee not found'));

    const {
      password,
      loginAccess,
      role,
      department,
      mobileNumber,
      joiningDate,
      name,
      email,
      designation,
      status,
      basicSalary,
      gender,
      dateOfBirth,
      bloodGroup,
      address,
      branch,
      reportingManager,
      employmentType,
      shift,
      workLocation,
      emergencyContact,
      salaryStructure,
    } = req.body;

    const wantsLogin = loginAccess === undefined ? Boolean(existing.loginAccess) : parseBoolean(loginAccess, false);
    if (password !== undefined && typeof password !== 'string') throw httpError(400, 'Password must be text');
    const visiblePassword = password || '';
    const shouldChangePassword = password !== undefined && password !== '';
    const currentLogin = await EmployeeLogin.findOne({ ownerUserId, employeeObjectId: existing._id }).select('+passwordHash');
    if (wantsLogin && !shouldChangePassword && !currentLogin?.passwordHash) throw httpError(400, 'Set a password before enabling employee login');
    if (visiblePassword && (visiblePassword.length < 8 || Buffer.byteLength(visiblePassword, 'utf8') > 72)) return next(httpError(400, 'Password must be at least 8 characters and at most 72 bytes'));
    if (wantsLogin && shouldChangePassword && !visiblePassword) {
      return next(httpError(400, 'New password is required when changing login password'));
    }

    const finalRole = 'employee';
    const finalName = String(name ?? existing.name).trim();
    const finalEmail = normalizeEmail(email ?? existing.email);
    if (!finalName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail)) return next(httpError(400, 'Employee name and a valid email are required'));
    if (wantsLogin && await EmployeeLogin.exists({ ownerUserId, email: finalEmail, employeeObjectId: { $ne: existing._id } })) throw httpError(409, 'An employee login with this email already exists');

    const finalBasicSalary = Number.isFinite(Number(basicSalary)) ? salaryNumber(basicSalary, existing.basicSalary) : existing.basicSalary;
    const update = {
      ...employeeDetails(req.body),
      name: finalName,
      email: finalEmail,
      phone: mobileNumber !== undefined ? String(mobileNumber ?? '').trim() : existing.phone,
      dept: department !== undefined ? String(department ?? '').trim() : existing.dept,
      designation: designation !== undefined ? String(designation ?? '').trim() : existing.designation,
      joinDate: joiningDate !== undefined ? String(joiningDate ?? '').trim() : existing.joinDate,
      basicSalary: finalBasicSalary,
      loginAccess: wantsLogin,
      status: ['Active', 'Inactive', 'Probation', 'On Leave', 'Resigned', 'Terminated'].includes(status) ? status : existing.status,
      employeeRole: finalRole,
      category: req.employeeUser.category || existing.category || await resolveOwnerCategory(ownerUserId),
      gender: gender !== undefined ? String(gender || '').trim() : existing.gender,
      dateOfBirth: dateOfBirth !== undefined ? String(dateOfBirth || '').trim() : existing.dateOfBirth,
      bloodGroup: bloodGroup !== undefined ? String(bloodGroup || '').trim() : existing.bloodGroup,
      address: address !== undefined ? String(address || '').trim() : existing.address,
      branch: branch !== undefined ? String(branch || '').trim() : existing.branch,
      reportingManager: reportingManager !== undefined ? String(reportingManager || '').trim() : existing.reportingManager,
      employmentType: employmentType !== undefined ? String(employmentType || '').trim() : existing.employmentType,
      shift: shift !== undefined ? String(shift || '').trim() : existing.shift,
      workLocation: workLocation !== undefined ? String(workLocation || '').trim() : existing.workLocation,
    };
    if (finalEmail !== normalizeEmail(existing.email)) {
      update.emailVerifiedAddress = '';
      update.emailVerifiedAt = null;
    }
    if (req.body.qrDisplayFields !== undefined) update.qrDisplayFields = employeeQrFields(parseObject(req.body.qrDisplayFields, null), true);
    if (emergencyContact !== undefined) {
      const contact = parseObject(emergencyContact);
      update.emergencyContact = {
        name: String(contact.name || '').trim(),
        relationship: String(contact.relationship || '').trim(),
        phone: String(contact.phone || '').trim(),
      };
    }
    if (salaryStructure !== undefined || basicSalary !== undefined) {
      update.salaryStructure = normalizeSalaryStructure(salaryStructure, finalBasicSalary, existing.salaryStructure);
    }

    const updatedPhoto = await saveEmployeePhoto(req.file, ownerUserId);
    if (updatedPhoto) update.photo = updatedPhoto;
    const employee = await Employee.findOneAndUpdate(
      { _id: existing._id, userId: ownerUserId },
      { $set: update, $unset: { loginPassword: 1 } },
      { new: true, runValidators: true },
    ).lean();

    if (wantsLogin) {
      const loginUpdate = {
        ownerUserId,
        employeeObjectId: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        email: normalizeEmail(employee.email),
        category: employee.category || update.category,
        loginSlug: slugify(employee.name),
        role: employee.employeeRole,
        loginEnabled: true,
        status: EMPLOYEE_ACTIVE_STATUSES.includes(employee.status) ? 'Active' : 'Inactive',
      };
      if (shouldChangePassword) {
        loginUpdate.passwordHash = await bcrypt.hash(visiblePassword, 12);
      }

      const existingLogin = await EmployeeLogin.findOne({ ownerUserId, employeeId: employee.employeeId }).select('+passwordHash');
      if (existingLogin) {
        await EmployeeLogin.updateOne({ _id: existingLogin._id }, { $set: loginUpdate, $unset: { loginPassword: 1 } }, { runValidators: true });
      } else {
        const initialPassword = shouldChangePassword ? visiblePassword : '';
        if (!initialPassword) return next(httpError(400, 'Login password is required when login access is enabled'));
        await EmployeeLogin.create({
          ...loginUpdate,
          passwordHash: await bcrypt.hash(initialPassword, SALT_ROUNDS),
        });
      }
    } else {
      await EmployeeLogin.updateMany(
        { ownerUserId, employeeId: employee.employeeId },
        { $set: { loginEnabled: false, status: EMPLOYEE_ACTIVE_STATUSES.includes(employee.status) ? 'Active' : 'Inactive' } },
      );
    }

    res.json(employee);
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Employee ID or login email already exists for this account'));
    next(err);
  }
}
export async function deleteAdminEmployee(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const employee = await Employee.findOneAndDelete({ _id: req.params.id, userId: ownerUserId }).lean();
    if (!employee) return next(httpError(404, 'Employee not found'));
    await Promise.all([
      EmployeeLogin.deleteMany({ ownerUserId, employeeId: employee.employeeId }),
      Attendance.deleteMany({ userId: ownerUserId, employeeId: employee.employeeId }),
      AttendanceCorrection.deleteMany({ ownerUserId, employeeId: employee.employeeId }),
      Leave.deleteMany({ userId: ownerUserId, empId: employee.employeeId }),
      Payroll.deleteMany({ userId: ownerUserId, employeeId: employee.employeeId }),
    ]);
    res.json({ message: 'Employee deleted', employee });
  } catch (err) {
    next(err);
  }
}
export async function changeBreak(req, res, next) {
  try {
    const employee = await currentEmployee(req);
    if (!['start', 'end'].includes(req.body.action)) throw httpError(400, 'Choose start or end break');
    const filter = { userId: req.employeeUser.ownerUserId, employeeId: employee.employeeId, date: today() };
    const existing = await Attendance.findOne(filter).lean();
    if (!existing?.checkIn || existing.checkIn === '--' || (existing.checkOut && existing.checkOut !== '--')) throw httpError(409, 'Breaks are available between check in and check out');
    const breaks = (existing.breaks || []).map(({ start, end }) => ({ start, end }));
    const active = breaks.length && !breaks.at(-1).end;
    if (req.body.action === 'start') {
      if (active) throw httpError(409, 'A break is already in progress');
      if (breaks.length >= 30) throw httpError(400, 'Daily break limit reached');
      breaks.push({ start: timeNow(), end: '' });
    } else {
      if (!active) throw httpError(409, 'Start a break first');
      breaks.at(-1).end = timeNow();
    }
    const summary = breakSummary(breaks);
    if (breaks.some((row) => row.start < existing.checkIn)) throw httpError(400, 'Breaks cannot start before check in');
    const record = await Attendance.findOneAndUpdate({ ...filter, _id: existing._id, updatedAt: existing.updatedAt, __v: existing.__v }, { $set: summary, $inc: { __v: 1 } }, { new: true, runValidators: true }).lean();
    if (!record) throw httpError(409, 'Attendance changed. Refresh and try again');
    res.json(record);
  } catch (error) { next(error); }
}

export async function adminTodayAttendance(req, res, next) {
  try {
    const date = String(req.query.date || today()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) {
      return next(httpError(400, 'A valid attendance date is required'));
    }
    const data = await Attendance.find({ userId: req.employeeUser.ownerUserId, date }).sort({ name: 1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function adminMonthlyAttendance(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Attendance.find({ userId: req.employeeUser.ownerUserId, date: period.dates }).sort({ date: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function markAdminAttendance(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const {
      employeeId,
      date = today(),
      status = 'Present',
      checkIn = '--',
      checkOut = '--',
      remarks = '',
      shift = '',
    } = req.body;
    if (!employeeId) return next(httpError(400, 'Employee is required'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return next(httpError(400, 'A valid attendance date is required'));
    const employee = await Employee.findOne({ userId: ownerUserId, employeeId }).lean();
    if (!employee) return next(httpError(404, 'Employee not found'));
    const allowed = ['Present', 'Late', 'Absent', 'On Leave', 'WFH', 'On Duty', 'Half Day', 'Weekly Off', 'Holiday'];
    const finalStatus = allowed.includes(status) ? status : 'Present';
    const current = await Attendance.findOne({ userId: ownerUserId, employeeId, date }).lean();
    const breaks = req.body.breaks === undefined ? current?.breaks || [] : req.body.breaks;
    if (!Array.isArray(breaks) || breaks.length > 30 || breaks.some((row) => !row || typeof row.start !== 'string' || (row.end != null && typeof row.end !== 'string'))) throw httpError(400, 'Enter valid break times');
    if (breaks.length && (!checkIn || checkIn === '--' || breaks.some((row) => row.start < checkIn || (checkOut && checkOut !== '--' && (row.start > checkOut || row.end > checkOut))))) throw httpError(400, 'Breaks must be within attendance times');
    const summary = breakSummary(breaks, checkOut && checkOut !== '--' ? checkOut : undefined);
    const record = await Attendance.findOneAndUpdate(
      { userId: ownerUserId, employeeId, date },
      {
        $set: {
          userId: ownerUserId,
          employeeId,
          name: employee.name,
          dept: employee.dept || '',
          date,
          status: finalStatus,
          checkIn: checkIn || '--',
          checkOut: checkOut || '--',
          ...summary,
          hours: checkIn && checkIn !== '--' && checkOut && checkOut !== '--' ? netAttendanceHours(checkIn, checkOut, summary.breaks) : '--',
          shift: shift || employee.shift || '',
          remarks,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    res.json(record);
  } catch (err) {
    next(err);
  }
}

export async function adminCorrections(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await AttendanceCorrection.find({ ownerUserId: req.employeeUser.ownerUserId, date: period.dates }).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createAdminCorrection(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const employeeId = String(req.body.employeeId || '').trim();
    const date = String(req.body.date || today()).trim();
    const reason = String(req.body.reason || '').trim();
    if (!employeeId) return next(httpError(400, 'Employee is required'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return next(httpError(400, 'A valid correction date is required'));
    if (!reason) return next(httpError(400, 'Correction reason is required'));
    const employee = await Employee.findOne({ userId: ownerUserId, employeeId }).lean();
    if (!employee) return next(httpError(404, 'Employee not found'));
    const correction = await AttendanceCorrection.create({
      ownerUserId,
      employeeId,
      name: employee.name,
      dept: employee.dept || '',
      date,
      checkIn: String(req.body.checkIn || '').trim(),
      checkOut: String(req.body.checkOut || '').trim(),
      reason,
      status: 'Pending',
    });
    res.status(201).json(correction);
  } catch (err) {
    next(err);
  }
}

export async function updateCorrection(req, res, next) {
  try {
    const { status } = req.body;
    const correction = await AttendanceCorrection.findOneAndUpdate({ _id: req.params.id, ownerUserId: req.employeeUser.ownerUserId }, { $set: { status, reviewedBy: req.employeeUser.name, reviewedAt: new Date() } }, { new: true }).lean();
    if (!correction) return next(httpError(404, 'Correction request not found'));
    if (status === 'Approved') {
      const checkIn = correction.checkIn || '--';
      const checkOut = correction.checkOut || '--';
      await Attendance.findOneAndUpdate({ userId: correction.ownerUserId, employeeId: correction.employeeId, date: correction.date }, { $set: { name: correction.name, dept: correction.dept, checkIn, checkOut, hours: hoursBetween(checkIn, checkOut), status: 'Present' } }, { upsert: true, new: true });
    }
    res.json(correction);
  } catch (err) {
    next(err);
  }
}

export async function adminLeaves(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Leave.find({ userId: req.employeeUser.ownerUserId, ...period.leaves }).sort({ from: -1, createdAt: -1 }).lean();
    if (req.query?.includeAnnualBalances !== 'true') return res.json({ data, month: period.month });
    // The visible history is monthly; annual allowance totals still include
    // earlier months so the remaining balance cannot be overstated.
    const year = period.month.slice(0, 4);
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const yearRows = await Leave.find({ userId: req.employeeUser.ownerUserId, from: { $lte: end }, to: { $gte: start }, status: { $in: ['Approved', 'Pending'] } }).lean();
    const summaries = new Map();
    for (const row of yearRows) {
      const key = `${row.empId}:${row.type}`;
      const summary = summaries.get(key) || { empId: row.empId, type: row.type, used: 0, pending: 0 };
      summary[row.status === 'Approved' ? 'used' : 'pending'] += leaveDaysInRange(row, start, end);
      summaries.set(key, summary);
    }
    res.json({ data, month: period.month, balanceYear: year, balances: [...summaries.values()] });
  } catch (err) {
    next(err);
  }
}

export async function createAdminLeave(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const empId = String(req.body.empId || req.body.employeeId || '').trim();
    const employee = await Employee.findOne({ userId: ownerUserId, employeeId: empId }).lean();
    if (!employee) return next(httpError(404, 'Employee not found'));

    const from = String(req.body.from || '').trim();
    const to = String(req.body.to || from).trim();
    if (!from || !to) return next(httpError(400, 'From and to dates are required'));

    const attachment = await saveLeaveAttachment(req.file, ownerUserId);
    const leave = await Leave.create({
      userId: ownerUserId,
      leaveId: await nextLeaveId(ownerUserId),
      name: employee.name,
      empId: employee.employeeId,
      dept: employee.dept,
      type: req.body.type || 'Casual Leave',
      from,
      to,
      days: Number(req.body.days) || 1,
      reason: req.body.reason || '',
      applied: today(),
      status: req.body.status || 'Pending',
      recordedBy: req.employeeUser.name || 'HR Admin',
      ...(attachment ? { attachment } : {}),
    });
    res.status(201).json(leave);
  } catch (err) {
    next(err);
  }
}

export async function updateLeaveStatus(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const status = String(req.body.status || '').trim();
    if (!['Approved', 'Pending', 'Rejected'].includes(status)) return next(httpError(400, 'Leave status must be Approved, Pending or Rejected'));
    const leave = await Leave.findOneAndUpdate({ _id: req.params.id, userId: ownerUserId }, { $set: { status } }, { new: true }).lean();
    if (!leave) return next(httpError(404, 'Leave request not found'));
    const leaveDates = datesBetween(leave.from, leave.to);
    const leaveRemark = `Leave approved: ${leave.leaveId} (${leave.type})`;

    if (status === 'Approved' && leaveDates.length) {
      const employee = await Employee.findOne({ userId: ownerUserId, employeeId: leave.empId }).lean();
      await Attendance.bulkWrite(leaveDates.map((date) => ({
        updateOne: {
          filter: { userId: ownerUserId, employeeId: leave.empId, date },
          update: {
            $set: {
              userId: ownerUserId,
              employeeId: leave.empId,
              name: leave.name,
              dept: leave.dept || '',
              date,
              checkIn: '--',
              checkOut: '--',
              hours: '--',
              shift: employee?.shift || '',
              remarks: leaveRemark,
              status: 'On Leave',
            },
          },
          upsert: true,
        },
      })), { ordered: false });
    }

    if (status !== 'Approved' && leaveDates.length) {
      await Attendance.deleteMany({
        userId: ownerUserId,
        employeeId: leave.empId,
        date: { $in: leaveDates },
        status: 'On Leave',
        remarks: leaveRemark,
      });
    }

    await queueEmployeeEvent(ownerUserId, leave.empId, { requestKey: `leave:${leave._id}:${status}`, kind: 'leave', title: `Leave request ${status.toLowerCase()}`, message: `Your ${leave.type} request for ${leave.from} to ${leave.to} is ${status.toLowerCase()}.` });

    res.json(leave);
  } catch (err) {
    next(err);
  }
}

export async function adminPayroll(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const filter = { userId: req.employeeUser.ownerUserId, month: period.month };
    const data = await Payroll.find(filter).sort({ month: -1, createdAt: -1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function generateAdminPayroll(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const { month } = employeeMonth(req.body.month);
    const employees = await Employee.find({ userId: ownerUserId, status: { $ne: 'Terminated' } }).lean();
    const operations = employees.map((employee) => {
      const basic = Number(employee.basicSalary || 0);
      const structure = normalizeSalaryStructure(employee.salaryStructure, basic);
      const allowances = ['hra', 'specialAllowance', 'conveyanceAllowance', 'medicalAllowance', 'otherAllowances']
        .reduce((sum, key) => sum + salaryNumber(structure[key]), 0);
      const deductions = ['pf', 'esi', 'professionalTax', 'tds', 'otherDeduction', 'loanDeduction']
        .reduce((sum, key) => sum + salaryNumber(structure[key]), 0);
      return {
        updateOne: {
          filter: { userId: ownerUserId, employeeId: employee.employeeId, month },
          update: {
            $set: {
              userId: ownerUserId,
              employeeId: employee.employeeId,
              name: employee.name,
              dept: employee.dept || '',
              month,
              basic,
              allowances,
              deductions,
              net: Math.max(0, basic + allowances - deductions),
              salaryStructure: structure,
              status: 'Pending',
            },
          },
          upsert: true,
        },
      };
    });
    if (operations.length) await Payroll.bulkWrite(operations, { ordered: false });
    const data = await Payroll.find({ userId: ownerUserId, month }).sort({ createdAt: -1 }).lean();
    for (const row of data) await queueEmployeeEvent(ownerUserId, row.employeeId, { requestKey: `payroll-generated:${row._id}:${row.updatedAt?.getTime() || month}`, kind: 'payroll', title: 'Payslip available', message: `Your payslip for ${month} is available in the employee portal. Payment status: ${row.status}.` });
    res.status(201).json({ data, message: `Payroll generated for ${data.length} employee(s).` });
  } catch (err) {
    next(err);
  }
}

export async function approveAdminPayroll(req, res, next) {
  try {
    const ownerUserId = req.employeeUser.ownerUserId;
    const month = String(req.body.month || '').trim();
    employeeMonth(month);
    const pending = await Payroll.find({ userId: ownerUserId, month, status: { $ne: 'Paid' } }).select('_id').lean();
    await Payroll.updateMany({ userId: ownerUserId, month }, { $set: { status: 'Paid' } });
    const data = await Payroll.find({ userId: ownerUserId, month }).sort({ createdAt: -1 }).lean();
    for (const row of data.filter((item) => pending.some((record) => String(record._id) === String(item._id)))) await queueEmployeeEvent(ownerUserId, row.employeeId, { requestKey: `payroll-paid:${row._id}:${row.updatedAt?.getTime() || month}`, kind: 'payroll', title: 'Payroll marked paid', message: `Your payroll for ${month} has been marked paid. View your payslip for details.` });
    res.json({ data, message: `Payroll approved for ${data.length} employee(s).` });
  } catch (err) {
    next(err);
  }
}


export async function updateAdminPayroll(req, res, next) {
  try {
    const basic = Number(req.body.basic);
    const allowances = Number(req.body.allowances);
    const deductions = Number(req.body.deductions);
    const status = String(req.body.status || '').trim();
    if (![basic, allowances, deductions].every(Number.isFinite) || [basic, allowances, deductions].some((value) => value < 0)) {
      return next(httpError(400, 'Salary amounts must be valid non-negative numbers'));
    }
    if (!['Paid', 'Pending'].includes(status)) {
      return next(httpError(400, 'Payroll status must be Paid or Pending'));
    }
    const payroll = await Payroll.findOneAndUpdate(
      { _id: req.params.id, userId: req.employeeUser.ownerUserId },
      {
        $unset: { salaryStructure: 1 },
        $set: {
          basic,
          allowances,
          deductions,
          net: Math.max(0, basic + allowances - deductions),
          status,
        },
      },
      { new: true, runValidators: true },
    ).lean();
    if (!payroll) return next(httpError(404, 'Payroll record not found'));
    res.json(payroll);
  } catch (err) {
    next(err);
  }
}

export async function adminHolidays(req, res, next) {
  try {
    const period = employeeMonth(req.query?.month);
    const data = await Holiday.find({ ownerUserId: req.employeeUser.ownerUserId, date: period.dates }).sort({ date: 1 }).lean();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createHoliday(req, res, next) {
  try {
    const { name, date, type = 'Company', description = '' } = req.body;
    if (!name || !date) return next(httpError(400, 'Holiday name and date are required'));
    const holiday = await Holiday.create({ ownerUserId: req.employeeUser.ownerUserId, name, date, type, description });
    res.status(201).json(holiday);
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Holiday already exists for this date'));
    next(err);
  }
}





