import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, chmod, chown, lstat, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const windows = process.platform === 'win32';
const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const probe = join(
  binaryDir,
  'fixture-cross-principal' + (windows ? '.exe' : ''),
);
const enabled = process.env.BRIDGE_CROSS_PRINCIPAL_TEST === '1';
const privileged = windows
  ? enabled && process.env.GITHUB_ACTIONS === 'true'
  : enabled && process.platform === 'linux' && process.getuid() === 0;
const script = fileURLToPath(
  new URL('../fixtures/cross-principal-windows.ps1', import.meta.url),
);

test('cross-principal fixture refuses invalid arguments before opening any target', async () => {
  for (const args of [[], ['--probe'], ['--probe', 'relative', 'invalid']]) {
    await assert.rejects(
      execute(probe, args, {
        timeout: 3000,
        maxBuffer: 128,
        windowsHide: true,
      }),
      (error) => error.code === 2 && error.stdout === '' && error.stderr === '',
    );
  }
});

function ownChild(runtimeRoot) {
  const env = Object.fromEntries(
    ['SystemRoot', 'WINDIR', 'PATH', 'LD_LIBRARY_PATH'].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  );
  env.BRIDGE_TEST_BINARY_DIR = binaryDir;
  if (!windows) env.HOME = join(dirname(runtimeRoot), 'home');
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../fixtures/cross-principal-owner.mjs', import.meta.url),
      ),
      runtimeRoot,
    ],
    {
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(!windows ? { uid: 42420, gid: 42420 } : {}),
    },
  );
  const closed = once(child, 'close');
  child.stdin.on('error', () => {});
  let pending = '',
    bytes = 0,
    failed = false;
  const records = [],
    readers = [];
  const fail = () => {
    failed = true;
    child.kill('SIGKILL');
    while (readers.length)
      readers.shift().reject(new Error('ISOLATION_OWNER_FAILED'));
  };
  child.stderr.on('data', fail);
  child.stdout.on('data', (chunk) => {
    if ((bytes += chunk.length) > 4096) return fail();
    pending += chunk.toString('ascii');
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      try {
        const value = JSON.parse(line);
        if (readers.length) readers.shift().resolve(value);
        else if (records.length < 4) records.push(value);
        else fail();
      } catch {
        fail();
      }
    }
  });
  closed.then(() => {
    while (readers.length)
      readers.shift().reject(new Error('ISOLATION_OWNER_CLOSED'));
  }, fail);
  return {
    async next() {
      if (failed) throw new Error('ISOLATION_OWNER_FAILED');
      if (records.length) return records.shift();
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error('ISOLATION_OWNER_CLOSED');
      let timer;
      try {
        return await Promise.race([
          new Promise((resolve, reject) => readers.push({ resolve, reject })),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('ISOLATION_OWNER_TIMEOUT')),
              20000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    command(value) {
      child.stdin.write(value + '\n');
    },
    async stop() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      try {
        await closed;
      } finally {
        clearTimeout(timer);
      }
    },
    closed,
  };
}

test(
  'actual distinct OS principal cannot read, write, claim or recover private live/sibling/orphan sessions',
  { skip: !privileged, timeout: 120000 },
  async () => {
    const stage = windows
      ? join(
          process.env.ProgramData,
          'BridgeIsolation_' + randomBytes(16).toString('hex'),
        )
      : await mkdtemp(join(tmpdir(), 'bridge-cross-principal-'));
    const runtimeRoot = join(stage, 'runtime');
    let owner;
    try {
      if (windows) {
        const prepared = await execute(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-File',
            script,
            '-Action',
            'prepare',
            '-Stage',
            stage,
            '-Probe',
            probe,
          ],
          {
            timeout: 15000,
            maxBuffer: 4096,
            windowsHide: true,
          },
        );
        assert.equal(prepared.stdout.trim(), 'ISOLATION_STAGE_READY');
        assert.equal(prepared.stderr, '');
      } else {
        await chmod(stage, 0o755);
        await mkdir(runtimeRoot, { mode: 0o755 });
        await chown(runtimeRoot, 42420, 42420);
        const home = join(stage, 'home');
        await mkdir(home, { mode: 0o700 });
        await chown(home, 42420, 42420);
      }
      owner = ownChild(runtimeRoot);
      const ready = await owner.next();
      assert.equal(ready.failure, undefined, JSON.stringify(ready));
      assert.deepEqual(Object.keys(ready).sort(), [
        'active',
        'orphan',
        'ready',
        'v',
      ]);
      assert.equal(ready.v, 1);
      assert.equal(ready.ready, true);
      assert.equal(ready.active.length, 2);
      const components = [...ready.active, ready.orphan];
      assert.equal(new Set(components).size, 3);
      for (const name of components) {
        assert.match(name, /^worker-[a-f0-9]{32}-1-[a-f0-9]{32}$/);
        const before = await lstat(join(runtimeRoot, name));
        const result = windows
          ? await execute(
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-File',
                script,
                '-Action',
                'probe',
                '-Stage',
                stage,
                '-Component',
                name,
              ],
              { timeout: 35000, maxBuffer: 4096, windowsHide: true },
            )
          : await execute(probe, ['--probe', runtimeRoot, name], {
              uid: 42421,
              gid: 42421,
              timeout: 5000,
              maxBuffer: 128,
            });
        assert.equal(result.stderr, '');
        assert.deepEqual(JSON.parse(result.stdout), { v: 1, checks: 255 });
        const after = await lstat(join(runtimeRoot, name));
        assert.equal(after.ino, before.ino);
        assert.equal(after.mode, before.mode);
        assert.equal(after.uid, before.uid);
        owner.command('check');
        assert.deepEqual(await owner.next(), { v: 1, live: 2, preserved: 3 });
      }
      if (!windows) {
        // Counterexample: a readable orphan must fail the privacy probe, even
        // though the native ownership check still refuses the foreign UID.
        owner.command('expose');
        assert.deepEqual(await owner.next(), { v: 1, exposed: true });
        await assert.rejects(
          execute(probe, ['--probe', runtimeRoot, ready.orphan], {
            uid: 42421,
            gid: 42421,
            timeout: 5000,
            maxBuffer: 128,
          }),
          (error) =>
            error.code === 1 &&
            error.stderr === '' &&
            JSON.stringify(JSON.parse(error.stdout)) ===
              JSON.stringify({ v: 1, checks: 123 }),
        );
        owner.command('restore');
        assert.deepEqual(await owner.next(), { v: 1, exposed: false });
        owner.command('check');
        assert.deepEqual(await owner.next(), { v: 1, live: 2, preserved: 3 });
      }
      owner.command('recover');
      assert.deepEqual(await owner.next(), { v: 1, recovered: 1, live: 2 });
      owner.command('close');
      assert.deepEqual(await owner.next(), {
        v: 1,
        closed: true,
        remaining: 0,
      });
      assert.deepEqual(await owner.closed, [0, null]);
    } finally {
      await owner?.stop();
      // Only this fresh direct child of the validated test parent, never a link.
      assert.equal(
        dirname(resolve(stage)),
        resolve(windows ? process.env.ProgramData : tmpdir()),
      );
      assert.match(
        basename(stage),
        windows
          ? /^BridgeIsolation_[a-f0-9]{32}$/
          : /^bridge-cross-principal-[A-Za-z0-9]+$/,
      );
      const info = await lstat(stage).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      if (info) {
        assert.ok(info.isDirectory() && !info.isSymbolicLink());
        await rm(stage, { recursive: true, force: true });
      }
    }
  },
);
