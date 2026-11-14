import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const DashboardPage = lazyPage(() => import('../../../../../pages/DashboardPage.jsx'), 'DashboardPage');

const dashboard = <DashboardPage />;

export const constructionDashboardRoutes = [
  { path: '/construction/dashboard', element: dashboard },
  { path: '/construction/dashboard/active-projects', element: dashboard },
  { path: '/construction/dashboard/site-progress', element: dashboard },
  { path: '/construction/dashboard/material-cost', element: dashboard },
  { path: '/construction/dashboard/pending-bills', element: dashboard },
];
