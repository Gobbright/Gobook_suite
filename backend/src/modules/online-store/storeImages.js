import multer from 'multer';
import { env } from '../../config/env.js';
import { hasExpectedFileSignature, storeBuffer } from '../../services/gridfsStorage.js';
import { httpError } from '../../utils/httpError.js';

export const storeImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    callback(allowed ? null : httpError(400, 'Choose a JPG, PNG, WebP, or GIF image'), allowed);
  },
});

export function validateStoreImage(file) {
  if (!file) throw httpError(400, 'Choose an image to upload');
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype) || !hasExpectedFileSignature(file.buffer, file.mimetype)) throw httpError(400, 'The file is not a valid JPG, PNG, WebP, or GIF image');
  if (file.buffer.length > 8 * 1024 * 1024) throw httpError(400, 'Choose an image smaller than 8 MB');
}

export async function uploadStoreImage(req, res, next) {
  try {
    if (!env.onlineStoreEnabled) throw httpError(403, 'Online Store Lite is disabled');
    validateStoreImage(req.file);
    const file = await storeBuffer({ buffer: req.file.buffer, filename: req.file.originalname, contentType: req.file.mimetype, metadata: { kind: 'store-image', userId: req.user.id, businessId: req.user.businessId } });
    res.status(201).json({ url: `/api/files/store-images/${file.id}` });
  } catch (error) { next(error); }
}
