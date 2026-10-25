// Copied into an independent npm consumer; imports must resolve there.
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

const kind = process.argv[2];
assert.ok(['fastify', 'nestjs', 'http', 'express'].includes(kind));
const { resolveNativeRuntime, recoverRuntimeSessions, RuntimeRecoveryError } =
  await import('@freerdp-bridge/' + kind);
assert.equal(typeof recoverRuntimeSessions, 'function');
assert.equal(typeof RuntimeRecoveryError, 'function');
const temporary = await realpath(tmpdir());
const scratch = await mkdtemp(join(temporary, 'bridge-package-recovery-'));
try {
  const runtimeRoot = join(scratch, 'missing-runtime');
  const worker = await resolveNativeRuntime({ runtimeRoot });
  assert.deepEqual(await recoverRuntimeSessions(worker), {
    supported: true,
    complete: true,
    scanned: 0,
    removed: 0,
    active: 0,
    retained: 0,
  });
  await assert.rejects(readdir(runtimeRoot), { code: 'ENOENT' });
  // Exercise the installed native executable, including npm's executable modes.
  // A missing root alone succeeds without spawning the recovery helper.
  const orphan = join(
    runtimeRoot,
    `worker-${randomBytes(16).toString('hex')}-1-${randomBytes(16).toString('hex')}`,
  );
  for (const directory of [runtimeRoot, orphan]) {
    if (process.platform === 'win32') {
      const created = await promisify(execFile)(
        join(dirname(worker.workerPath), 'rdp-runtime-directory.exe'),
        ['--create-private-directory', directory],
        { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
      );
      assert.deepEqual(JSON.parse(created.stdout), {
        v: 1,
        created: true,
        error: 0,
      });
    } else await mkdir(directory, { mode: 0o700 });
  }
  await writeFile(join(orphan, '.rdp-worker-owned'), 'runtime-v1', {
    flag: 'wx',
    mode: 0o600,
  });
  assert.deepEqual(await recoverRuntimeSessions(worker), {
    supported: true,
    complete: true,
    scanned: 1,
    removed: 1,
    active: 0,
    retained: 0,
  });
  assert.deepEqual(await readdir(runtimeRoot), []);
  console.log('NPM_RUNTIME_RECOVERY_CONSUMER_OK');
} finally {
  const target = await realpath(scratch);
  assert.equal(dirname(target), temporary);
  assert.match(basename(target), /^bridge-package-recovery-[A-Za-z0-9]+$/);
  await rm(target, { recursive: true });
}
