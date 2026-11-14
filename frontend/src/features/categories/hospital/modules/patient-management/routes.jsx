import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const PatientsPage = lazyPage(() => import('./PatientsPage.jsx'), 'PatientsPage');
const AppointmentsPage = lazyPage(() => import('./AppointmentsPage.jsx'), 'AppointmentsPage');
const AdmissionsPage = lazyPage(() => import('./AdmissionsPage.jsx'), 'AdmissionsPage');
const DischargePage = lazyPage(() => import('./DischargePage.jsx'), 'DischargePage');
const MedicalHistoryPage = lazyPage(() => import('./MedicalHistoryPage.jsx'), 'MedicalHistoryPage');
const FollowUpPlanPage = lazyPage(() => import('../clinical/FollowUpPlanPage.jsx'), 'FollowUpPlanPage');

export const patientManagementRoutes = [
  { path: '/hospital/patients', element: <PatientsPage /> },
  { path: '/hospital/appointments', element: <AppointmentsPage /> },
  { path: '/hospital/admissions', element: <AdmissionsPage /> },
  { path: '/hospital/discharge', element: <DischargePage /> },
  { path: '/hospital/medical-history', element: <MedicalHistoryPage /> },
  { path: '/hospital/follow-up', element: <FollowUpPlanPage /> },
];
