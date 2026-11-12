import mongoose from 'mongoose';

import { env } from '../src/config/env.js';

try {
  await mongoose.connect(env.mongodbUri, {
    dbName: env.mongodbDbName,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
    readPreference: 'primaryPreferred',
  });
  const database = mongoose.connection.db;
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const counts = [];
  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (name.startsWith('system.')) continue;
    counts.push({ collection: name, documents: await database.collection(name).countDocuments({}) });
  }
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    database: database.databaseName,
    collections: counts,
    totalDocuments: counts.reduce((total, item) => total + item.documents, 0),
  }, null, 2));
} catch (error) {
  console.error(`Database baseline failed: ${error.codeName || error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
