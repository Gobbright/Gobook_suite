import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { validateProductionConfig } from './config/production.js';
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from './services/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { apiRouter } from './routes/index.js';
import { metaApiRouter, metaPublicRouter } from './modules/meta/routes.js';
import { startScheduledJobs } from './jobs/scheduler.js';
import { ensureDefaultSubscriptionPlans } from './services/subscriptionPlans.js';
import { createCorsOriginValidator } from './services/corsPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (env.nodeEnv === 'production') validateProductionConfig(env);

const app = express();

// Trust the first reverse proxy, for example AWS ALB, nginx, or Hostinger.
app.set('trust proxy', env.trustProxyHops || false);
app.disable('etag');
app.disable('x-powered-by');
app.set('query parser', 'simple');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Publisher', 'GoBright-Anbu');
  next();
});

const configuredOrigins = new Set([env.clientUrl, ...env.allowedOrigins].filter(Boolean));
const corsOrigin = createCorsOriginValidator({ nodeEnv: env.nodeEnv, origins: configuredOrigins });

app.use(cors({ origin: corsOrigin, credentials: true }));
// Meta callbacks must run before request logging so codes and signed requests never enter logs.
app.use((req, res, next) => {
  if (req.path.startsWith('/auth/meta/') || req.path.startsWith('/meta/')) return metaPublicRouter(req, res, next);
  next();
});
app.use('/api/meta', metaApiRouter);
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => {
    if (req.path === '/api/subscriptions/razorpay/webhook' || req.path === '/api/razorpay/webhook') req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

function readiness(_req, res) {
  const database = getDatabaseStatus();
  const ready = database.readyState === 1 && database.transactionsReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    service: 'gobook-backend',
    environment: env.nodeEnv,
    database: database.status,
    transactions: database.transactionsReady ? 'ready' : 'not-ready',
  });
}

app.get('/health/live', (_req, res) => res.json({ status: 'alive', service: 'gobook-backend' }));
app.get('/health/ready', readiness);
app.get('/health', readiness);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = env.port;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`GoBook API running on port ${PORT} [${env.nodeEnv}]`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

async function connectDatabaseWithRetry() {
  try {
    await connectDatabase();
    await ensureDefaultSubscriptionPlans();
    startScheduledJobs();
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
    console.error('Keeping HTTP server alive and retrying MongoDB in 15 seconds.');
    setTimeout(connectDatabaseWithRetry, 15000);
  }
}

// Start HTTP first so the health check can reach /health while MongoDB is warming up.
connectDatabaseWithRetry();

let shuttingDown = false;
async function shutdown(signal = 'shutdown', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => {
    await disconnectDatabase().catch((error) => console.error('Database shutdown error:', error.message));
    clearTimeout(forceExit);
    process.exit(exitCode);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error.stack || error.message);
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.stack || reason?.message || reason);
  void shutdown('unhandledRejection', 1);
});
