import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const DashboardPage = lazyPage(() => import('../../../../../pages/DashboardPage.jsx'), 'DashboardPage');

const dashboard = <DashboardPage />;

export const ngoDashboardRoutes = [
  { path: '/ngo/dashboard', element: dashboard },
  { path: '/ngo/dashboard/total-donations', element: dashboard },
  { path: '/ngo/dashboard/active-campaigns', element: dashboard },
  { path: '/ngo/dashboard/beneficiaries-served', element: dashboard },
  { path: '/ngo/dashboard/volunteers', element: dashboard },
];
