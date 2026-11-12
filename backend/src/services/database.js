import dns from 'dns';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { auditPlugin } from './auditPlugin.js';

// Registered before any model is compiled (this module is imported ahead of
// routes/index.js in server.js, which is what pulls in every controller and
// therefore every model) so it attaches to all of them automatically.
mongoose.plugin(auditPlugin);

const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersRegistered = false;
let lastConnectionError = '';
let connectionPromise = null;
let reconnectTimer = null;
let maintenanceComplete = false;
let transactionsReady = false;
const LEGACY_RETAIL_SUBCATEGORY = 'electronics-technology';

const missingRetailSubcategory = {
  $or: [
    { retailSubcategory: { $exists: false } },
    { retailSubcategory: '' },
    { retailSubcategory: null },
  ],
};

async function backfillLegacyGstOwners() {
  const db = mongoose.connection.db;
  const settings = await db.collection('businesssettings').find(
    { gstin: { $type: 'string', $ne: '' }, userId: { $exists: true } },
    { projection: { gstin: 1, userId: 1 } },
  ).toArray();

  const usersByGstin = new Map();
  for (const setting of settings) {
    const gstin = String(setting.gstin || '').trim().toUpperCase();
    if (!gstin) continue;
    const owners = usersByGstin.get(gstin) || new Set();
    owners.add(String(setting.userId));
    usersByGstin.set(gstin, owners);
  }

  const collections = ['gstr1', 'gstr3b', 'gstreconciliations'];
  for (const collectionName of collections) {
    const collection = db.collection(collectionName);
    const records = await collection.find(
      { userId: { $exists: false }, gstin: { $type: 'string', $ne: '' } },
      { projection: { gstin: 1 } },
    ).toArray().catch(() => []);

    for (const record of records) {
      const gstin = String(record.gstin || '').trim().toUpperCase();
      const owners = usersByGstin.get(gstin);
      if (!owners || owners.size !== 1) continue;
      const [userId] = owners;
      await collection.updateOne({ _id: record._id, userId: { $exists: false } }, { $set: { userId: new mongoose.Types.ObjectId(userId) } });
    }
  }
}

async function dropLegacyIndexes() {
  const db = mongoose.connection.db;
  const drops = [
    { col: 'products',        index: 'code_1' },
    { col: 'employees',       index: 'employeeId_1' },
    { col: 'invoices',        index: 'number_1' },
    { col: 'stockins',        index: 'stockInNo_1' },
    { col: 'stockouts',       index: 'stockOutNo_1' },
    { col: 'bankbookentries', index: 'vchNo_1' },
    { col: 'cashbookentries', index: 'vchNo_1' },
    { col: 'journalentries',  index: 'entryNo_1' },
    { col: 'ledgeraccounts',  index: 'name_1' },
    { col: 'salesrecords',    index: 'number_1' },
    { col: 'leaves',          index: 'leaveId_1' },
    { col: 'branches',        index: 'code_1' },
    { col: 'attendances',     index: 'employeeId_1_date_1' },
    { col: 'payrolls',        index: 'employeeId_1_month_1' },
    { col: 'gstr1',           index: 'gstin_1_period_1_filingType_1' },
    { col: 'gstr3b',          index: 'gstin_1_period_1' },
    { col: 'gstreconciliations', index: 'gstin_1_period_1_type_1' },
  ];
  for (const { col, index } of drops) {
    await db.collection(col).dropIndex(index).catch(() => {});
  }
}

