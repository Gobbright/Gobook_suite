import { useEffect, useState } from 'react';
import { request } from '../services/api.js';

export function useEmployeePresence(enabled) {
  const [status, setStatus] = useState('Connecting…');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const clientId = crypto.randomUUID();
    let queue = Promise.resolve();
    function publish(visible) {
      if (!navigator.onLine) { if (active) setStatus('Offline'); return; }
      // Preserve event order when a tab is hidden during an in-flight heartbeat.
      queue = queue.catch(() => {}).then(async () => {
        try {
          const result = await request('/employee/presence', { method: 'POST', body: { active: visible, clientId }, keepalive: !visible });
          if (active) setStatus(visible && result.online && document.visibilityState !== 'hidden' ? 'Online' : 'Offline');
        } catch { if (active) setStatus('Offline'); }
      });
    }
    const ping = () => publish(document.visibilityState !== 'hidden');
    const hide = () => publish(false);
    const offline = () => setStatus('Offline');
    ping();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') ping(); }, 20000);
    window.addEventListener('online', ping);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', ping);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', ping);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', ping);
      hide();
    };
  }, [enabled]);
  return status;
}
