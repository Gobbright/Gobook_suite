import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { employeeScreenPath } from '../../services/portalPaths.js';
import { useEmployeeNotifications } from '../../context/EmployeeNotificationsContext.jsx';
import { NavigationCountBadge } from '../../../../components/layout/NavigationCountBadge.jsx';

const adminGroups = [
  { title: 'Dashboard', items: [['Dashboard', '/employee-management/dashboard']] },
  { title: 'Employees', items: [['Employees', '/employee-management/employees']] },
  { title: 'Work Management', items: [['All Work', '/employee-management/work']] },
  { title: 'Attendance', items: [['Daily Attendance', '/employee-management/attendance'], ['Attendance Register', '/employee-management/attendance/monthly'], ['Corrections', '/employee-management/attendance/corrections'], ['Reports', '/employee-management/attendance/reports']] },
  { title: 'Leave', items: [['Leave Requests', '/employee-management/leave'], ['Leave Types', '/employee-management/leave/types'], ['Leave Balance', '/employee-management/leave/balance'], ['Leave Calendar', '/employee-management/leave/calendar'], ['Leave Reports', '/employee-management/leave/reports']] },
  { title: 'Payroll', items: [['Salary Structure', '/employee-management/payroll'], ['Payroll Processing', '/employee-management/payroll/processing'], ['Payslips', '/employee-management/payroll/payslips'], ['Deductions', '/employee-management/payroll/deductions'], ['Payroll Reports', '/employee-management/payroll/reports']] },
  { title: 'Holidays', items: [['Holidays', '/employee-management/holidays'], ['Add Holiday', '/employee-management/holidays/add']] },
];
const employeeGroups = [
  { title: 'Dashboard', direct: true, items: [['Dashboard', '/employee/dashboard']] },
  { title: 'Notifications', direct: true, items: [['Notifications', '/employee/notifications']] },
  { title: 'My Work', items: [['All Work', '/employee/work'], ['Assigned Work', '/employee/work?status=Assigned'], ['In Progress', '/employee/work?status=In%20Progress'], ['Completed Work', '/employee/work?status=Completed']] },
  { title: 'Attendance', items: [['Check In / Check Out', '/employee/attendance'], ['Monthly Attendance', '/employee/attendance/monthly'], ['Correction Request', '/employee/attendance/correction']] },
  { title: 'Leave & Permissions', items: [['Apply Leave', '/employee/leave/apply'], ['Leave Status', '/employee/leave/status'], ['Leave History', '/employee/leave/history'], ['Permission Requests', '/employee/permissions'], ['Holidays', '/employee/holidays']] },
  { title: 'Payroll', items: [['Payslips', '/employee/payslips']] },
  { title: 'My Account', items: [['My Profile', '/employee/profile'], ['My Documents', '/employee/documents']] },
];

function WorkspaceNavigation({ user, logout, isAdmin, pathname, search, groups, mobileOpen, navigationId, onClose }) {
  const { unread } = useEmployeeNotifications();
  const sidebarRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const path = (to) => {
    if (isAdmin) return to;
    const [screen, query] = to.replace('/employee/', '').split('?');
    return employeeScreenPath(user, screen) + (query ? `?${query}` : '');
  };
  const activeGroup = groups.find((group) => group.items.some(([, to]) => path(to).split('?')[0] === pathname));
  const [openGroup, setOpenGroup] = useState(activeGroup?.title || groups[0].title);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = sidebarRef.current;
    const focusable = () => [...element.querySelectorAll('a[href], button:not(:disabled)')].filter((node) => node.getClientRects().length);
    const focusFrame = requestAnimationFrame(() => focusable()[0]?.focus());
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    const media = window.matchMedia('(min-width: 901px)');
    const desktop = () => { if (media.matches) closeRef.current(); };
    media.addEventListener('change', desktop);
    return () => { cancelAnimationFrame(focusFrame); document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); media.removeEventListener('change', desktop); previousFocus?.focus(); };
  }, [mobileOpen]);

  return (
    <aside ref={sidebarRef} id={navigationId} className={`sidebar employee-workspace-sidebar${mobileOpen ? ' is-mobile-open' : ''}`} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label="Employee workspace navigation">
      <div className="employee-sidebar-header">
        <div><div className="employee-nav-heading">My workspace</div><span className="employee-nav-caption">{activeGroup?.title || 'Employee portal'}</span></div>
        <button className="employee-menu-toggle employee-sidebar-close" type="button" aria-label="Close navigation" onClick={onClose}>Close</button>
      </div>
      <div className="employee-nav-panel">
        <nav className="nav" aria-label="Employee navigation">
          {groups.map((group, index) => {
            if (group.direct) return <div className={`nav-group employee-direct-group${activeGroup === group ? ' is-current' : ''}`} key={group.title}>
              <NavLink end className={`employee-nav-direct${activeGroup === group ? ' active' : ''}`} aria-current={activeGroup === group ? 'page' : 'false'} to={path(group.items[0][1])} onClick={onClose}>
                <span>{group.title}</span>{group.title === 'Notifications' && <NavigationCountBadge count={unread} label="unread notifications" />}
              </NavLink>
            </div>;
            const expanded = openGroup === group.title;
            const submenuId = `${navigationId}-${index}`;
            return (
              <div className={`nav-group${activeGroup === group ? ' is-current' : ''}`} key={group.title}>
                <button className="employee-nav-trigger" type="button" aria-expanded={expanded} aria-controls={submenuId} onClick={() => setOpenGroup(expanded ? null : group.title)}>
                  <span>{group.title}</span><span className="employee-nav-chevron" aria-hidden="true" />
                </button>
                <div className="employee-subnav" id={submenuId} hidden={!expanded}>
                  {group.items.map(([label, to]) => {
                    const destination = path(to);
                    const [destinationPath, query] = destination.split('?');
                    const active = destinationPath === pathname && (!destinationPath.endsWith('/work') || (new URLSearchParams(query).get('status') || '') === (new URLSearchParams(search).get('status') || ''));
                    return <NavLink key={to} end className={() => `nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : 'false'} to={destination} onClick={onClose}>{label}</NavLink>;
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="employee-nav-footer"><button className="nav-link logout-link" type="button" onClick={logout}>Sign out<span aria-hidden="true">↗</span></button></div>
      </div>
    </aside>
  );
}

export function Sidebar({ mobileOpen = false, navigationId, onClose }) {
  const { user, logout, isAdmin } = useAuth();
  const { pathname, search } = useLocation();
  // Reset the accordion to the current section and close the mobile menu on navigation.
  return <WorkspaceNavigation key={pathname} user={user} logout={logout} isAdmin={isAdmin} pathname={pathname} search={search} groups={isAdmin ? adminGroups : employeeGroups} mobileOpen={mobileOpen} navigationId={navigationId} onClose={onClose} />;
}
