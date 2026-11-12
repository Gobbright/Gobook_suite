import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { adminService } from '../../services/adminService.js';
import { PasswordInput } from './PasswordInput.jsx';
import './EmployeeAccessCard.css';

export function EmployeeAccessCard({ employee, onUpdated }) {
  const [access, setAccess] = useState(null);
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const loginUrl = access?.loginPath ? new URL(access.loginPath, window.location.origin).href : '';
  useEffect(() => {
    let active = true;
    setAccess(null); setError(''); setMessage(''); setPassword('');
    adminService.employeeAccess(employee._id).then((data) => { if (active) { setAccess(data); setEnabled(data.loginEnabled); } }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [employee._id]);
  useEffect(() => {
    let active = true;
    setQr('');
    if (loginUrl) QRCode.toDataURL(loginUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then((data) => { if (active) setQr(data); }).catch(() => { if (active) setError('Unable to generate QR code'); });
    return () => { active = false; };
  }, [loginUrl]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const data = await adminService.setEmployeeAccess(employee._id, { loginEnabled: enabled, ...(password ? { password } : {}) });
      setAccess(data); setEnabled(data.loginEnabled); setPassword(''); setMessage(password ? 'Employee password reset. Previous employee sessions have been signed out.' : 'Employee login settings saved.'); onUpdated?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function resetQr() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await adminService.resetEmployeeQr(employee._id);
      setAccess(data); setMessage('New QR and login URL generated. The previous link and employee sessions are revoked.'); onUpdated?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function copyUrl() {
    try { await navigator.clipboard.writeText(loginUrl); setMessage('Employee login URL copied.'); } catch { setError('Select and copy the login URL below.'); }
  }
  return <section className="hr-card employee-access-card">
    <h2>Employee Login &amp; QR</h2><p>{employee.name} · <strong>{employee.employeeId}</strong></p>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!access ? <p>Loading login settings…</p> : <>
      <label className="hr-field">Employee login URL<input value={loginUrl} readOnly onFocus={(event) => event.target.select()} /></label>
      {['localhost', '127.0.0.1'].includes(window.location.hostname) && <p>Local preview link. Open the app at its shared HTTPS address before copying a link or QR for another device.</p>}
      <div className="hr-actions"><button className="hr-btn" type="button" onClick={copyUrl}>Copy URL</button><a className="hr-btn" href={loginUrl} target="_blank" rel="noreferrer">Open Login</a></div>
      <div className="employee-access-content"><div>{qr && <img className="employee-access-qr" src={qr} alt={`Employee login QR for ${employee.name}`} />}<div className="hr-actions"><a className="hr-btn" href={qr || undefined} download={`${employee.employeeId}-login-qr.png`} aria-disabled={!qr}>Download QR</a><button className="hr-btn" type="button" disabled={busy} onClick={resetQr}>Reset QR</button></div></div>
      <form onSubmit={save} className="employee-access-form"><h3>Login access</h3><label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable employee login</label><label className="hr-field">{access.passwordConfigured ? 'New employee password' : 'Set employee password'}<PasswordInput autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required={enabled && !access.passwordConfigured} placeholder={access.passwordConfigured ? 'Enter a new password to reset' : 'Enter at least 8 characters'} /></label><p>The eye button shows the password you enter. Stored passwords cannot be viewed; enter a new password to reset.</p><div className="hr-actions">{access.passwordConfigured && <button className="hr-btn primary" type="submit" disabled={busy || !password}>{busy ? 'Saving…' : 'Reset Password'}</button>}<button className="hr-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Login Settings'}</button></div></form></div>
    </>}
  </section>;
}
