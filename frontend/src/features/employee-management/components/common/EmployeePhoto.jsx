import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../../services/apiBase.js';

export function EmployeePhoto({ employee, token }) {
  const [url, setUrl] = useState('');
  const fileId = employee?.photo?.gridFsFileId;
  useEffect(() => {
    let active = true;
    let blobUrl = '';
    setUrl('');
    if (fileId && token) fetch(`${API_BASE_URL}/files/employee-assets/${fileId}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
      if (!response.ok) return;
      const blob = await response.blob();
      if (active) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl); }
    }).catch(() => {});
    return () => { active = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [fileId, token]);
  return url ? <img src={url} alt={`${employee?.name || 'Employee'} profile`} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 16 }} /> : null;
}
