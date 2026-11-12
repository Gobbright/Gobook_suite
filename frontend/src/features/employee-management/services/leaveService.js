import { api } from './api.js';
import { monthQuery } from './monthScope.js';

export const leaveService = {
  apply: (payload) => api.post('/employee/leave/apply', payload),
  status: (month) => api.get(`/employee/leave/status${monthQuery(month)}`),
  history: (month) => api.get(`/employee/leave/history${monthQuery(month)}`),
  adminLeaves: (month) => api.get(`/admin/leaves${monthQuery(month)}`),
  adminBalances: (month) => api.get(`/admin/leaves${monthQuery(month)}&includeAnnualBalances=true`),
  remove: (id) => api.delete(`/admin/leaves/${id}`),
  createAdmin: (payload) => api.post('/admin/leaves', payload),
  createAdminWithAttachment: (formData) => api.upload('/admin/leaves', formData),
  updateStatus: (id, status) => api.put(`/admin/leaves/${id}/status`, { status }),
};
