export const QR_DISPLAY_FIELDS = [
  ['photo', 'Employee photo'], ['name', 'Employee name'], ['employeeId', 'Employee ID'], ['role', 'Role / designation'],
  ['address', 'Address'], ['phone', 'Phone number'], ['email', 'Email address'],
];
export const DEFAULT_QR_FIELDS = { photo: true, name: true, employeeId: true, role: true, address: true, phone: true, email: false };

function loginUrlAtOrigin(path, origin) {
  try {
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.origin !== origin.replace(/\/$/, '')) return '';
    return new URL(path, base.origin).href;
  } catch { return ''; }
}

export function employeeLoginPageUrl(origin = globalThis.location?.origin) {
  return loginUrlAtOrigin('/employee-login', origin);
}

export function employeeLoginUrl(access, origin = globalThis.location?.origin) {
  const path = access?.loginPath;
  if (typeof path !== 'string' || !/^\/employee-login\/[^/?#]+\/[^/?#]+$/.test(path)) return '';
  try {
    if (path.split('/').slice(2).some(segment => /^[.]{1,2}$/.test(decodeURIComponent(segment)) || /[\\/\x00-\x1f\x7f]/.test(decodeURIComponent(segment)))) return '';
    const url = loginUrlAtOrigin(path, origin);
    return url && new URL(url).pathname === path ? url : '';
  } catch { return ''; }
}
export function selectedQrProfile(identity, fields) {
  return Object.fromEntries(Object.entries(identity || {}).filter(([key]) => fields?.[key === 'photoUrl' ? 'photo' : key] === true));
}

export function employeeLoginRows(employees = [], origin = globalThis.location?.origin) {
  return employees.flatMap((employee) => {
    const url = employeeLoginUrl(employee.portalAccess, origin);
    return url ? [{ 'Employee name': employee.name || '', 'Employee ID': employee.employeeId || '', 'Business username': employee.portalAccess?.businessUsername || '', 'Login URL': url }] : [];
  });
}
