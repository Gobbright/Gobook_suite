import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { currentEmployeeMonth } from '../services/monthScope.js';

export function useRequestedEmployeeMonth() {
  const { search } = useLocation();
  const value = new URLSearchParams(search).get('month') || '';
  const requested = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) ? value : '';
  const [month, setMonth] = useState(() => requested || currentEmployeeMonth());
  useEffect(() => { if (requested) setMonth(requested); }, [requested]);
  return [month, setMonth];
}
