import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const MedicalBillsPage = lazyPage(() => import('./MedicalBillsPage.jsx'), 'MedicalBillsPage');
const InsuranceClaimsPage = lazyPage(() => import('./InsuranceClaimsPage.jsx'), 'InsuranceClaimsPage');
const PaymentsPage = lazyPage(() => import('./PaymentsPage.jsx'), 'PaymentsPage');
const ReceivablesPage = lazyPage(() => import('./ReceivablesPage.jsx'), 'ReceivablesPage');
const RevenueReportsPage = lazyPage(() => import('./RevenueReportsPage.jsx'), 'RevenueReportsPage');

export const medicalBillingRoutes = [
  { path: '/hospital/medical-bills', element: <MedicalBillsPage /> },
  { path: '/hospital/insurance-claims', element: <InsuranceClaimsPage /> },
  { path: '/hospital/payments', element: <PaymentsPage /> },
  { path: '/hospital/receivables', element: <ReceivablesPage /> },
  { path: '/hospital/revenue-reports', element: <RevenueReportsPage /> },
];
