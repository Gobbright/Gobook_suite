export const TOAST_DURATION_MS = 30_000;
export const NOTIFICATION_EVENT = 'gobook:notification';

export function notify(message, options = {}) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  const detail = typeof message === 'object' ? message : { message: String(message ?? ''), ...options };
  if (!detail?.message) return;
  const href = typeof detail.href === 'string' && /^\/(?!\/)/.test(detail.href) ? detail.href : undefined;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { ...detail, href, tone: ['success', 'error'].includes(detail.tone) ? detail.tone : 'info' } }));
}

// Background pings and authentication keep their existing quiet/form feedback.
export function mutationNotification(path, method, data, error) {
  if (method === 'GET' || /\/(auth|presence)(\/|$)|\/(?:employee-)?notifications\/(?:[^/]+\/read|read-all)(?:\?|$)/.test(path)) return;
  notify(error?.message || data?.message || (method === 'DELETE' ? 'Deleted successfully.' : 'Changes saved successfully.'), { tone: error ? 'error' : 'success' });
}
