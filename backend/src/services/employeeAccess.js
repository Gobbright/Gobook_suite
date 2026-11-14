import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { AppUser } from '../models/AppUser.js';
import { Employee } from '../models/Employee.js';
import { httpError } from '../utils/httpError.js';
import { employeeQrFields, employeeQrProfile, employeeEmailIsVerified } from './employeeQrProfile.js';

export const EMPLOYEE_ACTIVE_STATUSES = ['Active', 'Probation', 'On Leave'];
export function businessSlug(name = '') {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'business';
}
export function employeeLinkCode(employee) {
  return createHmac('sha256', env.jwtSecret).update(`employee-link:${employee.userId}:${employee._id}:${employee.employeeId}:${employee.portalVersion || 1}`).digest('hex');
}
export function employeeCredential(passwordHash, employee) {
  return `${passwordHash}:${employee.portalVersion || 1}`;
}
export function employeeAccessView(employee, owner) {
  const businessName = owner.businessName || owner.name || 'Business';
  const slug = `${businessSlug(businessName)}-${employeeLinkCode(employee).slice(0, 8)}`;
  const portalBasePath = `/employee/${slug}/${encodeURIComponent(employee.employeeId)}`;
  const loginPath = `/employee-login/${slug}/${encodeURIComponent(employee.employeeId)}`;
  const qrDisplayFields = employeeQrFields(employee.qrDisplayFields);
  const photoUrl = employee.photo?.gridFsFileId && qrDisplayFields.photo ? `/api/employee/auth/link-photo?${new URLSearchParams({ businessSlug: slug, employeeId: employee.employeeId })}` : '';
  return { businessName, businessSlug: slug, ownerUserId: String(owner._id), employeeId: employee.employeeId, loginPath, commonLoginPath: '/employee-login', businessUsername: owner.email || '', portalBasePath, qrDisplayFields, qrProfile: employeeQrProfile(employee, qrDisplayFields, photoUrl), emailVerified: employeeEmailIsVerified(employee), emailVerifiedAt: employeeEmailIsVerified(employee) ? employee.emailVerifiedAt : null, loginEnabled: Boolean(employee.loginAccess && EMPLOYEE_ACTIVE_STATUSES.includes(employee.status)) };
}
export async function rememberEmployeeAccess(employee, owner) {
  const view = employeeAccessView(employee, owner);
  if (employee.portalAlias !== view.businessSlug) await Employee.updateOne({ _id: employee._id, userId: employee.userId }, { $set: { portalAlias: view.businessSlug } });
  return view;
}
export async function employeesWithAccess(rows, ownerUserId) {
  const owner = await AppUser.findById(ownerUserId).select('name businessName email').lean();
  if (!owner) throw httpError(404, 'Business owner not found');
  const data = rows.map((employee) => ({ ...employee, portalAccess: employeeAccessView(employee, owner) }));
  const updates = data.filter((employee) => employee.portalAlias !== employee.portalAccess.businessSlug).map((employee) => ({ updateOne: { filter: { _id: employee._id, userId: ownerUserId }, update: { $set: { portalAlias: employee.portalAccess.businessSlug } } } }));
  if (updates.length) await Employee.bulkWrite(updates, { ordered: false });
  return data;
}
export async function resolveEmployeeLink({ ownerUserId, employeeId, businessSlug: requestedSlug, code }) {
  if (typeof employeeId === 'string' && employeeId.length > 0 && employeeId.length <= 100 && typeof requestedSlug === 'string' && /-[a-f\d]{8}$/.test(requestedSlug)) {
    const matches = await Employee.find({ portalAlias: requestedSlug, employeeId }).limit(2).lean();
    const employee = matches.length === 1 ? matches[0] : null;
    if (employee && (!ownerUserId || String(employee.userId) === ownerUserId)) {
      const owner = await AppUser.findById(employee.userId).select('name businessName category status email').lean();
      if (owner?.status === 'Active' && employeeAccessView(employee, owner).businessSlug === requestedSlug) return { owner, employee };
    }
    throw httpError(404, 'Employee login link is invalid or has been reset. Ask your administrator for the latest link.');
  }
  if (typeof ownerUserId !== 'string' || !/^[a-f\d]{24}$/i.test(ownerUserId)
    || typeof employeeId !== 'string' || !employeeId || employeeId.length > 100
    || typeof requestedSlug !== 'string' || typeof code !== 'string' || !/^[a-f\d]{64}$/i.test(code)) throw httpError(404, 'Employee login link is invalid or has been reset. Ask your administrator for the latest link.');
  const [owner, employee] = await Promise.all([
    AppUser.findById(ownerUserId).select('name businessName category status email').lean(),
    Employee.findOne({ userId: ownerUserId, employeeId }).lean(),
  ]);
  if (!owner || owner.status !== 'Active' || !employee) throw httpError(404, 'Employee login link is unavailable');
  const expected = employeeLinkCode(employee);
  if (requestedSlug !== businessSlug(owner.businessName || owner.name) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(code, 'hex'))) {
    throw httpError(404, 'Employee login link is invalid or has been reset. Ask your administrator for the latest link.');
  }
  return { owner, employee };
}
