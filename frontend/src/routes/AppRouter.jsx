import { AdminProtectedRoute, GlobalErrorReporter, LegacyHashRedirect, LegacyOnboardingRedirect, ProtectedRoute, ProtectedShell, PublicRoute } from './RouteGuards.jsx';
import { lazyPage } from './lazyPage.jsx';

import { useAutomobileListingLayout } from '../hooks/useAutomobileListingLayout.js';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import '../features/employee-management/employeeManagement.css';

import { isAuthenticated, refreshCurrentUser } from '../services/authService.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import {
  billingRoutes,
  b2cBillingRoute,
  eWayBillRoutes,
  GenericBillingRoute,
  InvoiceEditRoute,
  InvoiceViewRoute,
  pharmacyBillRoutes,
  receivablesRoute,
} from './billingRoutes.jsx';
import { constructionRoutes } from './constructionRoutes.jsx';
import { financeRoutes } from '../features/categories/finance/routes.jsx';
import { hospitalRoutes } from './hospitalRoutes.jsx';
import { hotelRoutes } from './hotelRoutes.jsx';
import { ngoRoutes } from './ngoRoutes.jsx';
import { commonRoutes, retailRoutes } from './retailRoutes.jsx';
import { schoolRoutes } from './schoolRoutes.jsx';

import { getLastRoute } from './routeStorage.js';

