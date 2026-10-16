import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';

const run = promisify(execFile);
const script = resolve('scripts/run-linux-xrdp-clipboard.mjs');
const args = ['freerdp-bridge-linux-rdp-201', 'sha256:' + 'a'.repeat(64)];

test('Linux clipboard probe rejects unsafe bootstrap before Docker without leaking input', async (t) => {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'bridge-clipboard-probe-'));
  const owned = relative(parent, await realpath(root));
  assert.ok(owned && !owned.startsWith('..') && !isAbsolute(owned));
  const files = join(root, '.local-tests');
  const secret = 'synthetic-private-probe-value';
  await mkdir(files);
  try {
    for (const [name, target, credentials] of [
      [
        'wrong target',
        { host: '127.0.0.1', port: 3389 },
        { username: 'synthetic', password: secret },
      ],
      [
        'wrong port',
        { host: '192.168.21.149', port: 3390 },
        { username: 'synthetic', password: secret },
      ],
      [
        'invalid credential type',
        { host: '192.168.21.149', port: 3389 },
        { username: 'synthetic', password: { secret } },
      ],
      [
        'oversized file',
        { host: '192.168.21.149', port: 3389 },
        { username: 'synthetic', password: secret, extra: 'x'.repeat(8192) },
      ],
      ['malformed JSON', { host: '192.168.21.149', port: 3389 }, '{' + secret],
    ]) {
      await t.test(name, async () => {
        await writeFile(join(files, 'xrdp-lab.json'), JSON.stringify(target));
        await writeFile(
          join(files, 'xrdp-lab.secrets.json'),
          typeof credentials === 'string'
            ? credentials
            : JSON.stringify(credentials),
        );
        await assert.rejects(
          run(process.execPath, [script, ...args], {
            cwd: root,
            windowsHide: true,
            timeout: 5000,
            maxBuffer: 8192,
            // No Docker executable can run, even if this guard regresses.
            env: { ...process.env, PATH: '' },
          }),
          (error) => {
            assert.equal(error.code, 1);
            assert.equal(error.signal, null);
            assert.equal(error.stdout, '');
            assert.match(error.stderr, /Local lab input unavailable/);
            assert.ok(!error.stderr.includes(secret));
            assert.ok(!error.stderr.includes('spawn docker'));
            return true;
          },
        );
      });
    }
  } finally {
    // root was resolved and verified as the unique owned temp child above.
    await rm(root, { recursive: true, force: true });
  }
});
