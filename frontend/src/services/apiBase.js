const DEFAULT_API_URL = 'https://api.gobooksuite.com/api';

function normalizeApiUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('VITE_API_URL must be a valid absolute URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('VITE_API_URL must use HTTP or HTTPS');
  const normalized = url.replace(/\/+$/, '');
  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

const configuredApiUrl = import.meta.env.VITE_API_URL;
if (import.meta.env.PROD && (!configuredApiUrl || /localhost|127\.0\.0\.1/i.test(configuredApiUrl))) {
  throw new Error('Set VITE_API_URL to the production HTTPS backend before building');
}
if (import.meta.env.PROD && !String(configuredApiUrl).startsWith('https://')) {
  throw new Error('VITE_API_URL must use HTTPS in production');
}
const fallbackApiUrl = DEFAULT_API_URL;
const resolvedApiUrl = configuredApiUrl || fallbackApiUrl;

export const API_BASE_URL = normalizeApiUrl(resolvedApiUrl);
export const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');
