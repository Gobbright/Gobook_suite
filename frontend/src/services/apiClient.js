import { redirectTo } from '../routes/navigation.js';
import { expireSession, getToken } from './authToken.js';
import { API_BASE_URL } from './apiBase.js';
import { humanVerificationHeaders } from './humanVerification.js';
import { notifyBusinessEmailChanged } from './businessEmail.js';

const DEVICE_ID_KEY = 'gobook.device.id';

function getDeviceId() {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return '';
  }
}

export async function apiClient(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;
  const { headers: customHeaders = {}, ...fetchOptions } = options;
  const deviceId = getDeviceId();
  const verificationHeaders = await humanVerificationHeaders(path, options.method || 'GET');

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        ...customHeaders,
        ...verificationHeaders,
      },
    });
  } catch {
    throw new Error('The service is temporarily unavailable. Please wait a moment and try again.');
  }

  if (response.status === 401 && (!path.startsWith('/auth/') || path === '/auth/me')) {
    expireSession();
    redirectTo('/login');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `API request failed: ${response.status}`);
  }

  if (options.method && options.method !== 'GET' && ['/settings', '/more-modules/email-settings'].includes(path.split('?')[0])) notifyBusinessEmailChanged();
  return data;
}
