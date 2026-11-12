import { useState } from 'react';
import { openModuleRecordFile, uploadModuleRecordFile } from '../../../../../services/moduleRecordsService.js';

export function VoucherAttachments({ attachments = [], disabled, readOnly = false, onChange, onBusy }) {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  async function upload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || uploading) return;
    if (attachments.length + files.length > 10) { setError('Attach up to ten files.'); return; }
    setError(''); setUploading(true); onBusy?.(true);
    const uploaded = [];
    try {
      for (const file of files) {
        if (file.size > 2 * 1024 * 1024) throw new Error('Each attachment must be 2 MB or smaller.');
        uploaded.push(await uploadModuleRecordFile('accounting-vouchers', file));
      }
    } catch (failure) { setError(failure.message || 'Unable to upload attachment'); }
    finally { if (uploaded.length) onChange([...attachments, ...uploaded]); setUploading(false); onBusy?.(false); }
  }
  return <div className="ve-attachments"><strong>Attachments ({attachments.length})</strong>
    {!readOnly && <input aria-label="Voucher attachments" type="file" accept="application/pdf,image/jpeg,image/png,image/gif,image/webp" multiple disabled={disabled || uploading} onChange={upload} />}
    {uploading && <span role="status">Uploading...</span>}
    {attachments.map((file) => <div key={file.id}><button type="button" onClick={() => { setError(''); openModuleRecordFile(file.id).catch((failure) => setError(failure.message)); }}>{file.filename}</button>{!readOnly && <button type="button" disabled={disabled || uploading} aria-label={`Remove ${file.filename}`} onClick={() => onChange(attachments.filter((attachment) => attachment.id !== file.id))}>Remove</button>}</div>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
