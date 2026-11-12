import mongoose from 'mongoose';
import dns from 'node:dns';

process.env.NODE_ENV = 'production';
let connection;
try {
  const { env } = await import('../src/config/env.js');
  const { validateProductionConfig } = await import('../src/config/production.js');
  const { topologySupportsTransactions } = await import('../src/services/database.js');
  validateProductionConfig(env);
  if (env.dnsServers.length) dns.setServers(env.dnsServers);
  // A separate connection avoids model initialization, migrations, seeds, and jobs.
  connection = await mongoose.createConnection(env.mongodbUri, {
    dbName: env.mongodbDbName,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 15000,
  });
  await connection.asPromise();
  const db = connection.db;
  const hello = await db.admin().command({ hello: 1 });
  if (!topologySupportsTransactions(hello)) throw new Error('MongoDB must be a replica set or Atlas deployment with transaction support');
  const collections = await db.listCollections({ name: 'appusers' }, { nameOnly: true }).toArray();
  if (!collections.length || await db.collection('appusers').countDocuments({}, { limit: 1 }) === 0) {
    throw new Error('The selected database has no application users. Verify the server and database name against your existing live database');
  }
  console.log(JSON.stringify({ ok: true, database: db.databaseName, existingUsers: true, transactions: 'supported', frontend: env.clientUrl, checks: 'read-only; provider credentials and HTTPS must also be tested after deployment' }, null, 2));
} catch (error) {
  // Driver errors can contain connection details; keep unexpected errors out of shared reports.
  const message = error.name === 'Error' ? error.message : `${error.name}: check MongoDB reachability, authentication, and network access`;
  console.error(`Deployment preflight failed: ${message}`);
  process.exitCode = 1;
} finally {
  await connection?.close();
}
