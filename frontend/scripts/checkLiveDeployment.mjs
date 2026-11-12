const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://gobooksuite.com';
const alternateFrontendOrigin = process.env.ALTERNATE_FRONTEND_ORIGIN || 'https://www.gobooksuite.com';
const apiOrigin = process.env.API_ORIGIN || 'https://api.gobooksuite.com';
const expectedApiBase = `${apiOrigin}/api`;

async function checkedFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

const page = await checkedFetch(`${frontendOrigin}/login`, { headers: { 'Cache-Control': 'no-cache' } });
const html = await page.text();
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map((match) => match[1]);
if (!scripts.length) throw new Error('Live frontend contains no JavaScript entry asset');

for (const source of scripts) {
  const assetUrl = new URL(source, frontendOrigin).href;
  const asset = await checkedFetch(assetUrl);
  const body = await asset.text();
  if (!body.includes(expectedApiBase)) throw new Error(`${assetUrl} does not contain the production API URL`);
  if (!body.includes('.apps.googleusercontent.com')) throw new Error(`${assetUrl} does not contain a Google web client ID`);
  if (body.includes('Set VITE_API_URL to the production HTTPS backend before building')) {
    throw new Error(`${assetUrl} contains the missing VITE_API_URL runtime failure`);
  }
}

const ready = await checkedFetch(`${apiOrigin}/health/ready`, { headers: { Origin: frontendOrigin } });
const readiness = await ready.json();
if (readiness.status !== 'ready' || readiness.transactions !== 'ready') throw new Error('Live API is not transaction-ready');

// Readiness alone cannot detect a newer frontend paired with an older API.
const securityResponse = await checkedFetch(`${expectedApiBase}/auth/security-config`, { headers: { Origin: frontendOrigin }, cache: 'no-store' });
const security = await securityResponse.json();
if (securityResponse.headers.get('access-control-allow-origin') !== frontendOrigin || security.enabled !== true || typeof security.siteKey !== 'string' || !security.siteKey.trim()) {
  throw new Error('Live API must expose public human-verification configuration with a site key');
}

const alternate = await fetch(`${alternateFrontendOrigin}/login`, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
if (![301, 302, 307, 308].includes(alternate.status) || new URL(alternate.headers.get('location'), alternateFrontendOrigin).origin !== frontendOrigin) {
  throw new Error(`${alternateFrontendOrigin} must redirect to canonical origin ${frontendOrigin}`);
}

for (const origin of [frontendOrigin, alternateFrontendOrigin]) {
  const preflight = await fetch(`${expectedApiBase}/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-device-id,x-human-verification',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== origin) {
    throw new Error(`Live API CORS preflight failed for ${origin} with HTTP ${preflight.status}`);
  }
  const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((header) => header.trim());
  if (!['content-type', 'x-device-id', 'x-human-verification'].every((header) => allowedHeaders.includes(header))) {
    throw new Error(`Live API must allow authentication headers for ${origin}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  frontend: frontendOrigin,
  alternateFrontend: alternateFrontendOrigin,
  frontendCacheControl: page.headers.get('cache-control') || '',
  scripts,
  api: apiOrigin,
  database: readiness.database,
  transactions: readiness.transactions,
  humanVerification: 'public configuration ready',
  cors: 'ready for canonical and redirect origins',
}, null, 2));
