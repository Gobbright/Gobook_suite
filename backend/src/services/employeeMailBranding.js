import { Types } from 'mongoose';
import { storedFileBuffer } from './gridfsStorage.js';

export async function employeeMailBranding(ownerUserId, settings, fallbackName = 'Business') {
  const name = settings.businessName || fallbackName;
  const id = settings.logoFileId || /^\/api\/files\/logos\/([a-f\d]{24})$/i.exec(settings.logoUrl || '')?.[1];
  let logo;
  if (id && Types.ObjectId.isValid(id)) logo = await storedFileBuffer(id, { 'metadata.kind': 'business-logo', 'metadata.userId': new Types.ObjectId(String(ownerUserId)) });
  if (!logo || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(logo.contentType)) return { branding: { name }, attachments: [] };
  const cid = 'employee-business-logo@gobook';
  return { branding: { name, logoCid: cid }, attachments: [{ filename: logo.filename, content: logo.buffer, contentType: logo.contentType, cid, contentDisposition: 'inline' }] };
}
