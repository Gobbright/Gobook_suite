import { env } from '../config/env.js';
import { httpError } from '../utils/httpError.js';

export const HUMAN_VERIFICATION_PATHS = new Map([
  ['/auth/login', 'login'], ['/auth/google', 'login'], ['/admin/login', 'admin_login'],
  ['/employee/auth/login', 'employee_login'], ['/auth/register', 'register'],
  ['/auth/email-otp/start', 'email_login'], ['/auth/forgot-password', 'password_reset'],
]);

export function getHumanVerificationConfig(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ enabled: env.turnstile.enabled, siteKey: env.turnstile.siteKey });
}

export async function verifyHumanToken(token, action, { config = env.turnstile, request = fetch, remoteIp = '' } = {}) {
  if (!config.enabled) return;
  if (!config.siteKey || !config.secretKey) throw httpError(503, 'Human verification is not configured. Contact support.');
  if (typeof token !== 'string' || !token || token.length > 2048) throw httpError(400, 'Complete the “I’m not a robot” verification.');
  let result;
  try {
    const response = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.secretKey, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Verification unavailable');
    result = await response.json();
  } catch {
    throw httpError(503, 'Human verification is temporarily unavailable. Please try again.');
  }
  if (!result.success || result.action !== action || !config.hostnames.includes(result.hostname)) {
    throw httpError(400, 'Human verification expired or failed. Please try again.');
  }
}

export async function requireHumanVerification(req, _res, next) {
  try {
    const action = HUMAN_VERIFICATION_PATHS.get(req.path.toLowerCase().replace(/\/+$/, ''));
    if (req.method === 'POST' && action) await verifyHumanToken(req.get('x-human-verification'), action, { remoteIp: req.ip });
    next();
  } catch (error) { next(error); }
}
