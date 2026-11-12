export function validateProductionConfig(env, variables = process.env) {
  const failures = [];
  if (env.nodeEnv !== 'production') failures.push('NODE_ENV must be production');
  if (!env.clientUrl.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(env.clientUrl)) failures.push('FRONTEND_URL must be a public HTTPS origin');
  if (!env.allowedOrigins.includes(env.clientUrl)) failures.push('ALLOWED_ORIGINS must include the exact FRONTEND_URL origin');
  if (env.allowedOrigins.some((value) => !value.startsWith('https://'))) failures.push('ALLOWED_ORIGINS must use HTTPS in production');
  if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(env.googleClientId)) failures.push('GOOGLE_CLIENT_ID must contain a valid Google web client ID');
  if (variables.MONGO_URI && variables.MONGODB_URI && variables.MONGO_URI !== variables.MONGODB_URI) {
    failures.push('MONGO_URI and MONGODB_URI conflict; configure only MONGODB_URI or use identical values');
  }
  // A standard MongoDB URI may contain a comma-separated replica-set seed list.
  const authority = env.mongodbUri.replace(/^mongodb(?:\+srv)?:\/\//i, '').split('/')[0].split('@').at(-1);
  const loopbackDatabase = authority.split(',').some((host) => /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host));
  if (loopbackDatabase && variables.MONGODB_ALLOW_LOOPBACK !== 'true') failures.push('Set MONGODB_ALLOW_LOOPBACK=true only when MongoDB runs on this EC2 instance');
  const uriPath = env.mongodbUri.replace(/^mongodb(?:\+srv)?:\/\/[^/]+/i, '').split('?')[0].replace(/^\//, '');
  let uriDatabase = '';
  try { uriDatabase = decodeURIComponent(uriPath); } catch { failures.push('MongoDB database path contains invalid URL encoding'); }
  if (uriDatabase && uriDatabase !== env.mongodbDbName) failures.push('MONGODB_DB_NAME must match the database in the MongoDB URI');
  if (!env.requireExistingDatabase) failures.push('REQUIRE_EXISTING_DATABASE=true is required to prevent starting against an empty production database');
  if (env.paymentRequired && (!env.razorpay.keyId || !env.razorpay.keySecret || !env.razorpay.webhookSecret)) failures.push('Razorpay keys and webhook secret are required when PAYMENT_REQUIRED=true');
  if (!env.turnstile?.enabled || !env.turnstile.siteKey || !env.turnstile.secretKey || !env.turnstile.hostnames?.length) failures.push('TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY and allowed TURNSTILE_HOSTNAMES are required for human verification');
  if (/^[123]x0{10,}/.test(env.turnstile?.siteKey || '') || /^[123]x0{10,}/.test(env.turnstile?.secretKey || '')) failures.push('Turnstile test keys are forbidden in production');
  const metaEnabled = [env.meta.appId, env.meta.appSecret, env.meta.configId, env.meta.graphVersion, env.meta.encryptionKey].some(Boolean);
  if (metaEnabled && (!env.meta.publicOrigin?.startsWith('https://') || !/^\d+$/.test(env.meta.appId) || !env.meta.appSecret || !/^\d+$/.test(env.meta.configId) || !/^v\d+\.\d+$/.test(env.meta.graphVersion) || !/^[a-f\d]{64}$/i.test(env.meta.encryptionKey))) {
    failures.push('Meta requires numeric app/config IDs, an app secret, graph version, HTTPS public origin, and a 64-character hex encryption key');
  }
  // Email OTP registration and password recovery need SMTP even when checkout is disabled.
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass || !env.smtp.from) failures.push('SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM are required for email authentication');
  if (!Number.isInteger(env.smtp.port) || env.smtp.port < 1 || env.smtp.port > 65535) failures.push('SMTP_PORT must be a valid TCP port');
  if (failures.length) throw new Error(failures.join('; '));
  return { loopbackDatabase, metaEnabled };
}
