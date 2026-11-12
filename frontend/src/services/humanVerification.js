import { API_BASE_URL } from './apiBase.js';

const actions = new Map([
  ['/auth/login', 'login'], ['/auth/google', 'login'], ['/admin/login', 'admin_login'],
  ['/employee/auth/login', 'employee_login'], ['/auth/register', 'register'],
  ['/auth/email-otp/start', 'email_login'], ['/auth/forgot-password', 'password_reset'],
]);
let scriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const timeout = setTimeout(() => { script.remove(); scriptPromise = null; reject(new Error('Verification timed out. Please try again.')); }, 20000);
    script.onload = () => { clearTimeout(timeout); resolve(window.turnstile); };
    script.onerror = () => { clearTimeout(timeout); script.remove(); scriptPromise = null; reject(new Error('Unable to load human verification. Please try again.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function showVerification(siteKey, action) {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'human-verification-title');
    Object.assign(dialog.style, { padding: '24px', border: '1px solid #cbd5e1', borderRadius: '16px', maxWidth: '380px', width: 'calc(100% - 32px)', color: '#0f172a', background: '#fff', boxShadow: '0 24px 80px #0005', zIndex: '2147483647' });
    const title = document.createElement('h2');
    title.id = 'human-verification-title';
    title.textContent = 'I’m not a robot';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '700', margin: '0 0 8px' });
    const description = document.createElement('p');
    description.textContent = 'Complete this security check to continue.';
    Object.assign(description.style, { fontSize: '14px', margin: '0 0 20px' });
    const widget = document.createElement('div');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, { marginTop: '20px', padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' });
    dialog.append(title, description, widget, cancel);
    document.body.appendChild(dialog);
    let widgetId;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Verification expired. Please try again.')), 180000);
    function finish(error, token) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (widgetId !== undefined) turnstile.remove(widgetId);
      dialog.close();
      dialog.remove();
      previousFocus?.focus?.();
      if (error) reject(error); else resolve(token);
    }
    cancel.onclick = () => finish(new Error('Human verification was cancelled.'));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(new Error('Human verification was cancelled.')); });
    try {
      dialog.showModal();
      widgetId = turnstile.render(widget, {
        sitekey: siteKey, action, theme: 'light', size: 'flexible',
        callback: (token) => finish(null, token),
        'error-callback': () => { finish(new Error('Human verification failed. Please try again.')); return true; },
        'expired-callback': () => finish(new Error('Verification expired. Please try again.')),
      });
    } catch { finish(new Error('Unable to start human verification. Please try again.')); }
  });
}

export async function humanVerificationHeaders(path, method = 'GET') {
  const action = actions.get(path);
  if (method.toUpperCase() !== 'POST' || !action) return {};
  const response = await fetch(`${API_BASE_URL}/auth/security-config`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  // Older APIs do not expose this public route; their authentication catch-all
  // returns 401 (or 404). Let the actual auth endpoint enforce its own policy.
  // Never treat provider errors, rate limits or network failures as disabled.
  if (response.status === 401 || response.status === 404) return {};
  if (!response.ok) throw new Error('Unable to check sign-in security. Please try again.');
  const config = await response.json();
  if (config?.enabled === false) return {};
  if (config?.enabled !== true || typeof config.siteKey !== 'string' || !config.siteKey.trim()) {
    throw new Error('Human verification is not configured. Contact support.');
  }
  return { 'X-Human-Verification': await showVerification(config.siteKey, action) };
}
