import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, FileText, MailCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/authService.js';
import { employeeScreenPath } from '../../services/portalPaths.js';
import { PasswordInput } from '../../components/common/PasswordInput.jsx';
import { EmployeeIdentityCard } from '../../components/common/EmployeeIdentityCard.jsx';
import '../../components/common/EmployeeAccessCard.css';
import '../../employeeLogin.css';
import { tokenIsCurrent } from '../../../../services/tokenExpiry.js';

export default function Login() {
  const { user, loading: authLoading, sessionError, refreshSession, login, verifyLoginOtp } = useAuth();
  const route = useParams();
  const [params] = useSearchParams();
  const [businessName, setBusinessName] = useState('');
  const [employeeId, setEmployeeId] = useState(route.employeeId || '');
  const [password, setPassword] = useState('');
  const [context, setContext] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(route.employeeId && route.businessSlug));
  const [clock, setClock] = useState(() => Date.now());
  const ownerUserId = route.ownerUserId || '';
  const businessSlug = route.businessSlug || '';
  const linkedEmployeeId = route.employeeId || '';
  const code = params.get('code') || '';
  const shared = !businessSlug && !linkedEmployeeId;

  useEffect(() => {
    let active = true;
    setContext(null); setError(''); setMessage(''); setPassword(''); setChallenge(null); setOtp('');
    setEmployeeId(linkedEmployeeId); setBusinessName('');
    if (shared) { setChecking(false); return undefined; }
    setChecking(true);
    authService.linkContext({ ownerUserId, employeeId: linkedEmployeeId, businessSlug, code })
      .then((data) => { if (active) { setContext(data); setBusinessName(data.businessName || ''); } })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [ownerUserId, linkedEmployeeId, businessSlug, code, shared]);
  useEffect(() => {
    if (!challenge) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  if (!busy && !authLoading && !sessionError && tokenIsCurrent(localStorage.getItem('employee_portal_token') || '') && user?.role === 'employee' && (shared || (context && String(user.ownerUserId) === context.ownerUserId && user.employeeId === linkedEmployeeId))) return <Navigate to={employeeScreenPath(user)} replace />;
  const remaining = Math.max(0, Math.ceil(((challenge?.resendAt || 0) - clock) / 1000));
  const expired = challenge && clock >= challenge.expiresAt;
  function receiveChallenge(data) {
    const now = Date.now();
    setClock(now); setOtp(''); setPassword('');
    setChallenge({ ...data, resendAt: now + data.resendAfterSeconds * 1000, expiresAt: now + data.expiresInSeconds * 1000 });
    setMessage(data.message || 'OTP sent to your employee email.');
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (challenge) {
        const nextUser = await verifyLoginOtp({ challengeId: challenge.challengeId, otp });
        // The dashboard has a separate auth provider. Open it only after the
        // verified session is committed, with a fresh provider and API cache.
        window.location.replace(employeeScreenPath(nextUser));
      } else {
        const data = await login({ businessName: businessName.trim(), identifier: employeeId.trim(), password, ...(!shared ? { ownerUserId, businessSlug, employeeId: linkedEmployeeId, code } : {}) });
        if (data.otpRequired === false) window.location.replace(employeeScreenPath(data.user));
        else receiveChallenge(data);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(''); setMessage('');
    try { receiveChallenge(await authService.resendOtp({ challengeId: challenge.challengeId })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function startAgain() { setChallenge(null); setOtp(''); setError(''); setMessage(''); }

  return <main className={`employee-login-page${challenge ? ' is-verifying' : ''}`}>
    <div className="employee-login-shell">
      <div className="employee-login-layout">
      <aside className="employee-login-information" aria-label="Employee portal information">
        <Link className="employee-login-brand" to="/login"><img src="/gobook-logo-full.png" alt="GoBook Suite" /></Link>
        <p className="employee-login-eyebrow">Your employee workspace</p>
        <h2>{context?.businessName || 'Your workday, all in one place.'}</h2>
        <p className="employee-login-information-intro">Stay connected to your team. Keep track of attendance, request leave and find your employee documents from any device.</p>
        {context?.qrProfile && Object.keys(context.qrProfile).length > 0 && <EmployeeIdentityCard profile={context.qrProfile} compact />}
        <ul className="employee-login-benefits">
          <li><CalendarDays size={20} /><div><strong>Attendance &amp; leave</strong><span>View your work records and manage leave requests.</span></div></li>
          <li><FileText size={20} /><div><strong>Payslips &amp; documents</strong><span>Your employee records, ready when you need them.</span></div></li>
          <li><ShieldCheck size={20} /><div><strong>Secure employee access</strong><span>Sign in with your password and verify your email.</span></div></li>
        </ul>
        <p className="employee-login-help">Need a password reset? Contact your business administrator.</p>
      </aside>
      <section className="employee-login-card">
        <div className="employee-login-symbol" aria-hidden="true">{challenge ? <MailCheck size={25} /> : <ShieldCheck size={25} />}</div>
        <p className="employee-login-eyebrow">One portal. Every team.</p>
        <h1>{challenge ? 'Check your employee email' : 'Employee login'}</h1>
        <p className="employee-login-intro">{challenge ? `Enter the 6-digit code sent to ${challenge.maskedEmail}.` : 'Sign in to your business workspace with your employee credentials.'}</p>
        <ol className="employee-login-steps" aria-label="Sign-in progress"><li className={!challenge ? 'is-current' : 'is-complete'} aria-current={!challenge ? 'step' : undefined}><span>1</span>Credentials</li><li className={challenge ? 'is-current' : ''} aria-current={challenge ? 'step' : undefined}><span>2</span>Email verification</li></ol>
        {error && <div className="employee-login-alert is-error" role="alert">{error}</div>}
        {sessionError && <div className="employee-login-alert is-error" role="alert"><p>{sessionError}</p><button className="btn" type="button" onClick={refreshSession}>Try again</button></div>}
        {message && <div className="employee-login-alert" role="status">{message}</div>}
        {authLoading || checking ? <p role="status">Opening employee login…</p> : <form onSubmit={submit}>
          {!challenge ? <>
            <label className="employee-login-field" htmlFor="employee-login-business">Business name<input id="employee-login-business" required maxLength={200} placeholder="Enter your business name" value={businessName} readOnly={!shared} onChange={(event) => setBusinessName(event.target.value)} /></label>
            <label className="employee-login-field" htmlFor="employee-login-id">Employee ID or email<input id="employee-login-id" autoComplete="username" required maxLength={254} placeholder="EMP-001 or name@business.com" value={employeeId} readOnly={!shared} onChange={(event) => setEmployeeId(event.target.value)} /></label>
            <label className="employee-login-field" htmlFor="employee-login-password">Password<PasswordInput id="employee-login-password" autoFocus={!shared && Boolean(context?.businessUsername)} autoComplete="current-password" required minLength={8} maxLength={72} placeholder="Your employee password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {context && !context.loginEnabled && <p className="employee-login-alert is-error">Ask your administrator to enable your login and set a password.</p>}
            <button className="employee-login-submit" disabled={busy || (!shared && (!context || !context.loginEnabled))}>{busy ? 'Checking details…' : 'Continue to email verification'}<ArrowRight size={17} /></button>
          </> : <>
            <label className="employee-login-field" htmlFor="employee-login-otp">Email OTP<input id="employee-login-otp" className="employee-login-otp" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
            <p className="employee-login-note">The code expires in 10 minutes. Your dashboard opens after verification.</p>
            {expired && <p className="employee-login-alert is-error" role="status">This code has expired. Start again to request a fresh OTP.</p>}
            <button className="employee-login-submit" disabled={busy || otp.length !== 6 || expired}>{busy ? 'Verifying…' : 'Verify & sign in'}<ArrowRight size={17} /></button>
            <button className="employee-login-resend" type="button" disabled={busy || remaining > 0 || expired} onClick={resend}>{remaining > 0 ? `Resend OTP in ${remaining}s` : 'Resend OTP'}</button>
            <button className="employee-login-back" type="button" disabled={busy} onClick={startAgain}><ArrowLeft size={14} />Use different details</button>
          </>}
        </form>}
        {!shared && <p className="employee-login-footer"><Link to="/employee-login">Use the shared employee login page</Link></p>}
        <div className="employee-login-secure"><ShieldCheck size={14} />Password + email OTP verification</div>
      </section>
      </div>
      <p className="employee-login-footer">Manage a business? <Link to="/login">Business user login</Link></p>
    </div>
  </main>;
}
