import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { AppSession } from '../src/models/AppSession.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { SecurityRateLimit } from '../src/middleware/securityRateLimit.js';

// Read-only unless --apply is supplied. Never print credential values.
try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const filter = { loginPassword: { $exists: true } };
  const counts = {
    employeesWithLegacyPasswordField: await Employee.countDocuments(filter),
    loginsWithLegacyPasswordField: await EmployeeLogin.countDocuments(filter),
    loginsWithoutPasswordHash: await EmployeeLogin.countDocuments({ loginEnabled: true, $or: [{ passwordHash: { $exists: false } }, { passwordHash: '' }] }),
  };
  console.log(JSON.stringify({ database: mongoose.connection.name, apply: process.argv.includes('--apply'), ...counts }));
  if (process.argv.includes('--apply')) {
    if (counts.loginsWithoutPasswordHash) throw new Error('Reset passwords for enabled logins without password hashes before applying this migration.');
    await Promise.all([SecuritySession.createIndexes(), SecurityRateLimit.createIndexes()]);
    const employees = await Employee.updateMany(filter, { $unset: { loginPassword: 1 } });
    const logins = await EmployeeLogin.updateMany(filter, { $unset: { loginPassword: 1 } });
    const sessions = await AppSession.updateMany(
      { revokedAt: null, $or: [{ credentialHash: { $exists: false } }, { credentialHash: '' }] },
      { $set: { revokedAt: new Date() } },
    );
    console.log(JSON.stringify({ removedEmployeePasswordFields: employees.modifiedCount, removedLoginPasswordFields: logins.modifiedCount, revokedLegacySessions: sessions.modifiedCount }));
  }
} catch (error) {
  console.error(`Authentication migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
