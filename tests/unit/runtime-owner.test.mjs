import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  RuntimeOwner,
  probeRuntimeOwner,
} from '../../packages/node-bridge/dist/runtime-owner.js';

const supported = {
  skip: !['linux', 'win32'].includes(process.platform),
  timeout: 10000,
};

test(
  'runtime owner: invalid identities and deadlines are refused before probing arbitrary endpoints',
  supported,
  () => {
    for (const id of [
      '',
      '../untrusted',
      'a'.repeat(31),
      'A'.repeat(32),
      '0'.repeat(33),
      null,
      42,
    ])
      assert.throws(() => probeRuntimeOwner(id), {
        message: 'RUNTIME_OWNER_INVALID',
      });
    for (const timeoutMs of [0, -1, 5001, Infinity, NaN, 1.5])
      assert.throws(() => probeRuntimeOwner('a'.repeat(32), { timeoutMs }), {
        message: 'RUNTIME_OWNER_INVALID',
      });
  },
);

test(
  'runtime owner: actual OS endpoint is live until joined idempotent close',
  supported,
  async () => {
    const owner = await RuntimeOwner.open();
    let losses = 0;
    owner.onLost(() => {
      ++losses;
    });
    assert.throws(() => owner.onLost(() => {}), {
      message: 'RUNTIME_OWNER_INVALID',
    });
    try {
      assert.match(owner.id, /^[0-9a-f]{32}$/);
      assert.equal(await probeRuntimeOwner(owner.id), 'live');
    } finally {
      const close = owner.close();
      assert.equal(owner.close(), close);
      await close;
    }
    assert.equal(losses, 0);
    assert.equal(await probeRuntimeOwner(owner.id), 'absent');
  },
);

test(
  'runtime owner: bounded probe burst never classifies a live owner as absent',
  supported,
  async () => {
    const owner = await RuntimeOwner.open();
    try {
      const results = await Promise.all(
        Array.from({ length: 64 }, () =>
          probeRuntimeOwner(owner.id, { timeoutMs: 1000 }),
        ),
      );
      assert.ok(results.some((value) => value === 'live'));
      assert.ok(
        results.every((value) => value === 'live' || value === 'unknown'),
      );
    } finally {
      await owner.close();
    }
  },
);

test(
  'runtime owner: cancellation is unknown, and repeated actual probes release Linux descriptors',
  supported,
  async () => {
    const warm = await RuntimeOwner.open();
    await probeRuntimeOwner(warm.id);
    await warm.close();
    const before =
      process.platform === 'linux'
        ? (await readdir('/proc/self/fd')).length
        : undefined;
    const owner = await RuntimeOwner.open();
    try {
      const abort = new AbortController();
      abort.abort();
      assert.equal(
        await probeRuntimeOwner(owner.id, { signal: abort.signal }),
        'unknown',
      );
      const pendingAbort = new AbortController();
      const pending = probeRuntimeOwner(owner.id, {
        signal: pendingAbort.signal,
      });
      pendingAbort.abort();
      assert.equal(await pending, 'unknown');
      for (let i = 0; i < 16; ++i)
        assert.equal(await probeRuntimeOwner(owner.id), 'live');
    } finally {
      await owner.close();
    }
    if (before !== undefined)
      assert.equal((await readdir('/proc/self/fd')).length, before);
  },
);

test(
  'runtime owner: parent hard kill removes endpoint while an unrelated inherited child remains alive',
  supported,
  async () => {
    const module = new URL(
      '../../packages/node-bridge/dist/runtime-owner.js',
      import.meta.url,
    ).href;
    const source = `
    import { RuntimeOwner } from ${JSON.stringify(module)};
    import { spawn } from 'node:child_process';
    const owner = await RuntimeOwner.open();
    const child = spawn(process.execPath, ['--eval', 'setTimeout(() => {}, 30000)'],
      { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => process.exit(2));
    child.once('spawn', () => process.stdout.write(JSON.stringify({id:owner.id, child:child.pid})+'\\n'));
    setInterval(() => {}, 1000);
  `;
    const parent = spawn(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          PATH: dirname(process.execPath),
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
        },
      },
    );
    const closed = once(parent, 'close');
    parent.stderr.resume();
    let childPid;
    try {
      const record = await new Promise((resolve, reject) => {
        let text = '';
        const timer = setTimeout(
          () => reject(new Error('OWNER_FIXTURE_DEADLINE')),
          5000,
        );
        const finish = (run) => {
          clearTimeout(timer);
          parent.stdout.removeAllListeners('data');
          run();
        };
        parent.stdout.on('data', (bytes) => {
          text += bytes.toString('utf8');
          if (text.length > 256)
            finish(() => reject(new Error('OWNER_FIXTURE_OUTPUT')));
          else if (text.includes('\n'))
            finish(() => {
              try {
                resolve(JSON.parse(text));
              } catch {
                reject(new Error('OWNER_FIXTURE_INVALID'));
              }
            });
        });
        parent.once('error', () =>
          finish(() => reject(new Error('OWNER_FIXTURE_START'))),
        );
      });
      assert.match(record.id, /^[0-9a-f]{32}$/);
      assert.ok(Number.isInteger(record.child) && record.child > 0);
      childPid = record.child;
      assert.equal(await probeRuntimeOwner(record.id), 'live');
      parent.kill('SIGKILL');
      await closed;
      assert.equal(await probeRuntimeOwner(record.id), 'absent');
      assert.doesNotThrow(() => process.kill(childPid, 0));
    } finally {
      parent.kill('SIGKILL');
      await closed;
      if (childPid) {
        try {
          process.kill(childPid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        const due = performance.now() + 3000;
        let alive = true;
        while (alive && performance.now() < due) {
          try {
            process.kill(childPid, 0);
            await delay(10);
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
            alive = false;
          }
        }
        assert.equal(
          alive,
          false,
          'Owned child must retire after fixture cleanup',
        );
      }
    }
  },
);
