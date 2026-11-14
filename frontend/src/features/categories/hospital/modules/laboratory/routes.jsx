import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const TestOrdersPage = lazyPage(() => import('./TestOrdersPage.jsx'), 'TestOrdersPage');
const LabReportsPage = lazyPage(() => import('./LabReportsPage.jsx'), 'LabReportsPage');
const SampleCollectionPage = lazyPage(() => import('./SampleCollectionPage.jsx'), 'SampleCollectionPage');
const DiagnosticsPage = lazyPage(() => import('./DiagnosticsPage.jsx'), 'DiagnosticsPage');
const LaboratoryPage = lazyPage(() => import('./LaboratoryPage.jsx'), 'LaboratoryPage');
const LabResultsPage = lazyPage(() => import('./LabResultsPage.jsx'), 'LabResultsPage');

export const laboratoryRoutes = [
  { path: '/hospital/test-orders', element: <TestOrdersPage /> },
  { path: '/hospital/lab-reports', element: <LabReportsPage /> },
  { path: '/hospital/sample-collection', element: <SampleCollectionPage /> },
  { path: '/hospital/test-results', element: <LabResultsPage /> },
  { path: '/hospital/lab-results', element: <LabResultsPage /> },
  { path: '/hospital/diagnostics', element: <LaboratoryPage /> },
  { path: '/hospital/diagnostic-reports', element: <DiagnosticsPage /> },
];
