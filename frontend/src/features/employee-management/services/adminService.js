import { api } from './api.js';
import { monthQuery } from './monthScope.js';

export const adminService = {
  dashboard: () => api.get('/admin/employee-dashboard'),
  employees: () => api.get('/admin/employees'),
  employeeAccess: (id) => api.get(`/admin/employees/${id}/access`),
  employeeOverview: (id, month) => api.get(`/admin/employees/${id}/overview${monthQuery(month)}`),
  setEmployeeAccess: (id, payload) => api.put(`/admin/employees/${id}/access`, payload),
  resetEmployeeQr: (id) => api.post(`/admin/employees/${id}/qr/reset`, {}),
  createEmployee: (payload) => api.post('/admin/employees', payload),
  createEmployeeWithPhoto: (formData) => api.upload('/admin/employees', formData),
  updateEmployee: (id, payload) => api.put(`/admin/employees/${id}`, payload),
  deleteEmployee: (id) => api.delete(`/admin/employees/${id}`),
};
