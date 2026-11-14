import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, MailCheck, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader.jsx';
import { PasswordInput } from '../../../components/common/PasswordInput.jsx';
import { adminService } from '../../../services/adminService.js';
import { useLoad } from '../../../hooks/useLoad.js';
import { employeeLoginPageUrl } from '../../../services/employeeQr.js';
import { businessEmailVerificationInput } from '../../../../../services/businessEmail.js';
import '../../../employeeLogin.css';

export default function Settings() {
  const loginUrl = employeeLoginPageUrl();
  const { data, loading, error, setData, reload } = useLoad(adminService.emailSettings, []);
  const [email, setEmail] = useState(null);
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setMessage('');
    try {
      const saved = await adminService.verifyEmailSettings(businessEmailVerificationInput(email ?? data?.email ?? '', appPassword));
      setData((current) => ({ ...current, ...saved })); setAppPassword(''); setMessage('Google app password verified. Employee login OTPs will be sent from this mailbox.');
    } catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(loginUrl); setMessage('Shared employee login URL copied.'); } catch { setActionError('Select and copy the shared login URL.'); }
  }
  return <div className="employee-email-settings">
    <PageHeader title="Employee login settings" subtitle="Verify your Google app password to enable employee login OTP delivery." action={<Link className="hr-btn" to="/employee-management/employees">Manage employees</Link>} />
    {error && <div role="alert" className="error">{error}<button className="hr-btn" type="button" onClick={reload}>Try again</button></div>}
    {actionError && <div role="alert" className="error">{actionError}</div>}
    {message && <div role="status" className="employee-email-message">{message}</div>}
    <section className="employee-email-panel"><h2>Personal employee links &amp; QR cards</h2><p>Each employee has a personal URL that fills in the business username and employee ID. Open the employee login directory to copy links, choose visible details and download QR cards.</p><Link className="hr-btn" to="/employee-management/login-links">View employee login links</Link><p>The shared page is also available for entering details manually.</p><div className="employee-email-copy"><input aria-label="Shared employee login URL" value={loginUrl} readOnly onFocus={(event) => event.target.select()} /><button className="hr-btn" type="button" onClick={copy}><Copy size={15} />Copy manual URL</button></div>{data?.loginUsername && <p>Business username: <strong>{data.loginUsername}</strong></p>}</section>
    <section className="employee-email-panel"><h2>Business email for employee OTPs</h2>
      <p>Enter your business Gmail address and Google app password. The app password is checked by connecting to Gmail before the connection becomes active.</p>
      {loading ? <p role="status">Loading email connection…</p> : error ? <p>Email settings could not be loaded.</p> : <>
        <div className={`employee-email-status ${data?.configured ? 'is-ready' : ''}`}>{data?.configured ? <CheckCircle2 size={16} /> : <MailCheck size={16} />}{data?.configured ? `App password verified · ${data.email}` : 'App password verification required'}</div>
        <form onSubmit={submit} className="employee-email-form"><label className="hr-field">Business Gmail address<input type="email" autoComplete="email" required maxLength={254} placeholder="yourbusiness@gmail.com" value={email ?? data?.email ?? ''} onChange={(event) => setEmail(event.target.value)} /></label><label className="hr-field" htmlFor="employee-sender-app-password">Google app password<PasswordInput id="employee-sender-app-password" autoComplete="new-password" required minLength={12} maxLength={128} placeholder="Enter the 16-character app password" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} /></label><div className="hr-actions"><button className="hr-btn primary" disabled={busy}><ShieldCheck size={16} />{busy ? 'Verifying connection…' : 'Verify app password'}</button></div></form>
        <p>Use a Google app password for this mailbox. Your normal Gmail password is not needed. The saved app password is never shown to employees.</p>
      </>}
    </section>
    <section className="employee-email-panel"><h2>Employee sign-in flow</h2><ol className="employee-email-instructions"><li>Verify the Google app password above.</li><li>Add each employee's email, set their password and enable login.</li><li>Employee opens their personal URL or scans their QR. Username and employee ID are filled in; they enter their password.</li><li>A 6-digit OTP is sent to that employee's saved email.</li><li>Successful login OTP verification opens their own dashboard.</li></ol></section>
  </div>;
}
