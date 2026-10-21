import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SessionManager } from '../../packages/node-bridge/dist/index.js';

for (const key of [
  'startupTimeoutMs',
  'shutdownTimeoutMs',
  'terminationTimeoutMs',
])
  test(`host timer admission: ${key} refuses delays that Node would clamp`, async () => {
    for (const value of [2147483648, Number.MAX_SAFE_INTEGER]) {
      let manager;
      try {
        assert.throws(
          () => {
            manager = new SessionManager({ [key]: value });
          },
          { message: 'Invalid session manager options' },
        );
      } finally {
        await manager?.shutdown();
      }
    }
  });

test('host timer admission keeps the exact supported maximum for all three phases', async () => {
  const manager = new SessionManager({
    startupTimeoutMs: 2147483647,
    shutdownTimeoutMs: 2147483647,
    terminationTimeoutMs: 2147483647,
  });
  try {
    assert.equal(manager.statistics().active, 0);
  } finally {
    await manager.shutdown();
  }
});

test('actual Node timer control: a delay beyond the 31-bit maximum fires with an overflow warning', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', "setTimeout(() => process.stdout.write('timer-fired'), 2147483648)"],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 8192,
    },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'timer-fired');
  assert.match(result.stderr, /TimeoutOverflowWarning/);
});
