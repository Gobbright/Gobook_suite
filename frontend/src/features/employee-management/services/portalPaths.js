const employeeScreens = new Set(['dashboard', 'attendance', 'attendance/monthly', 'attendance/correction', 'leave/apply', 'leave/status', 'leave/history', 'payslips', 'holidays', 'profile', 'documents', 'permissions']);

export function employeePortalBase(user) {
  const base = user?.portalBasePath || '';
  return /^\/employee\/[^/?#]+\/(?:[a-f\d]{24}\/)?[^/?#]+$/i.test(base) ? base : '';
}
export function employeeScreenPath(user, screen = 'dashboard') {
  const safeScreen = employeeScreens.has(screen) ? screen : 'dashboard';
  const base = employeePortalBase(user) || '/employee';
  return safeScreen === 'dashboard' ? base : `${base}/${safeScreen}`;
}
export function legacyEmployeeScreen(pathname) {
  const screen = pathname.replace(/^\/employee\/?/, '').replace(/\/+$/, '');
  return employeeScreens.has(screen) ? screen : 'dashboard';
}
