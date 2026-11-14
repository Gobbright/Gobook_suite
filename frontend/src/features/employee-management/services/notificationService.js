import { api } from './api.js';
export const notificationService = {
  list: (admin, filters = {}) => api.get(`${admin ? '/admin/employee-notifications' : '/employee/notifications'}?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''))}`),
  count: () => api.get('/employee/notifications/count'),
  read: (id) => api.put(`/employee/notifications/${id}/read`, {}),
  readAll: () => api.put('/employee/notifications/read-all', {}),
  readOwner: (id) => api.put(`/admin/employee-notifications/${id}/read`, {}),
  readAllOwner: () => api.put('/admin/employee-notifications/read-all', {}),
  send: (body) => api.post('/admin/employee-notifications', body),
  retry: (id) => api.post(`/admin/employee-notifications/${id}/retry`, {}),
};
