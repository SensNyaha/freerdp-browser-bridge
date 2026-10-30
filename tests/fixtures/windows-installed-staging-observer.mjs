// SYSTEM task: metadata only, for one admitted private CI runtime directory.
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import {
  lstat,
  open,
  opendir,
  writeFile,
  access,
  rename,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  windowsInstalledRuntimeComponent,
  windowsInstalledStagingRequest,
} from './windows-installed-full-inputs.mjs';

async function smallJson(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    assert.ok(info.isFile() && info.size > 0 && info.size <= 1024);
    const bytes = Buffer.alloc(1025);
    const result = await file.read(bytes, 0, bytes.length, 0);
    assert.equal(result.bytesRead, info.size);
    return JSON.parse(bytes.subarray(0, result.bytesRead).toString('utf8'));
  } finally {
    await file.close();
  }
}
async function plainDirectory(path) {
  const info = await lstat(path);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
}
async function atomicJson(path, value) {
  await writeFile(path + '.new', JSON.stringify(value), { flag: 'wx' });
  await rename(path + '.new', path);
}
async function snapshot(staging) {
  const directory = await opendir(staging, { bufferSize: 1 });
  try {
    const entry = await directory.read();
    if (!entry) return { entries: 0, bytes: 0 };
    assert.ok(entry.isFile() && !entry.isSymbolicLink());
    assert.equal(await directory.read(), null);
    const info = await lstat(join(staging, entry.name));
    assert.ok(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.nlink === 1 &&
        info.size <= 2097152,
    );
    return { entries: 1, bytes: info.size };
  } finally {
    await directory.close();
  }
}
async function main() {
  assert.equal(process.platform, 'win32');
  assert.deepEqual(process.argv.slice(2), ['--owned-staging-observer']);
  const directory = dirname(fileURLToPath(import.meta.url));
  assert.equal(basename(directory), 'staging-observer');
  const match = /^windows-msi-run-([a-f0-9]{32})$/.exec(
    basename(dirname(directory)),
  );
  assert.ok(match);
  const config = await smallJson(join(directory, 'config.json'));
  assert.equal(
    Object.keys(config).sort().join(','),
    'component,coordinatorPid,id,runtimeRoot',
  );
  assert.equal(config.id, match[1]);
  assert.match(
    config.runtimeRoot,
    new RegExp('^[A-Z]:\\\\bridge-owned-full-' + match[1] + '\\\\runtime$'),
  );
  windowsInstalledRuntimeComponent(['.bridge-service.lock', config.component]);
  const proof = await smallJson(join(dirname(directory), 'proof.json'));
  assert.equal(proof.root, dirname(config.runtimeRoot));
  assert.equal(proof.diskBytes, 16777216);
  assert.equal(proof.coordinatorPid, config.coordinatorPid);
  const worker = join(config.runtimeRoot, config.component);
  const staging = join(worker, 'managed-files', '.uploads');
  for (const path of [
    directory,
    proof.root,
    config.runtimeRoot,
    worker,
    join(worker, 'managed-files'),
    staging,
  ])
    await plainDirectory(path);
  await atomicJson(join(directory, 'ready.json'), {
    pid: process.pid,
    kind: 'owned-staging-metadata-v1',
  });
  const overall = performance.now() + 330000;
  const records = [];
  for (let sequence = 1; sequence <= 24; sequence++) {
    const requestPath = join(directory, 'request-' + sequence + '.json');
    let request;
    for (;;) {
      assert.ok(performance.now() < overall);
      process.kill(config.coordinatorPid, 0);
      try {
        await access(requestPath);
        request = windowsInstalledStagingRequest(
          await smallJson(requestPath),
          sequence,
        );
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await delay(10);
    }
    const due = performance.now() + 5000;
    let value;
    for (;;) {
      value = await snapshot(staging);
      if (value.entries === request.entries && value.bytes >= request.minimum)
        break;
      assert.ok(performance.now() < due);
      await delay(5);
    }
    records.push({ sequence, ...value });
    if (sequence === 24)
      await atomicJson(join(directory, 'summary.json'), {
        schema: 1,
        pid: process.pid,
        component: config.component,
        records,
      });
    await atomicJson(join(directory, 'response-' + sequence + '.json'), {
      sequence,
      ...value,
    });
  }
}
const timer = setTimeout(() => process.exit(1), 340000);
try {
  await main();
} catch {
  // No paths, arbitrary errors, file names or file contents are emitted.
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
