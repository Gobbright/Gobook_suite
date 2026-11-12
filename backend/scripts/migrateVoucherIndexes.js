import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';

await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, autoIndex: false, serverSelectionTimeoutMS: 5000 });
try {
  const collection = AccountingVoucher.collection;
  const indexes = await collection.indexes().catch((error) => { if (error.code === 26) return []; throw error; });
  const sourceIndex = indexes.find((index) => index.name === 'userId_1_sourceType_1_sourceId_1');
  const needsReplacement = Boolean(sourceIndex && !sourceIndex.partialFilterExpression);
  console.log(JSON.stringify({ database: mongoose.connection.name, replaceLegacySourceIndex: needsReplacement, apply: process.argv.includes('--apply') }));
  if (process.argv.includes('--apply')) {
    if (needsReplacement) await collection.dropIndex(sourceIndex.name);
    await AccountingVoucher.createIndexes();
    console.log('Voucher indexes are ready. No voucher documents were changed.');
  } else console.log('Run with --apply while voucher writes are paused to update the indexes.');
} finally { await mongoose.disconnect(); }
