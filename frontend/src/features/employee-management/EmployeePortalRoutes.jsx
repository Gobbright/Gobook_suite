import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { employeePortalBase, employeeScreenPath, legacyEmployeeScreen } from './services/portalPaths.js';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { EmployeeLayout } from './components/layout/EmployeeLayout.jsx';
import Login from './pages/auth/Login.jsx';
import EmployeeDashboard from './pages/employee/Dashboard.jsx';
import Attendance from './pages/employee/Attendance.jsx';
import EmployeeMonthlyAttendance from './pages/employee/MonthlyAttendance.jsx';
import CorrectionRequest from './pages/employee/CorrectionRequest.jsx';
import ApplyLeave from './pages/employee/ApplyLeave.jsx';
import LeaveStatus from './pages/employee/LeaveStatus.jsx';
import LeaveHistory from './pages/employee/LeaveHistory.jsx';
import Payslips from './pages/employee/Payslips.jsx';
import Holidays from './pages/employee/Holidays.jsx';
import MyProfile from './pages/employee/MyProfile.jsx';
import Documents from './pages/employee/Documents.jsx';
import Permissions from './pages/employee/Permissions.jsx';

function EmployeeShell({ children }) {
  return (
    <ProtectedRoute roles={['employee']}>
      <EmployeeLayout>{children}</EmployeeLayout>
    </ProtectedRoute>
  );
}

export function EmployeeLoginRoute() {
  return (
    <AuthProvider>
      <div className="employee-portal">
        <Login />
      </div>
    </AuthProvider>
  );
}

function EmployeeScreens() {
  const { user } = useAuth();
  const params = useParams();
  const base = employeePortalBase(user);
  const requested = `/employee/${encodeURIComponent(params.businessSlug || '')}/${encodeURIComponent(params.employeeId || '')}`;
  if (!base) return <Navigate to="/employee-login" replace />;
  if (requested !== base) return <Navigate to={employeeScreenPath(user)} replace />;
  return <Routes>
    <Route index element={<EmployeeDashboard />} />
    <Route path="dashboard" element={<Navigate to={employeeScreenPath(user)} replace />} />
    <Route path="attendance" element={<Attendance />} />
    <Route path="attendance/monthly" element={<EmployeeMonthlyAttendance />} />
    <Route path="attendance/correction" element={<CorrectionRequest />} />
    <Route path="leave/apply" element={<ApplyLeave />} />
    <Route path="leave/status" element={<LeaveStatus />} />
    <Route path="leave/history" element={<LeaveHistory />} />
    <Route path="payslips" element={<Payslips />} />
    <Route path="holidays" element={<Holidays />} />
    <Route path="profile" element={<MyProfile />} />
    <Route path="documents" element={<Documents />} />
    <Route path="permissions" element={<Permissions />} />
    <Route path="*" element={<Navigate to={employeeScreenPath(user)} replace />} />
  </Routes>;
}
function LegacyEmployeeRedirect() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!employeePortalBase(user)) return <Navigate to="/employee-login" replace />;
  return <Navigate to={employeeScreenPath(user, legacyEmployeeScreen(pathname))} replace />;
}
export function EmployeePortalRoutes() {
  return <AuthProvider><div className="employee-portal"><Routes>
    <Route path=":businessSlug/:employeeId/*" element={<EmployeeShell><EmployeeScreens /></EmployeeShell>} />
    <Route path="*" element={<EmployeeShell><LegacyEmployeeRedirect /></EmployeeShell>} />
  </Routes></div></AuthProvider>;
}
