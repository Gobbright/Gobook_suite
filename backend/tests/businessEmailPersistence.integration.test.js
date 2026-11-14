import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { getEmailSettings, saveEmailSettings } from '../src/modules/retail/more-modules/emailController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const database = `gobook_email_setup_test_${process.pid}_${Date.now()}`;

test('verified mailbox details persist in MongoDB and only successful changes replace them', { skip: !uri }, async (t) => {
  const owner = { id: new mongoose.Types.ObjectId(), accountType: 'owner', email: 'owner@example.test' };
  const otherId = new mongoose.Types.ObjectId();
  let rejectVerification = false;
  let verificationCount = 0;
  t.mock.method(nodemailer, 'createTransport', () => ({ verify: async () => { verificationCount++; if (rejectVerification) throw new Error('Fixture provider rejected these credentials'); return true; } }));
  async function invoke(handler, body = {}) {
    let data, error;
    await handler({ user: owner, body }, { json(value) { data = value; } }, failure => { error = failure; });
    return { data, error };
  }
  try {
    await mongoose.connect(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
    await BusinessSettings.init();
    await BusinessSettings.create({ userId: owner.id, businessName: 'Sample business', businessEmail: 'contact@example.test' });
    await BusinessSettings.create({ userId: otherId, businessName: 'Other business', emailSmtpHost: 'smtp.gmail.com', emailSmtpUser: 'other@gmail.com', emailSmtpPass: 'ponmlkjihgfedcba', emailSmtpVerifiedAt: new Date('2026-11-01') });
    const otherBefore = await BusinessSettings.findOne({ userId: otherId }).select('+emailSmtpPass').lean();

    const first = await invoke(saveEmailSettings, { email: ' FIRST@GMAIL.COM ', appPassword: 'abcd efgh ijkl mnop' });
    assert.ifError(first.error);
    assert.equal(first.data.configured, true);
    assert.equal(verificationCount, 1);
    const stored = await BusinessSettings.findOne({ userId: owner.id }).select('+emailSmtpPass').lean();
    assert.equal(stored.emailSmtpUser, 'first@gmail.com');
    assert.equal(stored.emailSmtpPass, 'abcdefghijklmnop');
    assert.equal(stored.emailSmtpHost, 'smtp.gmail.com');
    assert.equal(stored.emailSmtpPort, 587);
    assert.ok(stored.emailSmtpVerifiedAt instanceof Date);
    assert.equal(stored.businessEmail, 'contact@example.test');
    assert.equal((await BusinessSettings.findOne({ userId: owner.id }).lean()).emailSmtpPass, undefined);
    const reloaded = await invoke(getEmailSettings);
    assert.equal(reloaded.data.email, 'first@gmail.com');
    assert.equal(reloaded.data.configured, true);
    assert.equal(reloaded.data.canManage, true);
    assert.equal(reloaded.data.verifiedAt.getTime(), stored.emailSmtpVerifiedAt.getTime());
    assert.equal(JSON.stringify(reloaded.data).includes('abcdefghijklmnop'), false);

    rejectVerification = true;
    const failed = await invoke(saveEmailSettings, { email: 'replacement@gmail.com', appPassword: 'ponm lkji hgfe dcba' });
    assert.equal(failed.error.statusCode, 400);
    assert.deepEqual(await BusinessSettings.findOne({ userId: owner.id }).select('+emailSmtpPass').lean(), stored);

    rejectVerification = false;
    const changed = await invoke(saveEmailSettings, { email: 'replacement@gmail.com', appPassword: 'ponm lkji hgfe dcba', userId: String(otherId) });
    assert.ifError(changed.error);
    assert.equal(changed.data.configured, true);
    const replacement = await BusinessSettings.findOne({ userId: owner.id }).select('+emailSmtpPass').lean();
    assert.equal(replacement.emailSmtpUser, 'replacement@gmail.com');
    assert.equal(replacement.emailSmtpPass, 'ponmlkjihgfedcba');
    assert.equal(replacement.businessName, stored.businessName);
    assert.equal(replacement.businessEmail, stored.businessEmail);
    assert.equal(await BusinessSettings.countDocuments({ userId: owner.id }), 1);
    assert.equal(verificationCount, 3);
    assert.equal((await invoke(getEmailSettings)).data.email, 'replacement@gmail.com');
    for (const reply of [first.data, reloaded.data, changed.data]) {
      assert.equal(reply.appPassword, undefined);
      assert.equal(reply.emailSmtpPass, undefined);
    }
    assert.deepEqual(await BusinessSettings.findOne({ userId: otherId }).select('+emailSmtpPass').lean(), otherBefore);
  } finally {
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      assert.match(database, /^gobook_email_setup_test_\d+_\d+$/);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
});
