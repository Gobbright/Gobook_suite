import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { clearEmployeeCache } from '../services/api.js';
import { employeePortalBase } from '../services/portalPaths.js';
import { tokenIsCurrent } from '../../../services/tokenExpiry.js';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('employee_portal_user') || 'null');
  } catch {
    localStorage.removeItem('employee_portal_user');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('employee_portal_token')));
  const [sessionError, setSessionError] = useState('');
  const sessionRequest = useRef(0);

  const refreshSession = useCallback(async () => {
    const request = ++sessionRequest.current;
    const token = localStorage.getItem('employee_portal_token');
    setSessionError('');
    if (!token || !tokenIsCurrent(token)) {
      localStorage.removeItem('employee_portal_token');
      localStorage.removeItem('employee_portal_user');
      clearEmployeeCache();
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await authService.me();
      if (request !== sessionRequest.current || localStorage.getItem('employee_portal_token') !== token) return;
      const nextUser = data?.user;
      if (!nextUser || (nextUser.role === 'employee' && !employeePortalBase(nextUser))) throw new Error('Unable to open your employee dashboard. Please try again.');
      setUser(nextUser);
      localStorage.setItem('employee_portal_user', JSON.stringify(nextUser));
      if (nextUser.loginPath) localStorage.setItem('employee_portal_login_path', nextUser.loginPath);
    } catch (error) {
      if (request !== sessionRequest.current) return;
      if (!localStorage.getItem('employee_portal_token')) setUser(null);
      else if (localStorage.getItem('employee_portal_token') === token) setSessionError(error.message || 'Unable to load your employee session.');
    } finally {
      if (request === sessionRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refreshSession();
    return () => { sessionRequest.current++; };
  }, [refreshSession]);
  useEffect(() => {
    const expire = () => { sessionRequest.current++; setUser(null); setLoading(false); setSessionError(''); };
    window.addEventListener('employee:session-expired', expire);
    return () => window.removeEventListener('employee:session-expired', expire);
  }, []);

  const login = useCallback(async (payload) => {
    const request = ++sessionRequest.current;
    const data = await authService.login(payload);
    if (request !== sessionRequest.current) throw new Error('Your sign-in changed. Please try again.');
    if (data.otpRequired === false && data.token) {
      if (!tokenIsCurrent(data.token) || data.user?.role !== 'employee' || !employeePortalBase(data.user)) throw new Error('Unable to finish employee sign-in. Please try again.');
      clearEmployeeCache();
      localStorage.setItem('employee_portal_token', data.token);
      localStorage.setItem('employee_portal_user', JSON.stringify(data.user));
      if (data.user.loginPath) localStorage.setItem('employee_portal_login_path', data.user.loginPath);
      setSessionError('');
      setUser(data.user);
      return data;
    }
    if (!data.otpRequired || !data.challengeId || data.token) throw new Error('Employee email verification is unavailable. Contact your administrator.');
    return data;
  }, []);

  const verifyLoginOtp = useCallback(async (payload) => {
    const request = ++sessionRequest.current;
    setSessionError('');
    setLoading(true);
    try {
      const data = await authService.verifyOtp(payload);
      if (request !== sessionRequest.current) throw new Error('Your sign-in changed. Please try again.');
      if (!data?.token || !tokenIsCurrent(data.token) || data.user?.role !== 'employee' || !employeePortalBase(data.user)) throw new Error('Unable to finish employee sign-in. Please try again.');
      localStorage.setItem('employee_portal_token', data.token);
      localStorage.setItem('employee_portal_user', JSON.stringify(data.user));
      if (data.user.loginPath) localStorage.setItem('employee_portal_login_path', data.user.loginPath);
      setUser(data.user);
      return data.user;
    } finally {
      if (request === sessionRequest.current) setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    sessionRequest.current++;
    const pending = authService.logout();
    localStorage.removeItem('employee_portal_token');
    localStorage.removeItem('employee_portal_user');
    clearEmployeeCache();
    setUser(null);
    setLoading(false);
    setSessionError('');
    try { await pending; } catch { /* Local sign-out still succeeds. */ }
  }, []);

  const value = useMemo(() => ({ user, loading, sessionError, refreshSession, login, verifyLoginOtp, logout, isAdmin: user?.role === 'admin' || user?.role === 'hr' }), [user, loading, sessionError, refreshSession, login, verifyLoginOtp, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
