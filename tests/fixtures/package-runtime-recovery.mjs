// Copied into an independent npm consumer; imports must resolve there.
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const kind = process.argv[2];
assert.ok(['fastify', 'nestjs', 'http', 'express'].includes(kind));
const {
  resolveNativeRuntime,
  recoverRuntimeSessions,
  RuntimeRecoveryError,
  WorkerProcess,
} = await import('@freerdp-bridge/' + kind);
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
  // Exercise the new feature through installed exports and actual relocated
  // native HELLO. This does not connect to RDP or access the OS clipboard.
  const processOwner = new WorkerProcess(worker);
  try {
    const build = await processOwner.start();
    assert.equal(build.bridgeVersion, '0.4.0');
    assert.equal(build.capabilities.clipboardHtml, true);
    assert.equal(build.capabilities.clipboardText, true);
    assert.equal(build.capabilities.clipboardRevoke, true);
  } finally {
    await processOwner.close();
  }
  assert.deepEqual(await readdir(runtimeRoot), []);
  const { referenceBrowserDirectory } = await import(
    '@freerdp-bridge/' + kind + '/browser'
  );
  for (const name of [
    'clipboard-html.js',
    'clipboard-html-view.js',
    'clipboard-html-normalize.js',
  ]) {
    const info = await readFile(join(referenceBrowserDirectory, name));
    assert.ok(info.length > 0 && info.length <= 65536);
  }
  const { encodeClipboardHtmlItem, decodeClipboardHtmlItem } = await import(
    pathToFileURL(join(referenceBrowserDirectory, 'clipboard-html.js')).href
  );
  const body = new TextEncoder().encode('<b>Ж日本語😀</b>');
  const text = new TextEncoder().encode('Ж日本語😀');
  let encoded;
  try {
    const item = {
      body,
      text,
      fragmentOffset: 0,
      fragmentBytes: body.length,
      selectionOffset: 0,
      selectionBytes: 0,
      context: false,
      selection: false,
    };
    encoded = encodeClipboardHtmlItem(item, 1024);
    const decoded = decodeClipboardHtmlItem(encoded, 1024);
    assert.deepEqual(decoded.body, body);
    assert.deepEqual(decoded.text, text);
    assert.throws(() =>
      encodeClipboardHtmlItem(item, body.length + text.length - 1),
    );
  } finally {
    body.fill(0);
    text.fill(0);
    encoded?.fill(0);
  }
  console.log('NPM_RUNTIME_HTML_CAPABILITY_AND_ASSETS_OK');
  console.log('NPM_RUNTIME_RECOVERY_CONSUMER_OK');
} finally {
  const target = await realpath(scratch);
  assert.equal(dirname(target), temporary);
  assert.match(basename(target), /^bridge-package-recovery-[A-Za-z0-9]+$/);
  await rm(target, { recursive: true });
}
