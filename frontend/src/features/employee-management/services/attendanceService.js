import { api } from './api.js';
import { monthQuery } from './monthScope.js';

export const attendanceService = {
  checkIn: (payload) => api.post('/employee/attendance/check-in', payload),
  checkOut: (payload) => api.post('/employee/attendance/check-out', payload),
  monthly: (month) => api.get(`/employee/attendance/monthly${monthQuery(month)}`),
  correction: (payload) => api.post('/employee/attendance/correction', payload),
  adminDate: (date) => api.get(`/admin/attendance/today${date ? `?date=${date}` : ''}`),
  adminToday: () => api.get('/admin/attendance/today'),
  remove: (id) => api.delete(`/admin/attendance/${id}`),
  adminMonthly: (month) => api.get(`/admin/attendance/monthly${monthQuery(month)}`),
  adminMark: (payload) => api.post('/admin/attendance/mark', payload),
  corrections: (month) => api.get(`/admin/attendance/corrections${monthQuery(month)}`),
  createCorrectionAdmin: (payload) => api.post('/admin/attendance/corrections', payload),
  updateCorrection: (id, payload) => api.put(`/admin/attendance/corrections/${id}`, payload),
};
