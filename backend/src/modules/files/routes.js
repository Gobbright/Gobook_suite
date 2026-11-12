import { Router } from 'express';
import { findStoredFile, pipeStoredFile } from '../../services/gridfsStorage.js';
import { httpError } from '../../utils/httpError.js';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../../middleware/auth.js';
import { requireEmployeePortalAuth } from '../../middleware/employeePortalAuth.js';
import { Employee } from '../../models/Employee.js';
import { Leave } from '../../models/Leave.js';

export const publicFilesRouter = Router();

publicFilesRouter.get('/store-images/:id', async (req, res, next) => {
  try {
    const file = await findStoredFile(req.params.id, { 'metadata.kind': 'store-image' });
    if (!file) throw httpError(404, 'Store image not found');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    pipeStoredFile(file._id, res);
  } catch (error) { next(error); }
});

publicFilesRouter.get('/product-images/:id', async (req, res, next) => {
  try {
    const file = await findStoredFile(req.params.id, { 'metadata.kind': 'product-image' });
    if (!file) throw httpError(404, 'Product image not found');
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.length || 0));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    pipeStoredFile(file._id, res);
  } catch (error) { next(error); }
});

publicFilesRouter.get('/logos/:id', async (req, res, next) => {
  try {
    const file = await findStoredFile(req.params.id, { 'metadata.kind': 'business-logo' });
    if (!file) return next(httpError(404, 'Logo not found'));
    res.setHeader('Content-Type', file.contentType || 'image/png');
    res.setHeader('Content-Length', String(file.length || 0));
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    pipeStoredFile(file._id, res);
  } catch (error) {
    next(error);
  }
});

publicFilesRouter.get('/payment-qrs/:id', async (req, res, next) => {
  try {
    const file = await findStoredFile(req.params.id, { 'metadata.kind': 'payment-qr' });
    if (!file) return next(httpError(404, 'Payment QR image not found'));
    res.setHeader('Content-Type', file.contentType || 'image/png');
    res.setHeader('Content-Length', String(file.length || 0));
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    pipeStoredFile(file._id, res);
  } catch (error) {
    next(error);
  }
});

function employeeAssetAuth(req, res, next) {
  const token = String(req.headers.authorization || '').split(' ')[1];
  return jwt.decode(token || '')?.scope === 'employee-portal' ? requireEmployeePortalAuth(req, res, next) : requireAuth(req, res, next);
}
publicFilesRouter.get('/employee-assets/:id', employeeAssetAuth, async (req, res, next) => {
  try {
    const file = await findStoredFile(req.params.id, { 'metadata.kind': { $in: ['employee-photo', 'employee-leave-attachment'] } });
    if (!file) return next(httpError(404, 'Employee file not found'));
    if (String(file.metadata?.userId) !== String(req.user?.id || req.employeeUser?.ownerUserId)) throw httpError(404, 'Employee file not found');
    if (req.user) {
      if (String(file.metadata?.userId) !== String(req.user.id) || !req.user.isSuperAdmin) throw httpError(404, 'Employee file not found');
    } else {
      const filter = { userId: req.employeeUser.ownerUserId, employeeId: req.employeeUser.employeeId, 'photo.gridFsFileId': file._id };
      const owned = file.metadata?.kind === 'employee-photo' ? await Employee.exists(filter) : await Leave.exists({ userId: req.employeeUser.ownerUserId, empId: req.employeeUser.employeeId, 'attachment.gridFsFileId': file._id });
      if (!owned) throw httpError(404, 'Employee file not found');
    }
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(file.length || 0));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pipeStoredFile(file._id, res);
  } catch (error) {
    next(error);
  }
});
