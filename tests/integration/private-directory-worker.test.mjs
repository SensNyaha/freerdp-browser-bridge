import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  copyFile,
} from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import {
  WorkerProcess,
  NativeSessionWorker,
} from '../../packages/node-bridge/dist/index.js';
import { windowsWorkerResidentBytes } from '../../scripts/viewer-soak.mjs';

const binary = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
  'rdp-worker.exe',
);
const windows = { skip: process.platform !== 'win32' };
test(
  'Windows delayed bootstrap: existing startup policy admits a confirmed receipt after five seconds',
  { ...windows, timeout: 20000 },
  async () =>
    fixture(async (root) => {
      const executableRoot = join(root, 'bin');
      const runtimeRoot = join(root, 'runtime');
      await mkdir(executableRoot);
      const workerPath = join(executableRoot, 'fixture-audio-1.exe');
      await copyFile(join(dirname(binary), 'fixture-audio-1.exe'), workerPath);
      await copyFile(
        join(dirname(binary), 'fixture-runtime-directory-delayed.exe'),
        join(executableRoot, 'rdp-runtime-directory.exe'),
      );
      for (const name of [
        'msvcp140.dll',
        'vcruntime140.dll',
        'vcruntime140_1.dll',
      ]) {
        try {
          await copyFile(
            join(dirname(binary), name),
            join(executableRoot, name),
          );
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      const worker = new WorkerProcess({ workerPath, runtimeRoot });
      const started = performance.now();
      try {
        await worker.start();
        assert.ok(performance.now() - started >= 5500);
        assert.equal(worker.state, 'ready');
      } finally {
        await worker.close();
      }
      assert.deepEqual(await readdir(runtimeRoot), []);
    }),
);
test(
  'actual Windows worker resident sample uses bounded native metadata without command-line or environment inventory',
  windows,
  async () =>
    fixture(async (root) => {
      const worker = new WorkerProcess({
        workerPath: binary,
        runtimeRoot: root,
      });
      try {
        await worker.start();
        const bytes = await windowsWorkerResidentBytes(worker.pid, binary);
        assert.ok(Number.isSafeInteger(bytes) && bytes >= 1024);
      } finally {
        await worker.close();
      }
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'host native adapter process identity is absent before startup and retained after close without a liveness claim',
  windows,
  async () =>
    fixture(async (root) => {
      const worker = new NativeSessionWorker({
        workerPath: resolve(
          process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
          'fixture-audio-1.exe',
        ),
        runtimeRoot: root,
      });
      assert.equal(worker.pid, undefined);
      try {
        await worker.start(
          { target: { host: 'valid' }, auth: {} },
          new AbortController().signal,
        );
        assert.ok(Number.isInteger(worker.pid) && worker.pid > 0);
        const pid = worker.pid;
        await worker.close();
        assert.equal(worker.pid, pid);
        assert.deepEqual(await readdir(root), []);
      } finally {
        await worker.close();
      }
    }),
);
async function fixture(body) {
  const build = resolve('build');
  await mkdir(build, { recursive: true });
  const root = await mkdtemp(join(build, 'private-directory-worker-'));
  const within = relative(build, resolve(root));
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within));
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
class Probe extends WorkerProcess {
  spawns = 0;
  directory;
  spawnWorker(directory, env) {
    ++this.spawns;
    this.directory = directory;
    return super.spawnWorker(directory, env);
  }
}
test(
  'native Windows missing bootstrap fails before worker spawn without disclosing its path',
  windows,
  async () =>
    fixture(async (root) => {
      const worker = new Probe({
        workerPath: join(root, 'sentinel-NONEXISTENT.exe'),
        runtimeRoot: root,
      });
      await assert.rejects(worker.start(), (error) => {
        assert.equal(error.code, 'RUNTIME_DIRECTORY_UNAVAILABLE');
        assert.equal(error.message.includes('sentinel'), false);
        return true;
      });
      await worker.close();
      assert.equal(worker.spawns, 0);
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'native Windows startup: confirmed private creation precedes owner marker and worker spawn',
  windows,
  async () =>
    fixture(async (root) => {
      class Ordered extends Probe {
        async createWindowsRuntimeDirectory(directory) {
          assert.deepEqual(await readdir(root), []);
          assert.equal(this.spawns, 0);
          const result = await super.createWindowsRuntimeDirectory(directory);
          assert.deepEqual(await readdir(directory), []);
          return result;
        }
        spawnWorker(directory, env) {
          assert.match(
            directory,
            /worker-(?:[0-9a-f]{32}|[0-9a-f]{32}-1-[0-9a-f]{32})$/,
          );
          assert.equal(
            readFileSync(join(directory, '.rdp-worker-owned'), 'utf8'),
            'runtime-v1',
          );
          return super.spawnWorker(directory, env);
        }
      }
      const worker = new Ordered({ workerPath: binary, runtimeRoot: root });
      try {
        await worker.start();
        assert.equal(worker.spawns, 1);
        if (/worker-[0-9a-f]{32}-1-[0-9a-f]{32}$/.test(worker.directory))
          await assert.rejects(
            readFile(join(worker.directory, '.rdp-worker-owned'), 'utf8'),
            (error) => error.code === 'EBUSY',
          );
        else
          assert.equal(
            await readFile(join(worker.directory, '.rdp-worker-owned'), 'utf8'),
            'runtime-v1',
          );
      } finally {
        await worker.close();
      }
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'native Windows startup cancellation: joins delayed ownership receipt then cleans without late spawn',
  windows,
  async () =>
    fixture(async (root) => {
      let entered, release;
      const enteredPromise = new Promise((done) => {
        entered = done;
      });
      const gate = new Promise((done) => {
        release = done;
      });
      class Delayed extends Probe {
        async createWindowsRuntimeDirectory(directory) {
          const result = await super.createWindowsRuntimeDirectory(directory);
          entered();
          await gate;
          return result;
        }
      }
      const worker = new Delayed({ workerPath: binary, runtimeRoot: root });
      const starting = worker.start();
      void starting.catch(() => {});
      try {
        await enteredPromise;
        worker.terminate();
        let closed = false;
        const closing = worker.close().then(() => {
          closed = true;
        });
        await new Promise((done) => setTimeout(done, 30));
        assert.equal(closed, false);
        assert.equal(worker.spawns, 0);
        assert.equal((await readdir(root)).length, 1);
        release();
        await assert.rejects(starting, { code: 'WORKER_TERMINATED' });
        await closing;
        assert.equal(worker.spawns, 0);
        assert.deepEqual(await readdir(root), []);
      } finally {
        release();
        await starting.catch(() => {});
        await worker.close();
      }
    }),
);
test(
  'synthetic Windows collision receipt never authorizes cleanup of a preexisting object',
  windows,
  async () =>
    fixture(async (root) => {
      class Collision extends Probe {
        candidate;
        async createWindowsRuntimeDirectory(directory) {
          this.candidate = directory;
          await mkdir(directory);
          await writeFile(join(directory, 'sentinel'), 'not-owned');
          return {
            stdout: '{"v":1,"created":false,"error":183}',
            stderr: '',
            code: 1,
          };
        }
      }
      const worker = new Collision({ workerPath: binary, runtimeRoot: root });
      await assert.rejects(worker.start(), {
        code: 'RUNTIME_DIRECTORY_REFUSED',
      });
      await worker.close();
      assert.equal(worker.spawns, 0);
      assert.equal(
        await readFile(join(worker.candidate, 'sentinel'), 'utf8'),
        'not-owned',
      );
    }),
);
test(
  'synthetic Windows bootstrap malformed and fault receipts fail before marker spawn or disclosure',
  windows,
  async () =>
    fixture(async (root) => {
      for (const stdout of [
        'NEVER_DISCLOSE',
        'x'.repeat(129),
        '{"v":2,"created":true,"error":0}',
        '{"v":1,"created":false,"error":0}',
        '{"v":1,"created":true,"error":0,"path":"NEVER_DISCLOSE"}',
      ]) {
        class Malformed extends Probe {
          async createWindowsRuntimeDirectory() {
            return { stdout, stderr: 'NEVER_DISCLOSE', code: 1 };
          }
        }
        const worker = new Malformed({ workerPath: binary, runtimeRoot: root });
        await assert.rejects(worker.start(), (error) => {
          assert.equal(error.code, 'RUNTIME_DIRECTORY_UNCERTAIN');
          assert.equal(error.message.includes('NEVER_DISCLOSE'), false);
          return true;
        });
        await worker.close();
        assert.equal(worker.spawns, 0);
      }
      assert.deepEqual(await readdir(root), []);
    }),
);
test(
  'native Windows creation receipt retains cleanup authority through later bootstrap fault',
  windows,
  async () =>
    fixture(async (root) => {
      class Fault extends Probe {
        async createWindowsRuntimeDirectory(directory) {
          const result = await super.createWindowsRuntimeDirectory(directory);
          return { ...result, stderr: 'NEVER_DISCLOSE', code: 3 };
        }
      }
      const worker = new Fault({ workerPath: binary, runtimeRoot: root });
      await assert.rejects(worker.start(), {
        code: 'RUNTIME_DIRECTORY_FAILED',
      });
      await worker.close();
      assert.equal(worker.spawns, 0);
      assert.deepEqual(await readdir(root), []);
    }),
);
