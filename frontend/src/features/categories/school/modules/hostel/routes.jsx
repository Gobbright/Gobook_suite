import { lazyPage } from '../../../../../routes/lazyPage.jsx';

const RoomsPage = lazyPage(() => import('./RoomsPage.jsx'), 'RoomsPage');
const AllocationPage = lazyPage(() => import('./AllocationPage.jsx'), 'AllocationPage');
const MessPage = lazyPage(() => import('./MessPage.jsx'), 'MessPage');
const HostelFeesPage = lazyPage(() => import('./HostelFeesPage.jsx'), 'HostelFeesPage');

export const hostelRoutes = [
  { path: '/school/hostel/rooms', element: <RoomsPage /> },
  { path: '/school/hostel/allocation', element: <AllocationPage /> },
  { path: '/school/hostel/mess', element: <MessPage /> },
  { path: '/school/hostel/fees', element: <HostelFeesPage /> },
];
