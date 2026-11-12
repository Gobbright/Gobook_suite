import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('backend container default, exposed port and readiness probe agree', async () => {
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const defaultPort = dockerfile.match(/\bPORT=(\d+)/)?.[1];
  const exposedPort = dockerfile.match(/^EXPOSE\s+(\d+)/m)?.[1];
  const probePort = dockerfile.match(/process\.env\.PORT\|\|(\d+)/)?.[1];
  assert.ok(defaultPort);
  assert.equal(defaultPort, exposedPort);
  assert.equal(defaultPort, probePort);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /\/health\/ready/);
});

test('release packaging references existing deployment guidance and includes the runtime image definition', async () => {
  await access(new URL('../../AWS_DEPLOYMENT.md', import.meta.url));
  const script = await readFile(new URL('../../scripts/package-aws.ps1', import.meta.url), 'utf8');
  assert.match(script, /AWS_DEPLOYMENT\.md/);
  assert.match(script, /'Dockerfile', '\.dockerignore'/);
  assert.doesNotMatch(script, /Copy-Item[^\n]*(?:EC2_DEPLOYMENT\.md|'deploy')/);
});
