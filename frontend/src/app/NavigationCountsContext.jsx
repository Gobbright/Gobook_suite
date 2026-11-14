import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import { apiClient } from '../services/apiClient.js';
import { NOTIFICATION_EVENT } from '../services/notifications.js';

const empty = { employeeTotal: 0 };
const NavigationCountsContext = createContext(empty);

export function NavigationCountsProvider({ children }) {
  const user = useCurrentUser();
  const enabled = Boolean(user?.isSuperAdmin || user?.accountType === 'owner' || user?.role === 'Super Admin');
  const userId = user?.id || user?._id || '';
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!enabled || !userId) return;
    let disposed = false;
    let sequence = 0;
    let debounce;
    async function refresh() {
      if (document.hidden) return;
      const request = ++sequence;
      try {
        const data = await apiClient('/admin/employee-navigation-counts');
        if (!disposed && request === sequence) setCounts(data);
      } catch { /* Retain the last confirmed counts until the next refresh. */ }
    }
    const schedule = () => { window.clearTimeout(debounce); debounce = window.setTimeout(refresh, 200); };
    const changed = (event) => { if (event.detail?.tone === 'success') schedule(); };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener(NOTIFICATION_EVENT, changed);
    window.addEventListener('employee:work-changed', schedule);
    window.addEventListener('employee:notifications-changed', schedule);
    return () => {
      disposed = true;
      window.clearTimeout(debounce);
      window.clearInterval(interval);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener(NOTIFICATION_EVENT, changed);
      window.removeEventListener('employee:work-changed', schedule);
      window.removeEventListener('employee:notifications-changed', schedule);
    };
  }, [enabled, userId, pathname]);
  const value = useMemo(() => {
    if (!enabled) return empty;
    return { employeeTotal: Number.isSafeInteger(counts.unread) && counts.unread > 0 ? counts.unread : 0 };
  }, [counts, enabled]);
  return <NavigationCountsContext.Provider value={value}>{children}</NavigationCountsContext.Provider>;
}

export function useNavigationCounts() { return useContext(NavigationCountsContext); }
