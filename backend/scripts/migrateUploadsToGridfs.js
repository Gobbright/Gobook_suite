import 'dotenv/config';
import path from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

import { connectDatabase, disconnectDatabase } from '../src/services/database.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { HRDocument } from '../src/models/Document.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { Leave } from '../src/models/Leave.js';
import { storeBuffer } from '../src/services/gridfsStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');

function contentType(filename, fallback = 'application/octet-stream') {
  const extension = path.extname(filename).toLowerCase();
  return ({ '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' })[extension] || fallback;
}

async function migrateLogos() {
  const settingsRows = await BusinessSettings.find({ logoFileId: { $exists: false }, logoUrl: /^\/uploads\/logos\// }).lean();
  let migrated = 0;
  for (const settings of settingsRows) {
    const relative = String(settings.logoUrl).replace(/^\//, '');
    const source = path.join(BACKEND_ROOT, relative);
    if (!existsSync(source)) continue;
    const user = await AppUser.findById(settings.userId).select('businessId').lean();
    const stored = await storeBuffer({ buffer: await readFile(source), filename: path.basename(source), contentType: contentType(source, 'image/png'), metadata: { kind: 'business-logo', userId: settings.userId, businessId: user?.businessId, migratedFrom: relative } });
    await BusinessSettings.updateOne({ _id: settings._id }, { $set: { logoFileId: stored.id, logoUrl: `/api/files/logos/${stored.id}` } });
    migrated += 1;
  }
  return migrated;
}

async function migrateDocuments() {
  const documents = await HRDocument.find({ gridFsFileId: { $exists: false }, filePath: { $nin: ['', null] } }).lean();
  let migrated = 0;
  for (const document of documents) {
    const source = path.join(BACKEND_ROOT, 'uploads', 'documents', path.basename(document.filePath));
    if (!existsSync(source)) continue;
    const user = await AppUser.findById(document.userId).select('businessId').lean();
    const stored = await storeBuffer({ buffer: await readFile(source), filename: document.name || path.basename(source), contentType: contentType(source, document.mimeType), metadata: { kind: 'hr-document', userId: document.userId, businessId: user?.businessId, category: document.category, migratedFrom: document.filePath } });
    await HRDocument.updateOne({ _id: document._id }, { $set: { gridFsFileId: stored.id } });
    migrated += 1;
  }
  return migrated;
}

async function migrateEmployeeAssets() {
  let photos = 0;
  let leaveAttachments = 0;
  const employees = await Employee.find({ 'photo.gridFsFileId': { $exists: false }, 'photo.url': /^\/uploads\/employees\// }).lean();
  for (const employee of employees) {
    const relative = String(employee.photo?.url || '').replace(/^\//, '');
    const source = path.join(BACKEND_ROOT, relative);
    if (!existsSync(source)) continue;
    const stored = await storeBuffer({ buffer: await readFile(source), filename: employee.photo.originalName || path.basename(source), contentType: contentType(source, employee.photo.mimeType), metadata: { kind: 'employee-photo', userId: employee.userId, migratedFrom: relative } });
    await Employee.updateOne({ _id: employee._id }, { $set: { 'photo.gridFsFileId': stored.id, 'photo.fileName': stored.filename, 'photo.url': `/api/files/employee-assets/${stored.id}` } });
    photos += 1;
  }
  const leaves = await Leave.find({ 'attachment.gridFsFileId': { $exists: false }, 'attachment.url': /^\/uploads\/leaves\// }).lean();
  for (const leave of leaves) {
    const relative = String(leave.attachment?.url || '').replace(/^\//, '');
    const source = path.join(BACKEND_ROOT, relative);
    if (!existsSync(source)) continue;
    const stored = await storeBuffer({ buffer: await readFile(source), filename: leave.attachment.originalName || path.basename(source), contentType: contentType(source, leave.attachment.mimeType), metadata: { kind: 'employee-leave-attachment', userId: leave.userId, migratedFrom: relative } });
    await Leave.updateOne({ _id: leave._id }, { $set: { 'attachment.gridFsFileId': stored.id, 'attachment.fileName': stored.filename, 'attachment.url': `/api/files/employee-assets/${stored.id}` } });
    leaveAttachments += 1;
  }
  return { photos, leaveAttachments };
}

try {
  await connectDatabase();
  const [logos, documents, employeeAssets] = await Promise.all([migrateLogos(), migrateDocuments(), migrateEmployeeAssets()]);
  console.log(JSON.stringify({ ok: true, migrated: { logos, documents, ...employeeAssets }, legacyFilesRetainedForRecovery: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  await disconnectDatabase().catch(() => {});
  process.exit(process.exitCode || 0);
}
