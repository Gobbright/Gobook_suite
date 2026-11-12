// Restore the downloaded live snapshot into a new LOCAL database only.
// IDs, credential hashes, roles and subscriptions are retained exactly.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MongoClient, BSON } from 'mongodb';

const directory = fileURLToPath(new URL('../runtime/live-account-backups/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(directory + 'manifest.json', 'utf8'));
assert.equal(manifest.source, 'https://api.gobooksuite.com/api');
const targetName = 'gobook_live_local';
const temporary = new Set(['appsessions', 'securitysessions', 'securityratelimits', 'pendingemaillogins', 'pendingsignups', 'emailotprequestlimits']);
const collections = new Map();
for (const item of manifest.backups) {
  assert.match(item.filename, /^[a-f0-9]{24}\.json$/i);
  const backup = BSON.EJSON.parse(await fs.readFile(directory + item.filename, 'utf8'), { relaxed: false });
  assert.equal(backup.format, 'gobook-user-mongodb-backup');
  for (const { name, documents } of backup.collections) {
    assert.ok(name && !name.startsWith('system.') && !name.includes('$'));
    if (temporary.has(name)) continue;
    const records = collections.get(name) || new Map();
    for (const doc of documents) {
      const id = String(doc._id);
      if (records.has(id)) assert.ok(isDeepStrictEqual(doc, records.get(id)), `Inconsistent snapshots in ${name}`);
      records.set(id, doc);
    }
    collections.set(name, records);
  }
}
assert.equal(collections.get('appusers')?.size, manifest.accountCount);
const client = new MongoClient('mongodb://127.0.0.1:27018/?replicaSet=rs0', { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const hello = await client.db('admin').command({ hello: 1 });
  assert.equal(hello.isWritablePrimary, true);
  const db = client.db(targetName);
  const verifyExisting = process.argv.includes('--verify-existing');
  if (!verifyExisting) assert.equal((await db.listCollections().toArray()).length, 0, 'Refusing to overwrite an existing local snapshot');
  const apply = process.argv.includes('--apply');
  const counts = {};
  for (const [name, records] of collections) {
    counts[name] = records.size;
    if (verifyExisting) {
      assert.equal(await db.collection(name).countDocuments(), records.size, `Count mismatch in ${name}`);
      continue;
    }
    if (!apply || !records.size) continue;
    const documents = [...records.values()];
    for (let offset = 0; offset < documents.length; offset += 500) await db.collection(name).insertMany(documents.slice(offset, offset + 500));
    assert.equal(await db.collection(name).countDocuments(), records.size);
  }
  if (apply || verifyExisting) {
    for (const user of collections.get('appusers').values()) {
      const actual = await db.collection('appusers').findOne({ _id: user._id }, { promoteValues: false });
      assert.ok(BSON.serialize(actual).equals(BSON.serialize(user)), 'Restored account differs from live snapshot');
    }
  }
  const report = { target: targetName, source: manifest.source, snapshotAt: manifest.downloadedAt, applied: apply || verifyExisting, accounts: manifest.accountCount, counts };
  if (apply || verifyExisting) await fs.writeFile(directory + 'restore-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Local restore failed; check local MongoDB and backup files.');
  process.exitCode = 1;
} finally {
  await client.close();
}
