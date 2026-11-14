import { httpError } from '../utils/httpError.js';

export const EMPLOYEE_QR_DEFAULTS = Object.freeze({ photo: true, name: true, employeeId: true, role: true, address: true, phone: true, email: false });

export function employeeQrFields(input, strict = false) {
  const value = input?.toObject ? input.toObject() : input;
  if (strict && (!value || typeof value !== 'object' || Array.isArray(value))) throw httpError(400, 'Choose the details to show on this employee QR.');
  if (strict && Object.entries(value).some(([key, selected]) => !Object.hasOwn(EMPLOYEE_QR_DEFAULTS, key) || typeof selected !== 'boolean')) throw httpError(400, 'QR display options must be valid field selections.');
  return Object.fromEntries(Object.entries(EMPLOYEE_QR_DEFAULTS).map(([key, fallback]) => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback]));
}

export function employeeEmailIsVerified(employee) {
  return Boolean(employee.emailVerifiedAt && employee.emailVerifiedAddress && employee.emailVerifiedAddress === String(employee.email || '').trim().toLowerCase());
}

export function employeeQrProfile(employee, fields = employeeQrFields(employee.qrDisplayFields), photoUrl = '') {
  const values = { name: employee.name || '', employeeId: employee.employeeId || '', role: employee.designation || 'Employee', address: employee.address || '', phone: employee.phone || '', email: employee.email || '' };
  const profile = Object.fromEntries(Object.entries(values).filter(([key]) => fields[key]));
  if (fields.photo && photoUrl) profile.photoUrl = photoUrl;
  return profile;
}
