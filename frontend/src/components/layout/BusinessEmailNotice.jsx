import { Link, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { notify } from '../../services/notifications.js';
import { useBusinessEmail } from '../../app/BusinessEmailContext.jsx';
import { requiresVerifiedBusinessEmail } from '../../services/businessEmail.js';

export function BusinessEmailNotice() {
  const { configured, loading, error } = useBusinessEmail();
  const { pathname } = useLocation();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || configured || loading || pathname === '/email-setup' || requiresVerifiedBusinessEmail(pathname)) return;
    shown.current = true;
    notify({ title: error ? 'Email status unavailable' : 'Verify your Google app password', message: error ? 'Check your email connection to unlock employee setup and email features.' : 'Verify the Google app password for your business Gmail to unlock Add Employee, Email Marketing and business emails.', href: '/email-setup' });
  }, [configured, loading, error, pathname]);
  return null;
}

export function BusinessEmailGate({ children }) {
  const { pathname } = useLocation();
  const { configured, loading, error, refresh } = useBusinessEmail();
  if (!requiresVerifiedBusinessEmail(pathname) || configured) return children;
  if (loading) return <div className="business-email-gate" role="status">Checking app password verification…</div>;
  return <section className="business-email-gate">
    <ShieldCheck size={36} aria-hidden="true" /><h1>Verify your Google app password to continue</h1>
    <p>Connect your business Gmail and verify its Google app password before adding employees or opening Email Marketing.</p>
    {error && <p role="alert">{error}</p>}
    <Link className="business-email-primary" to="/email-setup" state={{ returnTo: pathname }}>Verify app password</Link>
    <button type="button" onClick={refresh}>Check again</button>
  </section>;
}
