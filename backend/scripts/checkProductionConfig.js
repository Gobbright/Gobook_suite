process.env.NODE_ENV = 'production';

try {
  const { env } = await import('../src/config/env.js');
  const { validateProductionConfig } = await import('../src/config/production.js');
  const { loopbackDatabase } = validateProductionConfig(env);
  const metaValues = [env.meta.appId, env.meta.appSecret, env.meta.configId, env.meta.graphVersion, env.meta.encryptionKey];
  console.log(JSON.stringify({
    ok: true,
    environment: env.nodeEnv,
    port: env.port,
    trustProxyHops: env.trustProxyHops,
    frontendOrigin: env.clientUrl,
    allowedOrigins: env.allowedOrigins,
    googleSignInConfigured: Boolean(env.googleClientId),
    database: env.mongodbUri.startsWith('mongodb+srv://') ? 'MongoDB SRV configured' : 'MongoDB configured',
    databaseScope: loopbackDatabase ? 'same host/task loopback' : 'remote',
    requireExistingDatabase: env.requireExistingDatabase,
    paymentEnabled: env.paymentRequired,
    onlineStoreEnabled: env.onlineStoreEnabled,
    metaConfigured: metaValues.every(Boolean) && Boolean(env.meta.publicOrigin),
    smtpConfigured: Boolean(env.smtp.host && env.smtp.user && env.smtp.pass),
  }, null, 2));
} catch (error) {
  console.error(`Production configuration invalid: ${error.message}`);
  process.exit(1);
}
