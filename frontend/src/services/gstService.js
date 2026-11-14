import { apiClient } from './apiClient.js';

function enc(val) { return encodeURIComponent(val); }

export const gstService = {
  // Dashboard
  getDashboard: (period) =>
    apiClient(`/gst/dashboard${period ? `?period=${enc(period)}` : ''}`),

  // GSTR-1
  getGstr1: (period, filingType = 'monthly', options = {}) =>
    apiClient(`/gst/gstr1?period=${enc(period)}&filingType=${filingType}`, options),
  saveGstr1: (data) =>
    apiClient('/gst/gstr1', { method: 'PUT', body: JSON.stringify(data) }),
  validateGstr1: (data) => apiClient('/gst/gstr1/validate', { method: 'POST', body: JSON.stringify(data) }),
  generateGstr1Summary: (data) => apiClient('/gst/gstr1/summary', { method: 'POST', body: JSON.stringify(data) }),
  exportGstr1: (data) => apiClient('/gst/gstr1/export', { method: 'POST', body: JSON.stringify(data) }),
  fileGstr1: (data) =>
    apiClient('/gst/gstr1/file', { method: 'POST', body: JSON.stringify(data) }),
  autoPopulateGstr1: (period, filingType = 'monthly') =>
    apiClient(`/gst/gstr1/auto-populate?period=${enc(period)}&filingType=${filingType}`),

  // GSTR-3B
  getGstr3b: (period, options = {}) =>
    apiClient(`/gst/gstr3b?period=${enc(period)}`, options),
  saveGstr3b: (data) =>
    apiClient('/gst/gstr3b', { method: 'PUT', body: JSON.stringify(data) }),
  postGstr3bAccountingAdjustment: (period, expectedSourceHash) =>
    apiClient('/gst/gstr3b/accounting-adjustment', { method: 'POST', body: JSON.stringify({ period, expectedSourceHash }) }),
  fileGstr3b: (period) =>
    apiClient('/gst/gstr3b/file', { method: 'POST', body: JSON.stringify({ period }) }),

  // Reconciliation
  getReconciliation: (period, type = '2b', options = {}) =>
    apiClient(`/gst/reconciliation?period=${enc(period)}&type=${type}`, options),
  saveReconciliation: (data) =>
    apiClient('/gst/reconciliation', { method: 'PUT', body: JSON.stringify(data) }),
  updateEntry: (entryId, data) =>
    apiClient(`/gst/reconciliation/entry/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Reports
  getReport: (type, period) =>
    apiClient(`/gst/reports?type=${enc(type)}&period=${enc(period)}`),

  // GSTR-9 (Annual Return)
  getGstr9: (fy, options = {}) =>
    apiClient(`/gst/gstr9?fy=${enc(fy)}`, options),
  saveGstr9: data => apiClient('/gst/gstr9', { method: 'PUT', body: JSON.stringify(data) }),
  validateGstr9: data => apiClient('/gst/gstr9/validate', { method: 'POST', body: JSON.stringify(data) }),
  summarizeGstr9: data => apiClient('/gst/gstr9/summary', { method: 'POST', body: JSON.stringify(data) }),
  recordGstr9Filing: data => apiClient('/gst/gstr9/file', { method: 'POST', body: JSON.stringify(data) }),
};
