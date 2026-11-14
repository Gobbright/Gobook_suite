import { useEmployeeNotifications } from '../../context/EmployeeNotificationsContext.jsx';
import { Link } from 'react-router-dom';
import { Bell, Menu } from 'lucide-react';
import { useEmployeePresence } from '../../hooks/useEmployeePresence.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { BusinessLogo } from '../common/BusinessLogo.jsx';
import { employeeScreenPath } from '../../services/portalPaths.js';
export function Topbar({ navigationOpen, navigationId, onToggleNavigation }) {
  const { user, isAdmin } = useAuth();
  const presence = useEmployeePresence(Boolean(user) && !isAdmin);
  const { unread } = useEmployeeNotifications();
  const initials = (user?.name || 'Employee').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return (
    <header className="topbar employee-workspace-topbar">
      <a className="employee-skip-link" href="#employee-main">Skip to content</a>
      <button className="employee-menu-toggle employee-topbar-menu" type="button" aria-label="Open employee navigation" aria-expanded={Boolean(navigationOpen)} aria-controls={navigationId} onClick={onToggleNavigation}><Menu size={20} /></button>
      <Link className="employee-business-brand" to={isAdmin ? '/employee-management/dashboard' : employeeScreenPath(user)} aria-label={`${user?.businessName || 'Business'} home`} title={user?.businessName || 'Business'}>
        <span className="employee-business-mark"><BusinessLogo user={user} /></span>
        <span className="employee-business-name">{user?.businessName || 'Business'}</span>
      </Link>
      <div className="topbar-spacer" />
      {!isAdmin && <Link className="employee-notification-bell" to={employeeScreenPath(user, 'notifications')} aria-label={`Notifications${unread == null ? '' : `, ${unread} unread`}`}><Bell size={19} />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</Link>}
      <Link className="employee-profile-link" to={isAdmin ? '/employee-management/dashboard' : employeeScreenPath(user, 'profile')}>
        <span className="employee-avatar" aria-hidden="true">{initials}</span>
        <span className="employee-profile-copy"><strong>{user?.name || 'Employee'}</strong><span>{user?.employeeId || user?.role || 'Employee'}</span>{!isAdmin && <span role="status" className={`employee-presence ${presence === 'Online' ? 'is-online' : ''}`}><i />{presence}</span>}</span>
      </Link>
    </header>
  );
}
