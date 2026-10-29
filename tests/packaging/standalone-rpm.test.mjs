import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { standalonePayloadInventory } from '../../scripts/standalone/payload.mjs';

const source = process.env.BRIDGE_RPM_TEST_ROOT;
const run = promisify(execFile);
test(
  'actual standalone RPM has compatible gzip, protected noreplace config and exact extracted program bytes',
  { skip: process.platform !== 'linux' || !source, timeout: 60000 },
  async () => {
    const root = resolve(source);
    const report = JSON.parse(await readFile(join(root, 'build.json'), 'utf8'));
    const inventory = JSON.parse(
      await readFile(join(root, 'payload.json'), 'utf8'),
    );
    const rpm = join(root, basename(report.output));
    const options = { timeout: 20000, maxBuffer: 2 * 1024 * 1024 };
    const header = (
      await run(
        'rpm',
        [
          '-qp',
          '--queryformat',
          '%{NAME}\t%{VERSION}\t%{ARCH}\t%{PAYLOADCOMPRESSOR}\t%{FILEDIGESTALGO}',
          rpm,
        ],
        options,
      )
    ).stdout;
    assert.equal(
      header,
      'freerdp-bridge\t' + report.version + '\tx86_64\tgzip\t8',
    );
    const license = (
      await run('rpm', ['-qp', '--queryformat', '%{LICENSE}', rpm], options)
    ).stdout;
    assert.equal(
      license,
      'MIT AND LicenseRef-NodejsBundled AND LicenseRef-FreeRDPBridgeNativeBundled AND LicenseRef-FreeRDPBridgeJsBundled',
    );
    const digest = (await run('rpm', ['--checksig', rpm], options)).stdout;
    assert.ok(digest.includes('digests OK'));
    const records = (
      await run(
        'rpm',
        [
          '-qp',
          '--queryformat',
          '[%{FILENAMES}\t%{FILESIZES}\t%{FILEDIGESTS}\t%{FILEMODES}\t%{FILEUSERNAME}\t%{FILEGROUPNAME}\t%{FILEFLAGS}\n]',
          rpm,
        ],
        options,
      )
    ).stdout
      .trim()
      .split('\n')
      .map((line) => line.split('\t'));
    const remaining = new Map(
      inventory.files.map((file) => ['/' + file.path, file]),
    );
    for (const [path, bytes, hash, mode, owner, group, flags] of records) {
      assert.ok(
        path.startsWith('/opt/freerdp-bridge') ||
          path.startsWith('/etc/freerdp-bridge') ||
          path === '/usr/lib/systemd/system/freerdp-bridge.service',
      );
      assert.ok(!path.split('/').includes('..'));
      const type = Number(mode) & 0o170000;
      assert.ok(type === 0o100000 || type === 0o040000);
      if (path.startsWith('/opt/freerdp-bridge')) {
        const permissions = Number(mode) & 0o7777;
        if (type === 0o040000) assert.equal(permissions, 0o755, path);
        else assert.ok([0o644, 0o755].includes(permissions), path);
      }
      assert.equal(owner, 'root');
      assert.equal(
        group,
        path.startsWith('/etc/freerdp-bridge') ? 'freerdp-bridge' : 'root',
      );
      if (path === '/etc/freerdp-bridge/bridge.json') {
        assert.equal(Number(flags) & 17, 17);
        assert.equal(Number(mode) & 0o777, 0o640);
      }
      if (type === 0o100000) {
        const expected = remaining.get(path);
        assert.ok(expected);
        assert.equal(Number(bytes), expected.bytes);
        assert.equal(hash, expected.sha256);
        remaining.delete(path);
      }
    }
    assert.equal(remaining.size, 0);
    const extracted = await mkdtemp(join(tmpdir(), 'bridge-rpm-extract-'));
    try {
      const decode = spawn('rpm2cpio', [rpm], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const unpack = spawn(
        'cpio',
        ['-id', '--quiet', '--no-absolute-filenames', '--no-preserve-owner'],
        { cwd: extracted, stdio: ['pipe', 'ignore', 'ignore'] },
      );
      decode.stdout.pipe(unpack.stdin);
      unpack.stdin.on('error', (error) => {
        if (error.code !== 'EPIPE') throw error;
      });
      const finished = (child) =>
        new Promise((done, reject) => {
          child.once('error', reject);
          child.once('close', done);
        });
      const timer = setTimeout(() => {
        decode.kill();
        unpack.kill();
      }, 20000);
      try {
        assert.deepEqual(
          await Promise.all([finished(decode), finished(unpack)]),
          [0, 0],
        );
      } finally {
        clearTimeout(timer);
      }
      assert.deepEqual(
        await standalonePayloadInventory(extracted),
        inventory.files,
      );
    } finally {
      assert.equal(dirname(extracted), resolve(tmpdir()));
      assert.match(basename(extracted), /^bridge-rpm-extract-[A-Za-z0-9]+$/);
      await rm(extracted, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
