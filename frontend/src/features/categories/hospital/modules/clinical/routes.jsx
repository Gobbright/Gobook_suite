import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const DoctorsPage = lazyPage(() => import('./DoctorsPage.jsx'), 'DoctorsPage');
const DepartmentsPage = lazyPage(() => import('./DepartmentsPage.jsx'), 'DepartmentsPage');
const ConsultationPage = lazyPage(() => import('./ConsultationPage.jsx'), 'ConsultationPage');
const TreatmentPage = lazyPage(() => import('./TreatmentPage.jsx'), 'TreatmentPage');
const PrescriptionPage = lazyPage(() => import('./PrescriptionPage.jsx'), 'PrescriptionPage');
const NursingPage = lazyPage(() => import('./NursingPage.jsx'), 'NursingPage');

export const clinicalRoutes = [
  { path: '/hospital/doctors', element: <DoctorsPage /> },
  { path: '/hospital/departments', element: <DepartmentsPage /> },
  { path: '/hospital/consultation', element: <ConsultationPage /> },
  { path: '/hospital/treatment', element: <TreatmentPage /> },
  { path: '/hospital/prescription', element: <PrescriptionPage /> },
  { path: '/hospital/nursing', element: <NursingPage /> },
];
