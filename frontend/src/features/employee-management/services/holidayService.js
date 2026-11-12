import { api } from './api.js';
import { monthQuery } from './monthScope.js';

export const holidayService = {
  list: (month) => api.get(`/employee/holidays${monthQuery(month)}`),
  adminList: (month) => api.get(`/admin/holidays${monthQuery(month)}`),
  create: (payload) => api.post('/admin/holidays', payload),
};
