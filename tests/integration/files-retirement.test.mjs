import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  SessionManager,
  WorkerProcess,
} from '../../packages/node-bridge/dist/index.js';
import { probeRuntimeOwner } from '../../packages/node-bridge/dist/runtime-owner.js';
import { NativeLifecycleWorker } from '../fixtures/native-lifecycle-worker.mjs';
import { eventually } from '../fixtures/session-worker.mjs';

const binaryDir = process.env.BRIDGE_FILE_TEST_BINARY_DIR;
const exec = promisify(execFile);
const workerPath = resolve(
  binaryDir ?? 'build/foundation',
  'rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
);
const principal = { id: 'file-retirement' };
const config = () => ({ target: { host: 'no-connection.invalid' }, auth: {} });
const name = 'owned-\u0416\u65e5\u672c\u8a9e\ud83d\ude00.bin';
const contents = Buffer.alloc(131111);
for (let i = 0; i < contents.length; ++i) contents[i] = (i * 31) & 255;
const command = (
  worker,
  operation,
  id = 0n,
  argument = 0n,
  value = 0n,
  data = Buffer.alloc(0),
) => worker.nativeFileCommand({ operation, id, argument, value, data });
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
};
async function seed(worker) {
  assert.equal(
    (await command(worker, 'initialize', 524288n, 262144n, 8n)).status,
    'ok',
  );
  const upload = await command(
    worker,
    'begin-upload',
    0n,
    0n,
    0n,
    Buffer.from(name),
  );
  assert.equal(upload.status, 'ok');
  for (let offset = 0; offset < contents.length; offset += 65536) {
    const part = contents.subarray(offset, offset + 65536);
    assert.equal(
      (await command(worker, 'write', upload.id, BigInt(offset), 0n, part))
        .status,
      'ok',
    );
  }
  assert.equal(
    (await command(worker, 'commit', upload.id, BigInt(contents.length)))
      .status,
    'ok',
  );
  const pending = await command(
    worker,
    'begin-upload',
    0n,
    0n,
    0n,
    Buffer.from('pending.bin'),
  );
  assert.equal(pending.status, 'ok');
  assert.equal(
    (
      await command(
        worker,
        'write',
        pending.id,
        0n,
        0n,
        contents.subarray(0, 65536),
      )
    ).status,
    'ok',
  );
  return upload.id;
}
async function preserved(directory) {
  assert.equal((await stat(join(directory, '.managed-files-owned'))).size, 56);
  assert.deepEqual(
    await readFile(join(directory, 'managed-files', '.data', name)),
    contents,
  );
  const uploads = await readdir(join(directory, 'managed-files', '.uploads'));
  assert.equal(uploads.length, 1);
  assert.equal(
    (await stat(join(directory, 'managed-files', '.uploads', uploads[0]))).size,
    65536,
  );
}

