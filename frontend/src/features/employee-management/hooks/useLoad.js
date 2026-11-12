import { useCallback, useEffect, useState } from 'react';
import { clearEmployeeCache } from '../services/api.js';

export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => { clearEmployeeCache(); setVersion((value) => value + 1); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setError('');
    Promise.resolve().then(loader).then((res) => { if (alive) setData(res); }).catch((err) => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, version]);
  return { data, loading, error, setData, reload };
}
