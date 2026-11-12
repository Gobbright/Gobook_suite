import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page"><div className="card">Loading...</div></div>;
  if (!user) {
    const path = localStorage.getItem('employee_portal_login_path') || '';
    return <Navigate to={path.startsWith('/employee-login/') ? path : '/employee-login'} replace />;
  }
  if (roles?.length && !roles.includes(user.role)) return <Navigate to={user.role === 'employee' ? '/employee/dashboard' : '/employee-management/dashboard'} replace />;
  return children;
}
