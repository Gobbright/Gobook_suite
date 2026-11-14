import { lazyPage } from '../../../routes/lazyPage.jsx';
import { Navigate } from 'react-router-dom';

const FinanceAutoBillPage = lazyPage(() => import('./FinanceBillsPage.jsx'), 'FinanceAutoBillPage');
const FinanceManualBillPage = lazyPage(() => import('./FinanceBillsPage.jsx'), 'FinanceManualBillPage');
const FinanceCollectionPage = lazyPage(() => import('./FinanceCollectionPage.jsx'), 'FinanceCollectionPage');
const FinanceAddCustomerPage = lazyPage(() => import('./FinanceCustomersPage.jsx'), 'FinanceAddCustomerPage');
const FinanceAllCustomersPage = lazyPage(() => import('./FinanceCustomersPage.jsx'), 'FinanceAllCustomersPage');
const FinanceClosedCustomersPage = lazyPage(() => import('./FinanceCustomersPage.jsx'), 'FinanceClosedCustomersPage');
const FinanceDashboardPage = lazyPage(() => import('./FinanceDashboardPage.jsx'), 'FinanceDashboardPage');
const FinanceProfileSettingsPage = lazyPage(() => import('./FinanceProfileSettingsPage.jsx'), 'FinanceProfileSettingsPage');
const FinanceRemindersPage = lazyPage(() => import('./FinanceRemindersPage.jsx'), 'FinanceRemindersPage');
const FinanceReportsPage = lazyPage(() => import('./FinanceReportsPage.jsx'), 'FinanceReportsPage');

export const financeRoutes = [
  { path: '/finance/dashboard', element: <FinanceDashboardPage /> },
  { path: '/finance/customers', element: <Navigate to="/finance/customers/all" replace /> },
  { path: '/finance/customers/add', element: <FinanceAddCustomerPage /> },
  { path: '/finance/customers/all', element: <FinanceAllCustomersPage /> },
  { path: '/finance/customers/closed', element: <FinanceClosedCustomersPage /> },
  { path: '/finance/collections', element: <FinanceCollectionPage /> },
  { path: '/finance/bills', element: <Navigate to="/finance/bills/auto" replace /> },
  { path: '/finance/bills/auto', element: <FinanceAutoBillPage /> },
  { path: '/finance/bills/manual', element: <FinanceManualBillPage /> },
  { path: '/finance/profile-settings', element: <FinanceProfileSettingsPage /> },
  { path: '/finance/reminders', element: <FinanceRemindersPage /> },
  { path: '/finance/finished-customers', element: <Navigate to="/finance/customers/closed" replace /> },
  { path: '/finance/reports', element: <FinanceReportsPage /> },
];
