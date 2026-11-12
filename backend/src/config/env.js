import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Always resolve .env relative to this file (backend/src/config -> backend/.env)
// so it loads correctly regardless of the process working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const adminAccounts = [
  { id: process.env.ADMIN_LOGIN_ID ?? 'admin', password: process.env.ADMIN_LOGIN_PASSWORD ?? 'admin@123' },
  { id: process.env.ADMIN_LOGIN_ID_2 ?? '', password: process.env.ADMIN_LOGIN_PASSWORD_2 ?? '' },
]
  .map((account) => ({ id: String(account.id || '').trim(), password: String(account.password || '') }))
  .filter((account) => account.id && account.password);
function requireAny(...names) {
  const val = names.map((name) => process.env[name]).find(Boolean);
  if (!val) throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
  return val;
}

function list(name) {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function origin(name, value, { required = false } = {}) {
  if (!value) {
    if (required) throw new Error(`Missing required environment variable: ${name}`);
    return '';
  }
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be a valid absolute URL origin`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== String(value).replace(/\/+$/, '')) {
    throw new Error(`${name} must contain only an http(s) origin without a path`);
  }
  return parsed.origin;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV must be development, test, or production');
const clientUrl = origin('FRONTEND_URL or CLIENT_URL', requireAny('FRONTEND_URL', 'CLIENT_URL'), { required: true });
const allowedOrigins = list('ALLOWED_ORIGINS').map((value) => origin('ALLOWED_ORIGINS', value, { required: true }));
const mongodbUri = requireAny('MONGO_URI', 'MONGODB_URI');
if (!/^mongodb(\+srv)?:\/\//i.test(mongodbUri)) throw new Error('MONGODB_URI must be a mongodb:// or mongodb+srv:// URL');
const jwtSecret = requireAny('JWT_SECRET');
if (nodeEnv === 'production' && (jwtSecret.length < 32 || /^(change-me|secret|admin|replace)/i.test(jwtSecret))) {
  throw new Error('JWT_SECRET must be a strong random value of at least 32 characters in production');
}
if (nodeEnv === 'production' && new URL(clientUrl).protocol !== 'https:') throw new Error('FRONTEND_URL must use HTTPS in production');
if (nodeEnv === 'production' && adminAccounts.some((account) => /^(admin@123|change-me|replace)/i.test(account.password) || account.password.length < 8)) {
  throw new Error('Set a unique ADMIN_LOGIN_PASSWORD of at least 8 characters in production');
}

export const env = {
  nodeEnv,
  port:          integer('PORT', 5000, { min: 1, max: 65535 }),
  trustProxyHops: integer('TRUST_PROXY_HOPS', 1, { min: 0, max: 10 }),

  // Prefer deployment names, but keep existing local names as fallback.
  clientUrl,
  allowedOrigins,
  mongodbUri,
  mongodbDbName: process.env.MONGODB_DB_NAME ?? 'gobook',
  requireExistingDatabase: process.env.REQUIRE_EXISTING_DATABASE === 'true',
  dnsServers:    list('DNS_SERVERS'),
  jwtSecret,
  jwtExpiresIn:  process.env.JWT_EXPIRES_IN ?? '7d',
  adminAccounts,
  adminLoginId: adminAccounts[0]?.id ?? 'admin',
  adminLoginPassword: adminAccounts[0]?.password ?? '',
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? '8h',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  turnstile: {
    enabled: nodeEnv === 'production' || process.env.TURNSTILE_ENABLED === 'true' || Boolean(process.env.TURNSTILE_SECRET_KEY),
    siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
    secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
    hostnames: list('TURNSTILE_HOSTNAMES').length ? list('TURNSTILE_HOSTNAMES') : [...new Set([clientUrl, ...allowedOrigins].map((value) => new URL(value).hostname))],
  },

  meta: {
    appId: process.env.META_APP_ID ?? '',
    appSecret: process.env.META_APP_SECRET ?? '',
    configId: process.env.META_LOGIN_CONFIG_ID ?? '',
    graphVersion: process.env.META_GRAPH_API_VERSION ?? '',
    encryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY ?? '',
    publicOrigin: origin('META_PUBLIC_ORIGIN', process.env.META_PUBLIC_ORIGIN ?? ''),
  },

  // When false, registration skips Razorpay checkout and activates the account directly.
  paymentRequired: process.env.PAYMENT_REQUIRED !== 'false',
  subscriptionTestMode: nodeEnv !== 'production' && process.env.SUBSCRIPTION_TEST_MODE === 'true',
  onlineStoreEnabled: process.env.ONLINE_STORE_ENABLED === 'true',

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
    verificationAmountPaise: Number(process.env.RAZORPAY_VERIFICATION_AMOUNT_PAISE ?? 100),

  groqApiKey:    process.env.GROQ_API_KEY ?? '',
  groqModel:     process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  groqVisionModel: process.env.GROQ_VISION_MODEL ?? 'qwen/qwen3.8-27b',

  smtp: {
    host:   process.env.SMTP_HOST ?? '',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user:   process.env.SMTP_USER ?? '',
    pass:   process.env.SMTP_PASS ?? '',
    from:   process.env.SMTP_FROM ?? '',
  },
};

