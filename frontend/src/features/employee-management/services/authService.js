import { api } from './api.js';

export const authService = {
  login: (payload) => api.post('/employee/auth/login', payload),
  verifyOtp: (payload) => api.post('/employee/auth/verify-otp', payload),
  resendOtp: (payload) => api.post('/employee/auth/resend-otp', payload),
  linkContext: (payload) => api.get(`/employee/auth/link-context?${new URLSearchParams(payload)}`),
  exchangeMain: (token) => api.post('/employee/auth/exchange-main', {}, { headers: { Authorization: 'Bearer ' + token} }),
  me: () => api.get('/employee/me'),
  logout: () => api.post('/employee/auth/logout', {}),
};