const AutomobilePayrollPage = lazyPage(() => import('../features/categories/automobile/AutomobilePayrollPage.jsx'), 'AutomobilePayrollPage');
const AutomobileLeavePage = lazyPage(() => import('../features/categories/automobile/AutomobileLeavePage.jsx'), 'AutomobileLeavePage');
const AutomobileAttendancePage = lazyPage(() => import('../features/categories/automobile/AutomobileAttendancePage.jsx'), 'AutomobileAttendancePage');
const AutomobileEmployeesPage = lazyPage(() => import('../features/categories/automobile/AutomobileEmployeesPage.jsx'), 'AutomobileEmployeesPage');
const AutomobileStockAdjustmentPage = lazyPage(() => import('../features/categories/automobile/AutomobileStockAdjustmentPage.jsx'), 'AutomobileStockAdjustmentPage');
const AdminPanelPage = lazyPage(() => import('../features/admin/AdminPanelPage.jsx'), 'AdminPanelPage');
const MainAdminLoginPage = lazyPage(() => import('../features/admin/MainAdminLoginPage.jsx'), 'MainAdminLoginPage');
const AdminWhatsAppProviderPage = lazyPage(() => import('../features/admin/pages/AdminWhatsAppProviderPage.jsx'), 'AdminWhatsAppProviderPage');
const UsersManagementPage = lazyPage(() => import('../features/admin/pages/UsersManagementPage.jsx'), 'UsersManagementPage');
const InvoicesPage = lazyPage(() => import('../features/admin/pages/InvoicesPage.jsx'), 'InvoicesPage');
const PaymentsPage = lazyPage(() => import('../features/admin/pages/PaymentsPage.jsx'), 'PaymentsPage');
const AdminNotificationsPage = lazyPage(() => import('../features/admin/pages/AdminNotificationsPage.jsx'), 'AdminNotificationsPage');
const AdminStoragePage = lazyPage(() => import('../features/admin/pages/AdminStoragePage.jsx'), 'AdminStoragePage');
const AdminSectionPage = lazyPage(() => import('../features/admin/pages/AdminSectionPage.jsx'), 'AdminSectionPage');
const AdminUserListPage = lazyPage(() => import('../features/admin/pages/AdminUserListPage.jsx'), 'AdminUserListPage');
const AdminUserDetailsPage = lazyPage(() => import('../features/admin/pages/AdminUserDetailsPage.jsx'), 'AdminUserDetailsPage');
const AdminSubscriptionPage = lazyPage(() => import('../features/admin/pages/AdminSubscriptionPage.jsx'), 'AdminSubscriptionPage');
const AdminRecordPage = lazyPage(() => import('../features/admin/pages/AdminRecordPage.jsx'), 'AdminRecordPage');
const CategoryBusinessPage = lazyPage(() => import('../features/admin/pages/CategoryBusinessPage.jsx'), 'CategoryBusinessPage');
const AdminPaymentControlPage = lazyPage(() => import('../features/admin/pages/AdminPaymentControlPage.jsx'), 'AdminPaymentControlPage');
const PaymentMethodVerificationPage = lazyPage(() => import('../features/auth/PaymentMethodVerificationPage.jsx'), 'PaymentMethodVerificationPage');
const CategoryHospitalPage = lazyPage(() => import('../features/admin/pages/CategoryHospitalPage.jsx'), 'CategoryHospitalPage');
const CategoryHotelPage = lazyPage(() => import('../features/admin/pages/CategoryHotelPage.jsx'), 'CategoryHotelPage');
const ForgotPasswordPage = lazyPage(() => import('../features/auth/ForgotPasswordPage.jsx'), 'ForgotPasswordPage');
const PaymentPage = lazyPage(() => import('../features/auth/PaymentPage.jsx'), 'PaymentPage');
const LegalPage = lazyPage(() => import('../features/auth/LegalPage.jsx'), 'LegalPage');
const DataDeletionPage = lazyPage(() => import('../features/meta/DataDeletionPage.jsx'), 'DataDeletionPage');
const LoginPage = lazyPage(() => import('../features/auth/LoginPage.jsx'), 'LoginPage');
const RegisterPage = lazyPage(() => import('../features/auth/RegisterPage.jsx'), 'RegisterPage');
const VerifyEmailPage = lazyPage(() => import('../features/auth/VerifyEmailPage.jsx'), 'VerifyEmailPage');
const PublicStorePage = lazyPage(() => import('../features/store/PublicStorePage.jsx'), 'PublicStorePage');
const PlatformAdminPage = lazyPage(() => import('../features/platform-admin/PlatformAdminPage.jsx'), 'PlatformAdminPage');
const EmployeeLoginRoute = lazyPage(() => import('../features/employee-management/EmployeePortalRoutes.jsx'), 'EmployeeLoginRoute');
const EmployeePortalRoutes = lazyPage(() => import('../features/employee-management/EmployeePortalRoutes.jsx'), 'EmployeePortalRoutes');
const EmployeeAdminDashboard = lazyPage(() => import('../features/employee-management/pages/admin/Dashboard.jsx'));
const AutomobileEmployeeDashboard = lazyPage(() => import('../features/categories/automobile/AutomobileEmployeeDashboard.jsx'), 'AutomobileEmployeeDashboard');
const EmployeeList = lazyPage(() => import('../features/employee-management/pages/admin/employees/EmployeeList.jsx'));
const EmployeeGroupsPage = lazyPage(() => import('../features/employee-management/pages/admin/employees/EmployeeGroupsPage.jsx'));
const AddEmployee = lazyPage(() => import('../features/employee-management/pages/admin/employees/AddEmployee.jsx'));
const EmployeeProfile = lazyPage(() => import('../features/employee-management/pages/admin/employees/EmployeeProfile.jsx'));
const EmployeeDocuments = lazyPage(() => import('../features/employee-management/pages/admin/employees/EmployeeDocuments.jsx'));
const EmployeePermissions = lazyPage(() => import('../features/employee-management/pages/employee/Permissions.jsx'));
const TodayAttendance = lazyPage(() => import('../features/employee-management/pages/admin/attendance/TodayAttendance.jsx'));
const LeaveRequests = lazyPage(() => import('../features/employee-management/pages/admin/leave/LeaveRequests.jsx'));
const Salary = lazyPage(() => import('../features/employee-management/pages/admin/payroll/Salary.jsx'));
const AdminMonthlyAttendance = lazyPage(() => import('../features/employee-management/pages/admin/attendance/MonthlyAttendance.jsx'));
const CorrectionRequests = lazyPage(() => import('../features/employee-management/pages/admin/attendance/CorrectionRequests.jsx'));
const AttendanceReports = lazyPage(() => import('../features/employee-management/pages/admin/attendance/AttendanceReports.jsx'));
const LeaveBalance = lazyPage(() => import('../features/employee-management/pages/admin/leave/LeaveBalance.jsx'));
const LeaveTypes = lazyPage(() => import('../features/employee-management/pages/admin/leave/LeaveTypes.jsx'));
const LeaveCalendar = lazyPage(() => import('../features/employee-management/pages/admin/leave/LeaveCalendar.jsx'));
const LeaveReports = lazyPage(() => import('../features/employee-management/pages/admin/leave/LeaveReports.jsx'));
const AdminPayslips = lazyPage(() => import('../features/employee-management/pages/admin/payroll/Payslips.jsx'));
const PayrollProcessing = lazyPage(() => import('../features/employee-management/pages/admin/payroll/PayrollProcessing.jsx'));
const PayrollDeductions = lazyPage(() => import('../features/employee-management/pages/admin/payroll/Deductions.jsx'));
const PayrollReports = lazyPage(() => import('../features/employee-management/pages/admin/payroll/PayrollReports.jsx'));
const HolidayList = lazyPage(() => import('../features/employee-management/pages/admin/holidays/HolidayList.jsx'));
const AddHoliday = lazyPage(() => import('../features/employee-management/pages/admin/holidays/AddHoliday.jsx'));
const DashboardPage = lazyPage(() => import('../pages/DashboardPage.jsx'), 'DashboardPage');
const AutomobileDashboardPage = lazyPage(() => import('../features/categories/automobile/AutomobileDashboardPage.jsx'), 'AutomobileDashboardPage');
const HotelDashboardPage = lazyPage(() => import('../features/categories/hotel/modules/dashboard/HotelDashboardPage.jsx'), 'HotelDashboardPage');