async function backfillLegacyRetailSubcategory() {
  const db = mongoose.connection.db;
  const users = db.collection('appusers');
  const businesses = db.collection('businesses');
  const settings = db.collection('businesssettings');

  const retailUsers = await users.find(
    { category: 'retail' },
    { projection: { _id: 1, businessId: 1 } },
  ).toArray().catch(() => []);

  const retailUserIds = retailUsers.map((user) => user._id);
  const retailBusinessIds = [...new Set(
    retailUsers.map((user) => String(user.businessId || '')).filter(Boolean),
  )]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  await Promise.all([
    users.updateMany(
      { category: 'retail', ...missingRetailSubcategory },
      { $set: { retailSubcategory: LEGACY_RETAIL_SUBCATEGORY } },
    ),
    retailBusinessIds.length
      ? businesses.updateMany(
        { _id: { $in: retailBusinessIds }, category: 'retail', ...missingRetailSubcategory },
        { $set: { retailSubcategory: LEGACY_RETAIL_SUBCATEGORY } },
      )
      : Promise.resolve(),
    retailUserIds.length
      ? settings.updateMany(
        { userId: { $in: retailUserIds }, ...missingRetailSubcategory },
        { $set: { retailSubcategory: LEGACY_RETAIL_SUBCATEGORY } },
      )
      : Promise.resolve(),
  ]);
}

function scheduleReconnect() {
  if (reconnectTimer || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectDatabase();
      console.log('MongoDB reconnected');
    } catch (error) {
      lastConnectionError = error.message;
      console.error('MongoDB reconnect failed:', error.message);
      scheduleReconnect();
    }
  }, 3000);
}

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    lastConnectionError = '';
    console.log(`MongoDB connected - db: ${env.mongodbDbName}`);
  });

  mongoose.connection.on('error', (error) => {
    lastConnectionError = error.message;
    console.error('MongoDB connection error:', error.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
    scheduleReconnect();
  });
}

export function getDatabaseStatus() {
  return {
    status: READY_STATES[mongoose.connection.readyState] ?? 'unknown',
    readyState: mongoose.connection.readyState,
    dbName: env.mongodbDbName,
    transactionsReady,
    lastError: lastConnectionError || undefined,
  };
}

export function topologySupportsTransactions(hello) {
  const transactionalTopology = Boolean(hello?.setName) || hello?.msg === 'isdbgrid';
  return transactionalTopology && hello?.logicalSessionTimeoutMinutes != null;
}

async function verifyTransactionSupport() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topologySupportsTransactions(hello)) {
    const error = new Error('MongoDB transactions are unavailable. Configure this database as a replica set or use MongoDB Atlas.');
    error.code = 'MONGODB_TRANSACTIONS_REQUIRED';
    throw error;
  }
}

async function verifyExistingProductionDatabase() {
  if (!env.requireExistingDatabase) return;
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map((collection) => collection.name));
  if (!names.has('appusers')) {
    const error = new Error(`Expected existing production database "${env.mongodbDbName}" was not found or has no appusers collection.`);
    error.code = 'PRODUCTION_DATABASE_EMPTY';
    throw error;
  }
  const users = await mongoose.connection.db.collection('appusers').estimatedDocumentCount();
  if (users < 1) {
    const error = new Error(`Production database "${env.mongodbDbName}" contains no application users.`);
    error.code = 'PRODUCTION_DATABASE_EMPTY';
    throw error;
  }
}

export async function connectDatabase() {
  registerConnectionListeners();
  if (mongoose.connection.readyState === 1 && transactionsReady) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    if (env.dnsServers && env.dnsServers.length > 0) {
      try {
        dns.setServers(env.dnsServers);
      } catch (err) {
        console.warn('Could not set custom DNS servers:', err.message);
      }
    }

    await mongoose.connect(env.mongodbUri, {
      dbName: env.mongodbDbName,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 20000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 5000,
      maxPoolSize: 20,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority',
    });
    transactionsReady = false;
    await verifyTransactionSupport();
    await verifyExistingProductionDatabase();

    if (!maintenanceComplete) {
      await backfillLegacyGstOwners();
      await backfillLegacyRetailSubcategory();
      await dropLegacyIndexes();
      maintenanceComplete = true;
    }
    transactionsReady = true;
    return mongoose.connection;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

export async function disconnectDatabase() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  transactionsReady = false;
  await mongoose.disconnect();
}
