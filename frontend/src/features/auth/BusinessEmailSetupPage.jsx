import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, LoaderCircle, MailCheck, Pencil } from 'lucide-react';
import { useBusinessEmail } from '../../app/BusinessEmailContext.jsx';
import { PasswordInput } from '../employee-management/components/common/PasswordInput.jsx';

export function BusinessEmailSetupPage() {
  const connection = useBusinessEmail();
  const { state } = useLocation();
  const [email, setEmail] = useState(null);
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const showForm = !connection.configured || editing;
  const changing = connection.configured && editing;
  const canEdit = connection.canManage !== false;
  const returnTo = typeof state?.returnTo === 'string' && /^\/(?![/\\])/.test(state.returnTo) && !state.returnTo.startsWith('/email-setup') ? state.returnTo : '/dashboard';

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await connection.verify(email ?? connection.email ?? '', appPassword);
      setEmail(saved.email); setAppPassword(''); setEditing(false);
      setMessage(`Google app password verified for ${saved.email}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function changeConnection() {
    setEmail(connection.email || ''); setAppPassword(''); setError(''); setMessage(''); setEditing(true);
  }

  function cancelChange() {
    setEmail(null); setAppPassword(''); setError(''); setMessage(''); setEditing(false);
  }

  return <section className="business-email-setup">
    <MailCheck size={32} aria-hidden="true" /><h1>Connect your business email</h1>
    <p>Verify the Google app password by connecting your business Gmail. This unlocks Add Employee, Email Marketing, invoice emails and appointment reminders.</p>
    {connection.loading && <p role="status">Loading email connection…</p>}
    {connection.error && <div role="alert"><p>{connection.error}</p><button type="button" onClick={connection.refresh}>Try again</button></div>}
    <>
      <div className={`business-email-status ${connection.configured ? 'is-ready' : ''}`} role="status">{connection.configured && <CheckCircle2 size={18} />}{connection.configured ? `App password verified: ${connection.email}` : 'App password verification required'}</div>
      {connection.configured && !editing && <div className="business-email-saved">
        <dl><div><dt>Business email</dt><dd>{connection.email}</dd></div><div><dt>App password</dt><dd>Saved</dd></div>{connection.verifiedAt && <div><dt>Last verified</dt><dd>{new Date(connection.verifiedAt).toLocaleString('en-IN')}</dd></div>}</dl>
        {canEdit && <button className="business-email-change" type="button" onClick={changeConnection}><Pencil size={16} aria-hidden="true" />Change email or app password</button>}
      </div>}
      {canEdit && showForm ? <form onSubmit={submit} aria-busy={busy}>
        <label htmlFor="business-sender-email">Business Gmail address</label>
        <input id="business-sender-email" name="email" type="email" autoComplete="email" placeholder="yourbusiness@gmail.com" maxLength={254} required value={email ?? connection.email ?? ''} onChange={(event) => { setEmail(event.target.value); setMessage(''); setEditing(true); }} disabled={busy} />
        <label htmlFor="business-sender-password">{changing ? 'New Google app password' : 'Google app password'}</label>
        <PasswordInput id="business-sender-password" name="appPassword" autoFocus={editing} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="business-password-help" maxLength={128} required value={appPassword} onChange={(event) => { setAppPassword(event.target.value); setMessage(''); setEditing(true); }} placeholder="Enter your 16-character app password" disabled={busy} />
        <p id="business-password-help">Enter the 16-character app password for this email. You can paste it with spaces. Enable 2-Step Verification in your Google account to create an app password.</p>
        <div className="business-email-form-actions"><button className="business-email-primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="business-email-spinner" size={17} aria-hidden="true" />}{busy ? 'Verifying & saving…' : changing ? 'Verify & save changes' : 'Submit & verify'}</button>{changing && <button className="business-email-cancel" type="button" onClick={cancelChange} disabled={busy}>Cancel</button>}</div>
        {busy && <p role="status" className="business-email-progress">Checking your email and app password with Gmail…</p>}
      </form> : connection.canManage === false && <p>Ask your business administrator to verify the Google app password.</p>}
      {connection.configured && !editing && <Link className="business-email-primary" to={returnTo}>Continue</Link>}
    </>
    {message && <p role="status" className="business-email-success">{message}</p>}
    {error && <p role="alert" className="business-email-error">{error}</p>}
    <Link className="business-email-back" to="/dashboard">Back to dashboard</Link>
  </section>;
}
