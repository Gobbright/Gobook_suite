import { api } from './api.js';
import { monthQuery } from './monthScope.js';
import { openPrivateFile } from '../../../services/privateFiles.js';

export const selfService = {
  documents: () => api.get('/employee/documents'),
  permissions: (month) => api.get(`/employee/permissions${monthQuery(month)}`),
  adminPermissions: (month) => api.get(`/admin/permissions${monthQuery(month)}`),
  requestPermission: (payload) => api.post('/employee/permissions', payload),
  reviewPermission: (id, status) => api.put(`/admin/permissions/${id}/status`, { status }),
  openDocument: (doc, download = false) => openPrivateFile(`/employee/documents/${doc._id}/file${download ? '?download=true' : ''}`, localStorage.getItem('employee_portal_token'), { download, filename: doc.name }),
};
