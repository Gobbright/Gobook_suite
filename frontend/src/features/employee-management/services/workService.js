import { api, request } from './api.js';

export const workService = {
  list: (admin, filters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
    return request(`${admin ? '/admin/employee-work' : '/employee/work'}?${query}`);
  },
  assign: (body) => api.post('/admin/employee-work', body),
  update: (admin, id, body) => api.put(`${admin ? '/admin/employee-work' : '/employee/work'}/${id}`, body),
};
