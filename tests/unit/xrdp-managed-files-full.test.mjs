import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const python = process.platform === 'win32' ? 'python' : 'python3';
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(
      name.toUpperCase(),
    ),
  ),
);
const options = {
  env,
  encoding: 'utf8',
  timeout: 10000,
  windowsHide: true,
  maxBuffer: 8192,
};
const available = spawnSync(python, ['-I', '--version'], options).status === 0;

test(
  'owned XRDP full-disk probe refuses oversized, path-injected and extra-root requests before mount access',
  { skip: !available, timeout: 90000 },
  () => {
    const marker = 'OWNED_INVALID_REQUEST_MUST_NOT_BE_ECHOED';
    const input = {
      id: '0123456789abcdef0123456789abcdef',
      rw: 'RW01234',
      ro: 'RO01234',
      seedSha: 'a'.repeat(64),
      phase: 'fill',
    };
    for (const bytes of [
      '{}\n',
      ' '.repeat(4097) + '\n',
      JSON.stringify({ ...input, root: marker }) + '\n',
      JSON.stringify({ ...input, id: '../' + marker }) + '\n',
      JSON.stringify({ ...input, rw: '../' + marker }) + '\n',
      JSON.stringify({ ...input, ro: input.rw }) + '\n',
      JSON.stringify({ ...input, phase: marker }) + '\n',
    ]) {
      const result = spawnSync(
        python,
        ['-I', '-B', resolve('tests/fixtures/xrdp-managed-files-full.py')],
        { ...options, input: bytes },
      );
      assert.equal(result.status, 1);
      assert.equal(result.stderr, '');
      assert.ok(result.stdout.length < 1024);
      assert.equal(result.stdout.includes(marker), false);
      const report = JSON.parse(result.stdout);
      assert.equal(report.event, 'failed');
      assert.equal(report.phase, 'owned-drive-full');
    }
  },
);
