import { useCallback, useEffect, useState } from 'react';
import { clearEmployeeCache } from '../services/api.js';
import { useEmployeeRecordRefresh } from './useEmployeeRecordRefresh.js';

export function useLoad(loader, deps = [], { keepPreviousData = false } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => { clearEmployeeCache(); setVersion((value) => value + 1); }, []);
  useEmployeeRecordRefresh(reload);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (!keepPreviousData) setData(null);
    setError('');
    Promise.resolve().then(loader).then((res) => { if (alive) setData(res); }).catch((err) => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, version, keepPreviousData]);
  return { data, loading, error, setData, reload };
}
