import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { adminService } from '../../services/adminService.js';
import { PasswordInput } from './PasswordInput.jsx';
import { notify } from '../../../../services/notifications.js';

export function EmployeePasswordDialog({ employee, onClose, onUpdated }) {
  const dialogRef = useRef(null);
  const [access, setAccess] = useState(null);
  const [enabled, setEnabled] = useState(Boolean(employee.loginAccess));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    let active = true;
    adminService.employeeAccess(employee._id).then((data) => {
      if (active) { setAccess(data); setEnabled(data.loginEnabled); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; dialog.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [employee._id]);
  async function save(event) {
    event.preventDefault();
    setError(''); setMessage('');
    if (password !== confirmation) { setError('Passwords do not match.'); notify('Passwords do not match.', { tone: 'error' }); return; }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) { setError('Enter at least 8 characters and no more than 72 bytes.'); notify('Enter at least 8 characters and no more than 72 bytes.', { tone: 'error' }); return; }
    setBusy(true);
    try {
      const data = await adminService.setEmployeeAccess(employee._id, { password, loginEnabled: enabled });
      setAccess(data); setPassword(''); setConfirmation('');
      setMessage('Password saved. Previous employee sessions have been signed out.');
      onUpdated?.();
    } catch (err) { setError(err.message || 'Unable to save employee password.'); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog ref={dialogRef} className="employee-password-dialog" aria-labelledby="employee-password-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header><h2 id="employee-password-title">{access?.passwordConfigured ? 'Reset password' : 'Set password'}</h2><button className="hr-icon-btn" type="button" aria-label="Close password settings" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <p>{employee.name} · {employee.employeeId}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="employee-password-success" role="status">{message}</p>}
    {!access ? <p role="status">{error ? 'Close this window and try again.' : 'Loading password settings…'}</p> : <form onSubmit={save}>
      <label className="hr-field">Enter password<PasswordInput autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Enter a new password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="hr-field">Confirm password<PasswordInput autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Re-enter password" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></label>
      <label className="employee-password-toggle"><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => setEnabled(event.target.checked)} />Enable employee login</label>
      <button className="hr-btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : access.passwordConfigured ? 'Reset password' : 'Set password'}</button>
      <p>Use at least 8 characters. Share the new password with the employee so they can sign in.</p>
    </form>}
  </dialog>, document.body);
}
