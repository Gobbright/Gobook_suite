import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { employeeScreenPath } from '../services/portalPaths.js';

export function ProtectedRoute({ children, roles }) {
  const { user, loading, sessionError, refreshSession } = useAuth();
  if (loading) return <div className="login-page"><div className="card">Loading...</div></div>;
  if (sessionError) return <div className="login-page"><div className="card" role="alert"><p>{sessionError}</p><button className="btn primary" type="button" onClick={refreshSession}>Try again</button></div></div>;
  if (!user) {
    const path = localStorage.getItem('employee_portal_login_path') || '';
    return <Navigate to={path === '/employee-login' || path.startsWith('/employee-login/') ? path : '/employee-login'} replace />;
  }
  if (roles?.length && !roles.includes(user.role)) return <Navigate to={user.role === 'employee' ? employeeScreenPath(user) : '/employee-management/dashboard'} replace />;
  return children;
}
