import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useStockAlerts(params) {
  const key = JSON.stringify(params);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(visible, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('gobook:stock-changed', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('gobook:stock-changed', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      api.invListAlerts(JSON.parse(key)).then((result) => { if (active) setResponse(result); }).catch((failure) => { if (active) setError(failure.message || 'Unable to load alerts.'); }).finally(() => { if (active) setLoading(false); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [key, reload]);
  return { response, loading, error, refresh: () => setReload((value) => value + 1) };
}
