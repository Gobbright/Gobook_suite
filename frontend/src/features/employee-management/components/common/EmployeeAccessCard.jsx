import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { adminService } from '../../services/adminService.js';
import { PasswordInput } from './PasswordInput.jsx';
import { EmployeeIdentityCard, employeePhotoUrl } from './EmployeeIdentityCard.jsx';
import { DEFAULT_QR_FIELDS, QR_DISPLAY_FIELDS, employeeLoginUrl, selectedQrProfile } from '../../services/employeeQr.js';
import { downloadEmployeeQrCard } from '../../services/downloadEmployeeQrCard.js';
import './EmployeeAccessCard.css';

export function EmployeeAccessCard({ employee, onUpdated }) {
  const [access, setAccess] = useState(null);
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState(DEFAULT_QR_FIELDS);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const loginUrl = employeeLoginUrl(access);
  const dirty = access && QR_DISPLAY_FIELDS.some(([key]) => fields[key] !== access.qrDisplayFields?.[key]);
  const profile = selectedQrProfile(access?.identity || access?.qrProfile, fields);
  function receive(data) { setAccess(data); setEnabled(data.loginEnabled); setFields(data.qrDisplayFields || DEFAULT_QR_FIELDS); }
  useEffect(() => {
    let active = true;
    setAccess(null); setError(''); setMessage(''); setPassword('');
    adminService.employeeAccess(employee._id).then((data) => { if (active) receive(data); }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [employee._id]);
  useEffect(() => {
    let active = true;
    setQr('');
    if (loginUrl) QRCode.toDataURL(loginUrl, { width: 360, margin: 3, errorCorrectionLevel: 'M' }).then((data) => { if (active) setQr(data); }).catch(() => { if (active) setError('Unable to generate QR code'); });
    return () => { active = false; };
  }, [loginUrl]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const data = await adminService.setEmployeeAccess(employee._id, { loginEnabled: enabled, ...(password ? { password } : {}) });
      receive(data); setPassword(''); setMessage(password ? 'Employee password reset. Previous employee sessions have been signed out.' : 'Employee login settings saved.'); onUpdated?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function saveDisplay() {
    setBusy(true); setError(''); setMessage('');
    try { receive(await adminService.setEmployeeQrDisplay(employee._id, fields)); setMessage('QR display details saved. The scan page uses these same selections.'); onUpdated?.(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function resetQr() {
    setBusy(true); setError(''); setMessage('');
    try { receive(await adminService.resetEmployeeQr(employee._id)); setMessage('New personal QR generated. Previous links, OTPs and employee sessions are revoked.'); onUpdated?.(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function copyUrl() {
    try { await navigator.clipboard.writeText(loginUrl); setMessage('Personal employee login URL copied.'); } catch { setError('Select and copy the login URL below.'); }
  }
  async function downloadCard() {
    setBusy(true); setError('');
    try { await downloadEmployeeQrCard({ qr, profile, photoUrl: employeePhotoUrl(profile.photoUrl), businessName: access.businessName, employeeId: employee.employeeId }); }
    catch (err) { setError(err.message || 'Unable to download the QR card.'); } finally { setBusy(false); }
  }
  return <section className="hr-card employee-access-card">
    <h2>Employee Login &amp; QR</h2><p>{employee.name} · <strong>{employee.employeeId}</strong></p>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status" className="employee-access-message">{message}</p>}
    {!access ? <p role="status">Loading login settings…</p> : <>
      <label className="hr-field">Personal employee login URL<input aria-label="Personal employee login URL" value={loginUrl} readOnly onFocus={(event) => event.target.select()} /></label>
      <div className="employee-access-credentials"><span>Business username<strong>{access.businessUsername || 'Business owner login email'}</strong></span><span>Employee ID<strong>{employee.employeeId}</strong></span><span>Employee login OTP<strong>{access.emailVerified ? 'Verified' : 'Pending employee OTP'}</strong></span></div>
      <p>Opening this URL or QR fills in the username and employee ID. The employee enters their password, then verifies the OTP sent to their saved email.</p>
      <p>{access.emailOtpReady ? 'Google app password is verified for OTP delivery.' : 'Verify the Google app password before employees sign in.'} <Link to="/employee-management/settings">Email / OTP settings</Link></p>
      <div className="hr-actions"><button className="hr-btn" type="button" onClick={copyUrl}>Copy URL</button><a className="hr-btn" href={loginUrl} target="_blank" rel="noreferrer">Open Login</a></div>
      <div className="employee-access-content">
        <div className="employee-access-preview"><EmployeeIdentityCard key={`saved-photo-${access.qrDisplayFields?.photo}`} profile={profile} businessName={access.businessName} qr={qr} /><div className="hr-actions"><button className="hr-btn primary" type="button" disabled={busy || !qr || dirty} onClick={downloadCard}>Download QR card</button><a className="hr-btn" href={qr || undefined} download={`${employee.employeeId}-login-qr.png`} aria-disabled={!qr}>QR only</a></div>{dirty && <p className="employee-qr-save-note">Save the selected details before downloading the card.</p>}</div>
        <div className="employee-access-controls">
          <section className="employee-qr-display-settings"><h3>Details visible on the QR card</h3><p>Selected details appear on the card and before sign-in for anyone holding this employee QR.</p><fieldset disabled={busy}><legend className="sr-only">Choose visible employee details</legend>{QR_DISPLAY_FIELDS.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(fields[key])} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</fieldset><button className="hr-btn" type="button" disabled={busy || !dirty} onClick={saveDisplay}>{busy ? 'Saving…' : 'Save QR details'}</button></section>
          <form onSubmit={save} className="employee-access-form"><h3>Login access</h3><label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable employee login</label><label className="hr-field">{access.passwordConfigured ? 'New employee password' : 'Set employee password'}<PasswordInput autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required={enabled && !access.passwordConfigured} placeholder={access.passwordConfigured ? 'Enter a new password to reset' : 'Enter at least 8 characters'} /></label><p>Saved passwords are never printed on the QR card or included in its URL.</p><div className="hr-actions"><button className="hr-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save login settings'}</button><button className="hr-btn" type="button" disabled={busy} onClick={resetQr}>Reset QR &amp; sessions</button></div></form>
        </div>
      </div>
    </>}
  </section>;
}
