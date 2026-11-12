import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/authService.js';
import { employeeScreenPath } from '../../services/portalPaths.js';

export default function Login() {
  const { user, loading: authLoading, login } = useAuth();
  const route = useParams();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const ownerUserId = route.ownerUserId || '';
  const employeeId = route.employeeId || '';
  const businessSlug = route.businessSlug || '';
  const code = params.get('code') || '';

  useEffect(() => {
    let active = true;
    setChecking(true); setContext(null); setError(''); setPassword('');
    if (!employeeId || !businessSlug) {
      setError('Open the employee login URL or scan the QR code provided by your business administrator.');
      setChecking(false);
      return undefined;
    }
    authService.linkContext({ ownerUserId, employeeId, businessSlug, code })
      .then((data) => { if (active) setContext(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [ownerUserId, employeeId, businessSlug, code]);

  if (authLoading || checking) return <main className="login-page"><div className="card login-card">Opening employee login…</div></main>;
  if (context && user?.role === 'employee' && String(user.ownerUserId) === context.ownerUserId && user.employeeId === employeeId) return <Navigate to={employeeScreenPath(user)} replace />;

  async function submit(event) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const nextUser = await login({ ownerUserId, employeeId, businessSlug, code, password });
      navigate(employeeScreenPath(nextUser), { replace: true });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return <main className="login-page"><form className="card login-card" onSubmit={submit}>
    <h1>{context?.businessName || 'Employee Portal'}</h1>
    <p>Employee login</p>
    {error && <p className="error" role="alert">{error}</p>}
    {context && <>
      <div className="field"><label htmlFor="employee-login-id">Employee ID</label><input id="employee-login-id" autoComplete="username" value={employeeId} readOnly /></div>
      <div className="field"><label htmlFor="employee-login-password">Password</label><input id="employee-login-password" type="password" autoComplete="current-password" required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter the password set by your administrator" /></div>
      {!context.loginEnabled && <p role="status">Login is disabled. Ask your administrator to set a password and enable your access.</p>}
      <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} disabled={loading || !context.loginEnabled}>{loading ? 'Signing in…' : 'Login'}</button>
    </>}
    <p><Link to="/login">Business user login</Link></p>
  </form></main>;
}
