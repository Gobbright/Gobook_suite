import { useEffect, useRef } from 'react';

export const EMPLOYEE_RECORDS_CHANGED = 'employee:records-changed';

export function useEmployeeRecordRefresh(refresh) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const update = () => latest.current();
    window.addEventListener(EMPLOYEE_RECORDS_CHANGED, update);
    return () => window.removeEventListener(EMPLOYEE_RECORDS_CHANGED, update);
  }, []);
}
