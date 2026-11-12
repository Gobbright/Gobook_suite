// Set this before importing env.js so a development .env cannot weaken production startup.
process.env.NODE_ENV = 'production';

try {
  const { env } = await import('../src/config/env.js');
  const { validateProductionConfig } = await import('../src/config/production.js');
  validateProductionConfig(env);
  await import('../src/server.js');
} catch (error) {
  console.error(`Production startup refused: ${error.message}`);
  process.exitCode = 1;
}
