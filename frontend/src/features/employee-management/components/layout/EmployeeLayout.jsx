import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useId, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { EmployeeNotificationsProvider } from '../../context/EmployeeNotificationsContext.jsx';
import '../../employeeWorkspace.css';

export function EmployeeLayout({ children }) {
  const { user } = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationId = useId();
  return <EmployeeNotificationsProvider key={`${user?.ownerUserId}:${user?.employeeId}`}><div className="app-shell employee-workspace"><Topbar navigationOpen={navigationOpen} navigationId={navigationId} onToggleNavigation={() => setNavigationOpen((open) => !open)} /><div className="employee-workspace-body">{navigationOpen && <button className="employee-navigation-backdrop" type="button" aria-label="Close employee navigation" onClick={() => setNavigationOpen(false)} />}<Sidebar mobileOpen={navigationOpen} navigationId={navigationId} onClose={() => setNavigationOpen(false)} /><main className="main" id="employee-main" tabIndex={-1}><section className="content">{children}</section></main></div></div></EmployeeNotificationsProvider>;
}
