import multer from 'multer';
import { hasExpectedFileSignature, storeBuffer } from '../../../services/gridfsStorage.js';
import { httpError } from '../../../utils/httpError.js';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    callback(allowed ? null : httpError(400, 'Choose a JPG, PNG, WebP, or GIF image'), allowed);
  },
});

export const uploadProductImageFile = imageUpload.single('image');

export async function uploadProductImage(req, res, next) {
  try {
    const file = req.file;
    if (!file) throw httpError(400, 'Choose an image to upload');
    if (!hasExpectedFileSignature(file.buffer, file.mimetype)) throw httpError(400, 'The file is not a valid JPG, PNG, WebP, or GIF image');
    const stored = await storeBuffer({ buffer: file.buffer, filename: file.originalname, contentType: file.mimetype, metadata: { kind: 'product-image', userId: req.user.id, businessId: req.user.businessId } });
    res.status(201).json({ url: `/api/files/product-images/${stored.id}` });
  } catch (error) { next(error); }
}
