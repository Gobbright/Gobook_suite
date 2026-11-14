import { api, request } from './api.js';
import { monthQuery } from './monthScope.js';

export const adminService = {
  dashboard: () => api.get('/admin/employee-dashboard'),
  updates: (filters = {}) => request(`/admin/employee-updates?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value))}`),
  emailSettings: () => api.get('/admin/employee-email-settings'),
  verifyEmailSettings: (payload) => api.put('/admin/employee-email-settings', payload),
  employees: () => api.get('/admin/employees'),
  presence: () => request('/admin/employees/presence'),
  employeeAccess: (id) => api.get(`/admin/employees/${id}/access`),
  employeeOverview: (id, month) => api.get(`/admin/employees/${id}/overview${monthQuery(month)}`),
  setEmployeeAccess: (id, payload) => api.put(`/admin/employees/${id}/access`, payload),
  resetEmployeeQr: (id) => api.post(`/admin/employees/${id}/qr/reset`, {}),
  setEmployeeQrDisplay: (id, fields) => api.put(`/admin/employees/${id}/qr-display`, { fields }),
  createEmployee: (payload) => api.post('/admin/employees', payload),
  createEmployeeWithPhoto: (formData) => api.upload('/admin/employees', formData),
  updateEmployee: (id, payload) => api.put(`/admin/employees/${id}`, payload),
  updateEmployeeWithPhoto: (id, formData) => api.upload(`/admin/employees/${id}`, formData, { method: 'PUT' }),
  deleteEmployee: (id) => api.delete(`/admin/employees/${id}`),
};