// Rendered inside <BrowserRouter>, so useLocation() re-runs this on clean URL navigation,
// keeping category-specific route branches fresh without needing a full page reload.
export function FullAppRoutes() {
  useLocation();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (isAuthenticated()) refreshCurrentUser().catch(() => {});
  }, []);

  const useAutomobileLayout = useAutomobileListingLayout();
  const category = currentUser?.category || 'other';
  const hasRetailModules = ['retail', 'automobile'].includes(category);
  const adminRoute = (element) => <AdminProtectedRoute>{element}</AdminProtectedRoute>;
  const adminRedirect = (to) => adminRoute(<Navigate to={to} replace />);
  const employeeManagementPage = (element) => <div className="employee-management">{element}</div>;

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/terms" element={<LegalPage type="terms" />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />
      <Route path="/privacy-policy" element={<LegalPage type="privacy" />} />
      <Route path="/store/:slug" element={<PublicStorePage />} />
      <Route path="/store/:slug/:storePage" element={<PublicStorePage />} />
      <Route path="/store/:slug/product/:productId" element={<PublicStorePage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      <Route path="/data-deletion-status/:confirmationCode" element={<DataDeletionPage status />} />
      <Route path="/employee-login" element={<EmployeeLoginRoute />} />
      <Route path="/employee-login/:businessSlug/:ownerUserId/:employeeId" element={<EmployeeLoginRoute />} />
      <Route path="/employee-login/:businessSlug/:employeeId" element={<EmployeeLoginRoute />} />
      <Route path="/employee/*" element={<EmployeePortalRoutes />} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/admin-login" element={<MainAdminLoginPage />} />
      <Route path="/admin" element={adminRoute(<AdminPanelPage />)} />
      <Route path="/admin/whatsapp-provider" element={adminRoute(<AdminWhatsAppProviderPage />)} />
      <Route path="/admin/users" element={adminRoute(<AdminSectionPage group="usersBusinesses" />)} />
      <Route path="/admin/users/all" element={adminRoute(<AdminUserListPage type="all" />)} />
      <Route path="/admin/users/active" element={adminRoute(<AdminUserListPage type="active" />)} />
      <Route path="/admin/users/trial" element={adminRoute(<AdminUserListPage type="trial" />)} />
      <Route path="/admin/users/expired" element={adminRoute(<AdminUserListPage type="expired" />)} />
      <Route path="/admin/users/blocked" element={adminRoute(<AdminUserListPage type="blocked" />)} />
      <Route path="/payment-method-verification" element={<ProtectedRoute><PaymentMethodVerificationPage /></ProtectedRoute>} />
      <Route path="/admin/users/deleted" element={adminRoute(<AdminUserListPage type="deleted" />)} />
      <Route path="/admin/user-details" element={adminRedirect('/admin/user-details/business')} />
      <Route path="/admin/user-details/business" element={adminRoute(<AdminUserDetailsPage type="business" />)} />
      <Route path="/admin/user-details/owner" element={adminRoute(<AdminUserDetailsPage type="owner" />)} />
      <Route path="/admin/user-details/category" element={adminRedirect('/admin/user-details/business')} />
      <Route path="/admin/user-details/subscription" element={adminRoute(<AdminUserDetailsPage type="subscription" />)} />
      <Route path="/admin/user-details/registration" element={adminRedirect('/admin/user-details/business')} />
      <Route path="/admin/user-details/expiry" element={adminRedirect('/admin/user-details/subscription')} />
      <Route path="/admin/user-details/payments" element={adminRoute(<AdminUserDetailsPage type="payments" />)} />
      <Route path="/admin/user-details/login" element={adminRedirect('/admin/user-details/owner')} />
      <Route path="/admin/subscription/plans" element={adminRoute(<AdminSubscriptionPage type="plans" />)} />
      <Route path="/admin/subscription/active" element={adminRoute(<AdminSubscriptionPage type="active" />)} />
      <Route path="/admin/subscription/expired" element={adminRoute(<AdminSubscriptionPage type="expired" />)} />
      <Route path="/admin/subscription/requests" element={adminRoute(<AdminSubscriptionPage type="requests" />)} />
      <Route path="/admin/subscription/history" element={adminRoute(<AdminSubscriptionPage type="history" />)} />
      <Route path="/admin/invoices" element={adminRoute(<InvoicesPage />)} />
      <Route path="/admin/products" element={adminRoute(<AdminSectionPage group="inventory" />)} />
      <Route path="/admin/payments" element={adminRoute(<PaymentsPage type="all" />)} />
      <Route path="/admin/payments/all" element={adminRoute(<PaymentsPage type="all" />)} />
      <Route path="/admin/payments/pending" element={adminRoute(<PaymentsPage type="pending" />)} />
      <Route path="/admin/payments/successful" element={adminRoute(<PaymentsPage type="successful" />)} />
      <Route path="/admin/payments/failed" element={adminRoute(<PaymentsPage type="failed" />)} />
      <Route path="/admin/payments/reports" element={adminRoute(<PaymentsPage type="reports" />)} />
      <Route path="/admin/notifications" element={adminRoute(<AdminNotificationsPage />)} />
      <Route path="/admin/notifications/*" element={adminRedirect('/admin/notifications')} />
      <Route path="/admin/storage" element={adminRedirect('/admin/storage/overview')} />
      <Route path="/admin/storage/overview" element={adminRoute(<AdminStoragePage type="overview" />)} />
      <Route path="/admin/storage/files" element={adminRoute(<AdminStoragePage type="files" />)} />
      <Route path="/admin/storage/users" element={adminRoute(<AdminStoragePage type="businesses" />)} />
      <Route path="/admin/storage/businesses" element={adminRedirect('/admin/storage/users')} />
      <Route path="/admin/storage/collections" element={adminRoute(<AdminStoragePage type="collections" />)} />
      <Route path="/admin/storage/daily-reports" element={adminRoute(<AdminStoragePage type="daily-reports" />)} />
      <Route path="/admin/reports/user-report" element={adminRoute(<AdminRecordPage kind="userReport" />)} />
      <Route path="/admin/reports/renewal-report" element={adminRoute(<AdminRecordPage kind="renewalReport" />)} />
      <Route path="/admin/reports/expiry-report" element={adminRoute(<AdminRecordPage kind="expiryReport" />)} />
      <Route path="/admin/reports/payment-report" element={adminRoute(<AdminRecordPage kind="paymentReport" />)} />
      <Route path="/admin/reports/revenue-report" element={adminRoute(<AdminRecordPage kind="revenueReport" />)} />
      <Route path="/admin/settings/subscription-plans" element={adminRoute(<AdminRecordPage kind="subscriptionPlans" />)} />
      <Route path="/admin/settings/trial-days" element={adminRoute(<AdminRecordPage kind="trialDays" />)} />
      <Route path="/admin/settings/grace-period" element={adminRoute(<AdminRecordPage kind="gracePeriod" />)} />
      <Route path="/admin/settings/auto-block-after-expiry" element={adminRoute(<AdminRecordPage kind="autoBlockAfterExpiry" />)} />
      <Route path="/admin/settings/payment-settings" element={adminRoute(<AdminRecordPage kind="paymentSettings" />)} />
      <Route path="/admin/payment-control" element={adminRoute(<AdminPaymentControlPage />)} />
      <Route path="/admin/customers" element={adminRoute(<AdminSectionPage group="customers" />)} />
      <Route path="/admin/accounting" element={adminRoute(<AdminSectionPage group="accounting" />)} />
      <Route path="/admin/hr" element={adminRoute(<AdminSectionPage group="hr" />)} />
      <Route path="/admin/inventory" element={adminRoute(<AdminSectionPage group="inventory" />)} />
      <Route path="/admin/reports" element={adminRoute(<AdminSectionPage group="reports" />)} />
      <Route path="/admin/category/business" element={adminRoute(<CategoryBusinessPage />)} />
      <Route path="/admin/category/hospital" element={adminRoute(<CategoryHospitalPage />)} />
      <Route path="/admin/category/hotel" element={adminRoute(<CategoryHotelPage />)} />
      <Route path="/admin/subscription" element={adminRedirect('/admin/subscription/plans')} />
      <Route path="/admin/settings" element={adminRedirect('/admin/settings/subscription-plans')} />
      <Route path="/admin/*" element={adminRedirect('/admin')} />
      <Route path="/onboarding" element={<LegacyOnboardingRedirect />} />
      <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
      <Route path="/verify-email" element={<ProtectedRoute><VerifyEmailPage /></ProtectedRoute>} />
      <Route path="/platform-admin" element={<ProtectedRoute><PlatformAdminPage /></ProtectedRoute>} />

      <Route element={<ProtectedShell />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="/dashboard" element={category === 'finance' ? <Navigate to="/finance/dashboard" replace /> : category === 'hotel' ? <HotelDashboardPage /> : hasRetailModules ? <AutomobileDashboardPage /> : <DashboardPage />} />

        <Route path="/employee-management/dashboard" element={category === 'automobile' ? <AutomobileEmployeeDashboard /> : employeeManagementPage(<EmployeeAdminDashboard />)} />
        <Route path="/employee-management/employees" element={useAutomobileLayout ? <AutomobileEmployeesPage /> : employeeManagementPage(<EmployeeList />)} />
        <Route path="/employee-management/departments" element={employeeManagementPage(<EmployeeGroupsPage kind="departments" />)} />
        <Route path="/employee-management/designations" element={employeeManagementPage(<EmployeeGroupsPage kind="designations" />)} />
        <Route path="/employee-management/employees/add" element={employeeManagementPage(<AddEmployee />)} />
        <Route path="/employee-management/employees/:id" element={employeeManagementPage(<EmployeeProfile />)} />
        <Route path="/employee-management/employees/:id/documents" element={employeeManagementPage(<EmployeeDocuments />)} />
        <Route path="/employee-management/attendance" element={useAutomobileLayout ? <AutomobileAttendancePage /> : employeeManagementPage(<TodayAttendance />)} />
        <Route path="/employee-management/leave" element={useAutomobileLayout ? <AutomobileLeavePage /> : employeeManagementPage(<LeaveRequests />)} />
        <Route path="/employee-management/leave/permissions" element={employeeManagementPage(<EmployeePermissions admin />)} />
        <Route path="/employee-management/payroll" element={useAutomobileLayout ? <AutomobilePayrollPage /> : employeeManagementPage(<PayrollProcessing />)} />
        <Route path="/employee-management/reports" element={<Navigate to="/employee-management/dashboard" replace />} />
        <Route path="/employee-management/settings" element={<Navigate to="/employee-management/dashboard" replace />} />
        <Route path="/employee-management/attendance/monthly" element={employeeManagementPage(<AdminMonthlyAttendance />)} />
        <Route path="/employee-management/attendance/corrections" element={employeeManagementPage(<CorrectionRequests />)} />
        <Route path="/employee-management/attendance/reports" element={employeeManagementPage(<AttendanceReports />)} />
        <Route path="/employee-management/leave/balance" element={employeeManagementPage(<LeaveBalance />)} />
        <Route path="/employee-management/leave/types" element={employeeManagementPage(<LeaveTypes />)} />
        <Route path="/employee-management/leave/calendar" element={employeeManagementPage(<LeaveCalendar />)} />
        <Route path="/employee-management/leave/reports" element={employeeManagementPage(<LeaveReports />)} />
        <Route path="/employee-management/payroll/processing" element={employeeManagementPage(<PayrollProcessing />)} />
        <Route path="/employee-management/payroll/salary" element={useAutomobileLayout ? <AutomobilePayrollPage /> : employeeManagementPage(<Salary />)} />
        <Route path="/employee-management/payroll/payslips" element={employeeManagementPage(<AdminPayslips />)} />
        <Route path="/employee-management/payroll/deductions" element={employeeManagementPage(<PayrollDeductions />)} />
        <Route path="/employee-management/payroll/reports" element={employeeManagementPage(<PayrollReports />)} />
        <Route path="/employee-management/holidays" element={employeeManagementPage(<HolidayList />)} />
        <Route path="/employee-management/holidays/add" element={employeeManagementPage(<AddHoliday />)} />

        <Route path="/billing/b2c" element={b2cBillingRoute} />
        {billingRoutes.filter(({ documentType }) => hasRetailModules || ['invoice', 'bill-of-supply'].includes(documentType)).map(({ slug, documentType, list, form }) => (
          <Route key={slug} path={`/billing/${slug}`}>
            <Route index element={list} />
            <Route path="new" element={form} />
            <Route path=":id/edit" element={<InvoiceEditRoute documentType={documentType} />} />
            <Route path=":id/view" element={<InvoiceViewRoute documentType={documentType} />} />
          </Route>
        ))}

        {hasRetailModules && (
          <>
            <Route path="/billing/e-way-bill" element={eWayBillRoutes.list} />
            <Route path="/billing/e-way-bill/new" element={eWayBillRoutes.form} />
            <Route path="/billing/e-way-bill/:id/edit" element={eWayBillRoutes.edit} />
            <Route path="/billing/e-way-bill/:id/view" element={eWayBillRoutes.view} />
            <Route path="/billing/receivables" element={receivablesRoute} />
            <Route path="/billing/:documentType" element={<GenericBillingRoute />} />
          </>
        )}

        {category === 'hospital' && (
          <Route path="/billing/pharmacy-bill">
            <Route index element={pharmacyBillRoutes.list} />
            <Route path="new" element={pharmacyBillRoutes.form} />
            <Route path=":id/edit" element={pharmacyBillRoutes.edit} />
            <Route path=":id/view" element={pharmacyBillRoutes.view} />
          </Route>
        )}

        {commonRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {hasRetailModules && retailRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'hospital' && hospitalRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'school' && schoolRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'hotel' && hotelRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'construction' && constructionRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'ngo' && ngoRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {category === 'automobile' && (
          <>
            <Route path="/stock-in/new" element={<AutomobileStockAdjustmentPage direction="in" />} />
            <Route path="/stock-out/new" element={<AutomobileStockAdjustmentPage direction="out" />} />
            <Route path="/automobile/*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {category === 'finance' && financeRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        <Route path="*" element={category === 'finance' ? <Navigate to="/finance/dashboard" replace /> : category === 'automobile' ? <Navigate to="/dashboard" replace /> : <DashboardPage />} />
      </Route>
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <GlobalErrorReporter />
      <LegacyHashRedirect />
      <FullAppRoutes />
    </BrowserRouter>
  );
}
