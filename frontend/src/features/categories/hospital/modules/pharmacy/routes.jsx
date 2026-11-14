import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const BatchExpiryPage = lazyPage(() => import('./BatchExpiryPage.jsx'), 'BatchExpiryPage');
const MedicinesPage = lazyPage(() => import('./MedicinesPage.jsx'), 'MedicinesPage');
const MedicineDispensingPage = lazyPage(() => import('./MedicineDispensingPage.jsx'), 'MedicineDispensingPage');
const MedicineReturnsPage = lazyPage(() => import('./MedicineReturnsPage.jsx'), 'MedicineReturnsPage');
const PharmacyStockPage = lazyPage(() => import('./PharmacyStockPage.jsx'), 'PharmacyStockPage');
const ExpiryAlertsPage = lazyPage(() => import('./ExpiryAlertsPage.jsx'), 'ExpiryAlertsPage');
const SuppliersPage = lazyPage(() => import('./SuppliersPage.jsx'), 'SuppliersPage');

export const pharmacyRoutes = [
  { path: '/hospital/medicine-dispensing', element: <MedicineDispensingPage /> },
  { path: '/hospital/medicine-returns', element: <MedicineReturnsPage /> },
  { path: '/hospital/batch-expiry', element: <BatchExpiryPage /> },
  { path: '/hospital/medicines', element: <MedicinesPage /> },
  { path: '/hospital/pharmacy-stock', element: <PharmacyStockPage /> },
  { path: '/hospital/expiry-alerts', element: <ExpiryAlertsPage /> },
  { path: '/hospital/suppliers', element: <SuppliersPage /> },
];
