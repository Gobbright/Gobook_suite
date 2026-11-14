import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { notificationService } from '../services/notificationService.js';
import { clearEmployeeCache } from '../services/api.js';
import { EMPLOYEE_RECORDS_CHANGED } from '../hooks/useEmployeeRecordRefresh.js';
import { notify } from '../../../services/notifications.js';
import { employeeScreenPath } from '../services/portalPaths.js';

const initial = { unread: null, items: [], loading: true, error: '' };
const EmployeeNotificationsContext = createContext(initial);

export function EmployeeNotificationsProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [state, setState] = useState(initial);
  useEffect(() => {
    if (!user || isAdmin) return;
    let active = true;
    let refreshing = false;
    let queued = false;
    let version = 0;
    let snapshot = null;
    const seen = new Set();
    const storageKey = `gobook:notification-popups:${user.ownerUserId}:${user.employeeId}`;
    try { for (const id of JSON.parse(sessionStorage.getItem(storageKey) || '[]')) seen.add(id); } catch { /* Popups also work without storage. */ }
    async function refresh() {
      if (!active || document.hidden) return;
      if (refreshing) { queued = true; return; }
      const request = version;
      refreshing = true;
      try {
        const data = await notificationService.list(false, { month: 'all', read: 'unread' });
        if (!active || request !== version) return;
        setState({ unread: data.unread, items: data.data || [], loading: false, error: '' });
        const nextSnapshot = JSON.stringify((data.data || []).map(row => [row._id, row.readAt]));
        if (snapshot !== null && snapshot !== nextSnapshot) {
          clearEmployeeCache();
          window.dispatchEvent(new Event(EMPLOYEE_RECORDS_CHANGED));
        }
        snapshot = nextSnapshot;
        for (const row of [...(data.data || [])].reverse()) {
          if (seen.has(row._id)) continue;
          seen.add(row._id);
          notify({ title: row.title, message: row.message, href: employeeScreenPath(user, 'notifications') });
        }
        try { sessionStorage.setItem(storageKey, JSON.stringify([...seen].slice(-500))); } catch { /* Ignore storage restrictions. */ }
      } catch (error) {
        if (active && request === version) setState(current => ({ ...current, loading: false, error: error.message }));
      } finally {
        refreshing = false;
        if (active && queued) { queued = false; clearEmployeeCache(); refresh(); }
      }
    }
    const changed = () => { version++; clearEmployeeCache(); refresh(); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('employee:notifications-changed', changed);
    window.addEventListener('focus', changed);
    document.addEventListener('visibilitychange', changed);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('employee:notifications-changed', changed);
      window.removeEventListener('focus', changed);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [user, isAdmin]);
  return <EmployeeNotificationsContext.Provider value={state}>{children}</EmployeeNotificationsContext.Provider>;
}

export function useEmployeeNotifications() { return useContext(EmployeeNotificationsContext); }
