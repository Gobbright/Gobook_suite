import { getToken } from './authToken.js';
import { SERVER_ORIGIN } from './apiBase.js';

let sdkPromise;
export function loadMetaSdk(appId, version) {
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); sdkPromise = null; reject(new Error('Meta could not load. Please retry.')); }, 15000);
    script.onload = () => { clearTimeout(timer); resolve(window.FB); };
    script.onerror = () => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('Meta could not load. Please retry.')); };
    document.head.appendChild(script);
  });
  return sdkPromise.then((fb) => { fb.init({ appId, version, cookie: false, xfbml: false }); return fb; });
}

export async function prepareMetaConnection(mode) {
  const response = await fetch(`${SERVER_ORIGIN}/auth/meta/start`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify({ mode }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not start WhatsApp connection');
  return data;
}

export function submitMetaCallback(attempt, values) {
  if (new URL(attempt.callbackUrl).origin !== SERVER_ORIGIN) throw new Error('The WhatsApp callback does not match the configured API server.');
  const form = document.createElement('form');
  form.method = 'POST'; form.action = attempt.callbackUrl;
  for (const [name, value] of Object.entries({ state: attempt.state, ...values })) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
