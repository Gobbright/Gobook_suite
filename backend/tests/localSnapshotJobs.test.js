import assert from 'node:assert/strict';
import test from 'node:test';
import cron from 'node-cron';
import { startScheduledJobs } from '../src/jobs/scheduler.js';

test('a local snapshot can disable every scheduled campaign and startup lifecycle job', (t) => {
  const previous = process.env.SCHEDULED_JOBS_ENABLED;
  process.env.SCHEDULED_JOBS_ENABLED = 'false';
  const recurring = t.mock.method(cron, 'schedule', () => { throw new Error('Unexpected recurring job'); });
  const startup = t.mock.method(globalThis, 'setTimeout', () => { throw new Error('Unexpected startup job'); });
  try {
    startScheduledJobs();
    assert.equal(recurring.mock.callCount(), 0);
    assert.equal(startup.mock.callCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.SCHEDULED_JOBS_ENABLED;
    else process.env.SCHEDULED_JOBS_ENABLED = previous;
  }
});
