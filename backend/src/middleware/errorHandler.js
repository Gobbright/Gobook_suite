import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = path.resolve(__dirname, '../../runtime');
const errorLogPath = path.join(runtimeDirectory, 'backend-errors.log');

function normalizedStatus(error) {
  const explicitStatus = Number(error.statusCode || error.status);
  if (Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus <= 599) return explicitStatus;
  if (error.code === 'CORS_ORIGIN_DENIED') return 403;
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') return 413;
  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError && 'body' in error) return 400;
  if (String(error.code || '').startsWith('LIMIT_')) return 400;
  if (error.name === 'ValidationError' || error.name === 'CastError') return 400;
  if (error.code === 11000) return 409;
  if (['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError'].includes(error.name)) return 503;
  return 500;
}

async function persistServerError(error, req, errorId) {
  const record = {
    timestamp: new Date().toISOString(),
    errorId,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id || '',
    name: error.name || 'Error',
    code: error.code || error.codeName || '',
    message: error.message || 'Unknown server error',
    stack: error.stack || '',
  };
  try {
    await mkdir(runtimeDirectory, { recursive: true });
    await appendFile(errorLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (loggingError) {
    console.error('[error-log]', loggingError.message);
  }
}

export function errorHandler(error, req, res, _next) {
  const statusCode = normalizedStatus(error);
  const errorId = randomUUID();

  if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: 'error', errorId, statusCode, method: req.method, path: req.originalUrl,
      name: error.name || 'Error', code: error.code || error.codeName || '', message: error.message || 'Unknown server error',
      ...(env.nodeEnv !== 'production' ? { stack: error.stack || '' } : {}),
    }));
    if (env.nodeEnv !== 'production') void persistServerError(error, req, errorId);
  }

  const canShowDetails = env.nodeEnv !== 'production';
  const duplicateField = error.code === 11000 ? Object.keys(error.keyPattern || {})[0] : '';
  const safeMessage = duplicateField
    ? `${duplicateField} already exists`
    : (error.message ?? 'Internal server error');

  res.status(statusCode).json({
    message: statusCode >= 500 && !canShowDetails
      ? (statusCode === 503 ? 'Service temporarily unavailable' : 'Internal server error')
      : safeMessage,
    ...(statusCode >= 500 ? { errorId } : {}),
  });
}
