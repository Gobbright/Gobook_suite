import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, CheckCheck } from 'lucide-react';
import { useEmployeeNotifications } from '../../context/EmployeeNotificationsContext.jsx';
import { employeeScreenPath } from '../../services/portalPaths.js';
import { NavigationCountBadge } from '../../../../components/layout/NavigationCountBadge.jsx';

export function EmployeeNotificationOverview({ user }) {
  const { unread, items, loading, error } = useEmployeeNotifications();
  const destination = employeeScreenPath(user, 'notifications');
  return <section className="employee-inbox-preview" aria-labelledby="employee-inbox-title">
    <div className="employee-section-heading"><div><span className="employee-eyebrow">Stay up to date</span><h2 id="employee-inbox-title">Notifications <NavigationCountBadge count={unread} label="unread notifications" /></h2></div><span className="employee-inbox-icon" aria-hidden="true"><Bell size={20} /></span></div>
    {loading ? <p role="status">Loading your updates…</p> : error ? <p>Your updates are temporarily unavailable.</p> : unread > 0 ? <ul>{items.slice(0, 3).map(row => <li key={row._id}><Link to={destination}><span className="employee-unread-dot" aria-hidden="true" /><div><strong>{row.title}</strong><span>{new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span></div></Link></li>)}</ul> : <div className="employee-inbox-clear"><CheckCheck size={25} aria-hidden="true" /><strong>You're all caught up</strong><span>New updates from your business will appear here.</span></div>}
    <Link className="employee-text-link" to={destination}>View notifications<ArrowUpRight size={15} /></Link>
  </section>;
}
