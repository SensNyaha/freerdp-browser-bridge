import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runRuntimeRecoveryHelper } from '../../packages/node-bridge/dist/runtime-recovery.js';

test(
  'synthetic recovery process owner: unconfirmed close retains child capacity until actual close',
  { timeout: 10000 },
  async () => {
    const originalSpawn = childProcess.spawn;
    const children = [];
    // Model an OS child whose kill/exit does not confirm joined stdio closure.
    // No native process is created; actual kill/join cases have separate tests.
    childProcess.spawn = () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => false;
      children.push(child);
      return child;
    };
    syncBuiltinESMExports();
    const invoke = (milliseconds = 20) =>
      runRuntimeRecoveryHelper(
        'synthetic-helper',
        'synthetic-root',
        'session',
        {
          due: performance.now() + milliseconds,
        },
      );
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => invoke()),
      );
      assert.equal(children.length, 4);
      for (const result of results) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.code, 'RUNTIME_RECOVERY_CLOSE_FAILED');
      }
      for (let attempt = 0; attempt < 8; ++attempt)
        await assert.rejects(invoke(), {
          code: 'RUNTIME_RECOVERY_UNAVAILABLE',
        });
      assert.equal(children.length, 4);
      children[0].emit('exit', 1, null);
      await assert.rejects(invoke(), { code: 'RUNTIME_RECOVERY_UNAVAILABLE' });
      assert.equal(children.length, 4);

      children[0].stdout.end();
      children[0].stderr.end();
      children[0].emit('close', null, 'SIGKILL');
      const replacement = invoke(5000);
      assert.equal(children.length, 5);
      children[4].stdout.end('{"v":1,"status":"removed"}\n');
      children[4].stderr.end();
      children[4].emit('close', 0, null);
      assert.equal(await replacement, 'removed');
    } finally {
      for (const child of children) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.emit('close', null, 'SIGKILL');
      }
      childProcess.spawn = originalSpawn;
      syncBuiltinESMExports();
    }
  },
);
