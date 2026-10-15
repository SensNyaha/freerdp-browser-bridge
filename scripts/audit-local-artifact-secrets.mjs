import { spawn } from 'node:child_process';
import { readFile, stat, realpath, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSecretStream } from './secret-stream.mjs';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (
  resolve('.') !== project ||
  process.argv.length !== 2 ||
  process.versions.node.split('.')[0] !== '24'
)
  throw new Error('SECRET_AUDIT_ARGUMENT');
const build = await realpath(resolve('build'));
const destination = resolve('build/packages/local-known-secret-audit.json');
await rm(destination, { force: true });
const credentialsFile = resolve('.local-tests/xrdp-lab.secrets.json');
let credentialsBytes;
try {
  if (
    (await realpath(credentialsFile)) !== credentialsFile ||
    (await stat(credentialsFile)).size > 8192
  )
    throw new Error();
  credentialsBytes = await readFile(credentialsFile);
} catch {
  throw new Error('SECRET_AUDIT_CREDENTIAL');
}
let patterns;
try {
  if (credentialsBytes.length > 8192) throw new Error();
  const credentials = JSON.parse(
    credentialsBytes.toString('utf8').replace(/^\uFEFF/, ''),
  );
  if (
    typeof credentials.password !== 'string' ||
    credentials.password.length < 4 ||
    credentials.password.length > 4096
  )
    throw new Error();
  patterns = ['utf8', 'utf16le'].map((encoding) =>
    Buffer.from(credentials.password, encoding),
  );
  delete credentials.password;
} catch {
  throw new Error('SECRET_AUDIT_CREDENTIAL');
} finally {
  credentialsBytes.fill(0);
}
async function fileHash(file, maximum) {
  if (!(await stat(file)).isFile() || (await stat(file)).size > maximum)
    throw new Error('SECRET_AUDIT_SIZE');
  const hash = createHash('sha256');
  let length = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: 65536 })) {
    if ((length += chunk.length) > maximum)
      throw new Error('SECRET_AUDIT_SIZE');
    hash.update(chunk);
  }
  return hash.digest('hex');
}
async function scanArchive(file) {
  const child = spawn('tar', ['-xOzf', file], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let fault = false;
  let diagnosticBytes = 0;
  const timer = setTimeout(() => {
    fault = true;
    child.kill();
  }, 120000);
  child.stderr.on('data', (chunk) => {
    if ((diagnosticBytes += chunk.length) > 16384) {
      fault = true;
      child.kill();
    }
  });
  // Observe both events immediately; a stream refusal still joins process exit.
  const completion = new Promise((done) => {
    child.once('error', () => {
      fault = true;
    });
    child.once('close', (code) => done(code));
  });
  try {
    const result = await scanSecretStream(child.stdout, patterns);
    if ((await completion) !== 0 || fault)
      throw new Error('SECRET_AUDIT_ARCHIVE');
    return result;
  } catch (error) {
    child.kill();
    await completion;
    throw new Error(
      error?.message === 'SECRET_SCAN_MATCH'
        ? 'SECRET_SCAN_MATCH'
        : 'SECRET_AUDIT_ARCHIVE',
    );
  } finally {
    clearTimeout(timer);
  }
}
try {
  const artifacts = [];
  for (const [name, archive, maximum] of [
    ['build/service-runtime/native-linux.tar.gz', true, 128 * 1024 * 1024],
    ['build/service-runtime/node-linux.tar.gz', true, 64 * 1024 * 1024],
    ['build/packages/freerdp-bridge-sbom-linux.tar.gz', true, 64 * 1024 * 1024],
    [
      'build/packages/freerdp-bridge-runtime.spdx.json',
      false,
      32 * 1024 * 1024,
    ],
  ]) {
    const file = await realpath(resolve(name));
    if (!file.startsWith(build + sep)) throw new Error('SECRET_AUDIT_PATH');
    const sha256 = await fileHash(file, maximum);
    const scanned = archive
      ? await scanArchive(file)
      : await scanSecretStream(
          createReadStream(file, { highWaterMark: 65536 }),
          patterns,
          maximum,
        );
    if ((await fileHash(file, maximum)) !== sha256)
      throw new Error('SECRET_AUDIT_CHANGED');
    artifacts.push({ artifact: name, sha256, scannedBytes: scanned.bytes });
  }
  const report = {
    scope: 'known-local-lab-password',
    encodings: ['utf8', 'utf16le'],
    passed: true,
    artifacts,
  };
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  for (const value of patterns) value.fill(0);
}
