import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const NewAdmissionPage = lazyPage(() => import('./NewAdmissionPage.jsx'), 'NewAdmissionPage');
const ApplicationsPage = lazyPage(() => import('./ApplicationsPage.jsx'), 'ApplicationsPage');
const EnquiriesPage = lazyPage(() => import('./EnquiriesPage.jsx'), 'EnquiriesPage');
const MeritSelectionPage = lazyPage(() => import('./MeritSelectionPage.jsx'), 'MeritSelectionPage');
const AdmissionReportsPage = lazyPage(() => import('./AdmissionReportsPage.jsx'), 'AdmissionReportsPage');

export const admissionsRoutes = [
  { path: '/school/admissions/new-admission', element: <NewAdmissionPage /> },
  { path: '/school/admissions/applications', element: <ApplicationsPage /> },
  { path: '/school/admissions/enquiries', element: <EnquiriesPage /> },
  { path: '/school/admissions/merit-selection', element: <MeritSelectionPage /> },
  { path: '/school/admissions/reports', element: <AdmissionReportsPage /> },
];
