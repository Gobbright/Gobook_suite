import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) throw new Error('MONGO_URI or MONGODB_URI is not configured.');

await mongoose.connect(uri, {
  dbName: process.env.MONGODB_DB_NAME || 'gobook',
  directConnection: true,
  serverSelectionTimeoutMS: 10000,
});

const admin = mongoose.connection.db.admin();
try {
  await admin.command({
    replSetInitiate: {
      _id: 'rs0',
      members: [{ _id: 0, host: 'localhost:27017' }],
    },
  });
  console.log('MongoDB replica set rs0 initialized.');
} catch (error) {
  if (error.codeName !== 'AlreadyInitialized' && error.code !== 23) throw error;
  console.log('MongoDB replica set was already initialized.');
}

let primary = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const hello = await admin.command({ hello: 1 });
    if (hello.setName === 'rs0' && hello.isWritablePrimary) {
      primary = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

await mongoose.disconnect();
if (!primary) throw new Error('Replica set initialized but did not become primary within 30 seconds.');
console.log('MongoDB is primary and ready for inventory transactions.');
