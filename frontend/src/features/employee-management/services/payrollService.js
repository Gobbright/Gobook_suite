import { api } from './api.js';
import { monthQuery } from './monthScope.js';

export const payrollService = {
  payslips: (month) => api.get(`/employee/payslips${monthQuery(month)}`),
  adminPayroll: (month) => api.get(`/admin/payroll${monthQuery(month)}`),
  remove: (id) => api.delete(`/admin/payroll/${id}`),
  generate: (month) => api.post('/admin/payroll/generate', { month }),
  approve: (month) => api.post('/admin/payroll/approve', { month }),
  update: (id, payload) => api.put(`/admin/payroll/${id}`, payload),
};
