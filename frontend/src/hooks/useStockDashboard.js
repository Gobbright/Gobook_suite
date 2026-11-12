import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useStockDashboard(params) {
  const key = JSON.stringify(params);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const filters = JSON.parse(key);
        if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new Error('From Date must not follow To Date.');
        const result = await api.invStockDashboard(filters);
        if (active) setResponse(result);
      } catch (failure) {
        if (active) setError(failure.message || 'Unable to load stock summary.');
      } finally {
        if (active) setLoading(false);
      }
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [key, reload]);
  return { response, loading, error, retry: () => setReload((previous) => previous + 1) };
}
