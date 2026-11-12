import { API_BASE_URL, SERVER_ORIGIN } from './apiBase.js';

export function openEmployeeAsset(assetUrl, token) {
  const url = new URL(assetUrl, SERVER_ORIGIN);
  if (url.origin !== SERVER_ORIGIN || !/^\/api\/files\/employee-assets\/[a-f\d]{24}$/i.test(url.pathname)) return Promise.reject(new Error('Invalid employee file URL'));
  return openPrivateFile(url.pathname.replace(/^\/api/, ''), token);
}

export async function openPrivateFile(path, token, { download = false, filename = 'document' } = {}) {
  const preview = download ? null : window.open('about:blank', '_blank');
  if (preview) preview.opener = null;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Unable to open this document');
    }
    const url = URL.createObjectURL(await response.blob());
    if (download || !preview) {
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || filename;
      link.click();
    } else preview.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { preview?.close(); throw error; }
}
