import { useEffect, useState } from 'react';
import { adminService } from '../services/adminService.js';

export function useEmployeeDirectoryPresence() {
  const [presence, setPresence] = useState(null);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await adminService.presence();
        if (active) setPresence(Object.fromEntries((response.data || []).map((row) => [row.employeeObjectId, row])));
      } catch { if (active) setPresence(null); }
      finally { inFlight = false; }
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, []);
  return [presence, setPresence];
}
