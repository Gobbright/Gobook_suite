import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { selfService } from '../../services/selfService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { employeeScreenPath } from '../../services/portalPaths.js';

export default function Documents() {
  const { user } = useAuth();
  const { data, loading, error } = useLoad(selfService.documents, []);
  const [fileError, setFileError] = useState('');
  async function open(doc, download) {
    setFileError('');
    try { await selfService.openDocument(doc, download); } catch (err) { setFileError(err.message); }
  }
  const columns = [{ key: 'name', label: 'Document' }, { key: 'category', label: 'Category' }, { key: 'size', label: 'Size' }, { key: 'uploadedOn', label: 'Uploaded On' }, { key: 'actions', label: 'Actions', render: (doc) => <div className="hr-actions"><button className="btn" type="button" onClick={() => open(doc, false)}>View</button><button className="btn" type="button" onClick={() => open(doc, true)}>Download</button></div> }];
  return <><PageHeader title="My Documents" subtitle="Documents uploaded by your business administrator" action={<Link to={employeeScreenPath(user, 'profile')}>My Profile</Link>} />{(error || fileError) && <p className="error" role="alert">{error || fileError}</p>}{loading ? <div className="card">Loading documents…</div> : <DataTable columns={columns} rows={data?.data || []} />}</>;
}
