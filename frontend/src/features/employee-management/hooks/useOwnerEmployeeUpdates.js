import { useEffect } from 'react';
import { adminService } from '../services/adminService.js';
import { clearEmployeeCache } from '../services/api.js';
import { notify } from '../../../services/notifications.js';
import { EMPLOYEE_RECORDS_CHANGED } from './useEmployeeRecordRefresh.js';

export function useOwnerEmployeeUpdates(user) {
  const ownerId = user?.id || user?._id;
  const enabled = user?.accountType === 'owner' || user?.role === 'Super Admin';
  useEffect(() => {
    if (!enabled || !ownerId) return;
    let active = true;
    let busy = false;
    let initial = true;
    const key = `gobook:employee-updates:${ownerId}`;
    let seen = new Set();
    const version = row => JSON.stringify([row.id, row.at, row.status, row.message]);
    try { seen = new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { /* Storage is optional. */ }
    async function refresh() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const result = await adminService.updates();
        if (!active) return;
        const changed = (result.data || []).filter(row => !seen.has(version(row)));
        for (const row of [...changed].reverse()) {
          if (!initial || seen.size || row.status === 'Pending') notify({ title: `${row.employeeName}: ${row.title}`, message: `${row.status}. ${row.message}`, href: row.href });
        }
        for (const row of result.data || []) seen.add(version(row));
        seen = new Set([...seen].slice(-1000));
        try { sessionStorage.setItem(key, JSON.stringify([...seen])); } catch { /* Updates still display in the database view. */ }
        if (!initial && changed.length) {
          clearEmployeeCache();
          window.dispatchEvent(new Event(EMPLOYEE_RECORDS_CHANGED));
        }
        initial = false;
      } catch { /* An unavailable update feed must not interrupt the current form. */ }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [ownerId, enabled]);
}
