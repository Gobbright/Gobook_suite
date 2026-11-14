import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

const backendPath = fileURLToPath(new URL('../', import.meta.url));

function portIsOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 27018 });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function ensureLocalMongo() {
  // Only manage this project's existing local snapshot. Never start or change
  // a database for production, Atlas, another port, or another replica set.
  if (env.nodeEnv !== 'development' || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):27018\//i.test(env.mongodbUri)) return;
  if (new URL(env.mongodbUri).searchParams.get('replicaSet') !== 'rs0') return;
  if (await portIsOpen()) return;

  const dataPath = path.join(backendPath, 'runtime', 'local-mongo');
  if (!existsSync(path.join(dataPath, 'WiredTiger'))) {
    throw new Error('Existing local MongoDB data was not found in runtime/local-mongo. Restore your database or configure MONGODB_URI; an empty database will not be created.');
  }
  const binary = process.env.MONGOD_PATH || (process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'MongoDB', 'Server', '8.3', 'bin', 'mongod.exe')
    : 'mongod');
  const child = spawn(binary, [
    '--bind_ip', '127.0.0.1', '--port', '27018', '--replSet', 'rs0',
    '--dbpath', dataPath, '--logpath', path.join(dataPath, 'mongod.log'), '--logappend',
  ], { cwd: backendPath, detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', () => reject(new Error('Cannot start mongod. Install MongoDB 8.3 or set MONGOD_PATH to its executable.')));
  });
  child.unref();

  for (let attempt = 0; attempt < 20; attempt++) {
    if (child.exitCode !== null) throw new Error('Local MongoDB stopped during startup. Check runtime/local-mongo/mongod.log.');
    const client = new mongoose.mongo.MongoClient(env.mongodbUri, { directConnection: true, serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000 });
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      if (hello.setName === 'rs0' && hello.isWritablePrimary) {
        console.log('Local MongoDB ready on port 27018 (replica set rs0).');
        return;
      }
    } catch { /* Wait for database recovery and replica-set election. */ }
    finally { await client.close().catch(() => {}); }
    await delay(500);
  }
  throw new Error('Local MongoDB did not become primary. Check runtime/local-mongo/mongod.log.');
}

try {
  await ensureLocalMongo();
} catch (error) {
  console.error(`Local MongoDB startup failed: ${error.message}`);
  process.exitCode = 1;
}
