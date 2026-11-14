export const BUSINESS_EMAIL_CHANGED = 'gobook:business-email-changed';

export function businessEmailVerificationInput(email, appPassword) {
  const address = String(email || '').trim().toLowerCase();
  const password = String(appPassword || '').replace(/\s/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid business Gmail address.');
  if (password.length !== 16) throw new Error('Enter the 16-character Google app password. Spaces between groups are accepted.');
  return { email: address, appPassword: password };
}

export function notifyBusinessEmailChanged() {
  window.dispatchEvent(new Event(BUSINESS_EMAIL_CHANGED));
  try { localStorage.setItem(BUSINESS_EMAIL_CHANGED, String(Date.now())); } catch { /* Storage may be unavailable. */ }
}

export function requiresVerifiedBusinessEmail(pathname) {
  const path = String(pathname || '').toLowerCase().replace(/\/+$/, '');
  return /^\/email-marketing(?:\/|$)/.test(path)
    || path === '/employee-management/employees/add';
}