// Actual native file/lifecycle IPC and production registry admission. No
// CONFIGURE/SECRET/CONNECT and no synthetic claim of an RDP connected state.
for (const transport of process.platform === 'linux'
  ? ['framed-pipes', 'unix-seqpacket-rws1']
  : ['framed-pipes']) {
  for (const mode of ['owned', 'unknown', 'cohort-mismatch']) {
    test(
      `native managed file retirement / ${transport} / ${mode}: ${mode === 'owned' ? 'releases capacity only after verified cleanup and preserves a live sibling' : 'retains files and capacity when cleanup is unconfirmed'}`,
      { skip: !binaryDir, timeout: 20000 },
      async () => {
        const parent = await realpath(tmpdir());
        const root = await mkdtemp(join(parent, 'bridge-file-retirement-'));
        assert.equal(dirname(root), parent);
        if (process.platform === 'win32') {
          // Match the production recovery root contract, independently of the
          // temporary parent's inherited host-specific ACLs. Never repair an
          // existing deployment root to make an uncertain cleanup succeed.
          await rmdir(root);
          const result = await exec(
            resolve(binaryDir, 'rdp-runtime-directory.exe'),
            ['--create-private-directory', root],
            { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
          );
          assert.equal(result.stderr, '');
        }
        const recoveryGate = Promise.withResolvers();
        const workers = [];
        class Observed extends WorkerProcess {
          spawnWorker(directory, env) {
            this.ownedDirectory = directory;
            return super.spawnWorker(directory, env);
          }
          async recoverManagedRuntimeDirectory(directory, cohort) {
            this.recoveryEntered = true;
            const ownerId = /^worker-([a-f0-9]{32})-1-[a-f0-9]{32}$/.exec(
              basename(directory),
            )?.[1];
            assert.ok(ownerId);
            this.ownerAtRecovery = await probeRuntimeOwner(ownerId);
            assert.equal(this.ownerAtRecovery, 'absent');
            assert.equal(alive(this.pid), false);
            if (this.holdRecovery) await recoveryGate.promise;
            try {
              this.recoveryResult = await super.recoverManagedRuntimeDirectory(
                directory,
                mode === 'cohort-mismatch'
                  ? { ...cohort, helperSha256: '0'.repeat(64) }
                  : cohort,
              );
              return this.recoveryResult;
            } catch (error) {
              this.recoveryError = error.code;
              throw error;
            }
          }
        }
        class FilesLifecycle extends NativeLifecycleWorker {
          createWorkerProcess(options) {
            return new Observed(options);
          }
          async start(_config, signal) {
            assert.equal(signal.aborted, false);
            this.emit('state', 'connecting');
            await this.native.start();
            this.fileId = await seed(this.native);
            assert.equal(signal.aborted, false);
            this.prepared = true;
          }
        }
        const manager = new SessionManager({
          maxSessions: 2,
          maxPerPrincipal: 2,
          createBurst: 20,
          shutdownTimeoutMs: 20,
          terminationTimeoutMs: 20,
          workerFactory() {
            const worker = new FilesLifecycle({
              workerPath,
              runtimeRoot: root,
              ipcTransport: transport,
              maxWriteBytes: 131072,
            });
            worker.native.holdRecovery =
              mode === 'owned' && workers.length === 0;
            workers.push(worker);
            return worker;
          },
        });
        const refuse = () => {
          const before = workers.length;
          assert.throws(
            () => manager.create(config(), principal, '127.0.0.1'),
            { code: 'SESSION_LIMIT' },
          );
          assert.equal(workers.length, before);
        };
        try {
          const first = manager.create(config(), principal, '127.0.0.1');
          const sibling = manager.create(config(), principal, '127.0.0.1');
          await eventually(
            () => workers.length === 2 && workers.every((w) => w.prepared),
            7000,
          );
          const crashed = workers[0].native;
          const siblingNative = workers[1].native;
          await preserved(crashed.ownedDirectory);
          if (mode === 'unknown')
            await writeFile(
              join(crashed.ownedDirectory, 'host-sentinel'),
              'preserve unknown sibling',
              { flag: 'wx', mode: 0o600 },
            );
          assert.equal(process.kill(crashed.pid, 'SIGKILL'), true);
          await eventually(
            () =>
              manager.get(first.sessionId, principal).state === 'failed' &&
              !alive(crashed.pid),
            5000,
          );
          assert.equal(
            manager.get(first.sessionId, principal).error.code,
            'WORKER_FAILED',
          );
          if (mode === 'owned') {
            await eventually(
              () =>
                crashed.recoveryEntered && crashed.ownerAtRecovery === 'absent',
              5000,
            );
            assert.equal(
              (await manager.close(first.sessionId, principal)).state,
              'failed',
            );
            // Manager deadlines have elapsed; neither failure nor dead PID is
            // confirmation that owned file cleanup has joined.
            assert.equal(manager.statistics().active, 2);
            refuse();
            await preserved(crashed.ownedDirectory);
            recoveryGate.resolve();
            await eventually(
              () => crashed.recoveryResult || crashed.recoveryError,
              5000,
            );
            assert.equal(crashed.recoveryError, undefined);
            assert.equal(crashed.recoveryResult, 'removed');
            await eventually(() => manager.statistics().active === 1, 7000);
            await crashed.close();
            assert.deepEqual(await readdir(root), [
              basename(siblingNative.ownedDirectory),
            ]);
          } else {
            await assert.rejects(crashed.close(), {
              code: 'FILE_CONTENTS_RETAINED',
            });
            await manager.close(first.sessionId, principal);
            assert.equal(crashed.recoveryEntered, true);
            if (mode === 'unknown')
              assert.equal(crashed.recoveryResult, 'retained');
            else
              assert.equal(crashed.recoveryError, 'RUNTIME_RECOVERY_MISMATCH');
            assert.equal(manager.statistics().active, 2);
            refuse();
            await preserved(crashed.ownedDirectory);
            if (mode === 'unknown')
              assert.equal(
                await readFile(
                  join(crashed.ownedDirectory, 'host-sentinel'),
                  'utf8',
                ),
                'preserve unknown sibling',
              );
          }
          await assert.rejects(command(crashed, 'list', 0n, 0n, 64n), {
            code: 'INVALID_STATE',
          });
          await siblingNative.ping();
          assert.equal(
            (await command(siblingNative, 'open-download', workers[1].fileId))
              .value,
            BigInt(contents.length),
          );
          assert.deepEqual(
            (
              await command(
                siblingNative,
                'read',
                workers[1].fileId,
                0n,
                65536n,
              )
            ).data,
            contents.subarray(0, 65536),
          );
          assert.equal(
            (await command(siblingNative, 'close-download', workers[1].fileId))
              .status,
            'ok',
          );
          await manager.close(sibling.sessionId, principal);
          await eventually(
            () => manager.statistics().active === (mode === 'owned' ? 0 : 1),
            5000,
          );
          if (mode === 'owned') {
            const replacement = manager.create(
              config(),
              principal,
              '127.0.0.1',
            );
            await eventually(() => workers[2]?.prepared, 7000);
            await workers[2].native.ping();
            await manager.close(replacement.sessionId, principal);
            await eventually(() => manager.statistics().active === 0, 5000);
            assert.deepEqual(await readdir(root), []);
          }
        } finally {
          recoveryGate.resolve();
          for (const worker of workers) {
            worker.closing = true;
            worker.native.terminate();
          }
          await manager.shutdown();
          await Promise.all(
            workers.map((worker) =>
              worker.native
                .close()
                .catch((error) =>
                  assert.equal(error.code, 'FILE_CONTENTS_RETAINED'),
                ),
            ),
          );
          // Only this fixture's privately created root remains. Unknown data was
          // explicitly asserted retained before fixture teardown removes it.
          assert.equal(dirname(root), parent);
          await delay(5);
          await rm(root, { recursive: true, force: true, maxRetries: 3 });
        }
      },
    );
  }
}
