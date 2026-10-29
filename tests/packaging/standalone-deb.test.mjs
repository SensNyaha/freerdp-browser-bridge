import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { standalonePayloadInventory } from '../../scripts/standalone/payload.mjs';

const source = process.env.BRIDGE_DEB_TEST_ROOT;
const run = promisify(execFile);
test(
  'actual standalone DEB extracts exact staged bytes, root ownership, protected config and executable maintainer scripts',
  { skip: process.platform !== 'linux' || !source, timeout: 30000 },
  async () => {
    const directory = resolve(source);
    const build = JSON.parse(
      await readFile(join(directory, 'build.json'), 'utf8'),
    );
    assert.equal(dirname(build.output), directory);
    const extracted = await mkdtemp(join(directory, 'extract-'));
    try {
      const options = { timeout: 15000, maxBuffer: 2 * 1024 * 1024 };
      const control = (
        await run('dpkg-deb', ['--field', build.output], options)
      ).stdout;
      assert.ok(control.includes('Package: freerdp-bridge\n'));
      assert.ok(control.includes('Version: ' + build.version + '\n'));
      assert.ok(control.includes('Architecture: amd64\n'));
      assert.ok(control.includes('libc6 (>= 2.28)'));
      const listing = (
        await run('dpkg-deb', ['--contents', build.output], options)
      ).stdout
        .trim()
        .split('\n');
      assert.ok(listing.length > 5);
      assert.ok(
        listing.every((line) => /^[-d][rwx-]+ root\/root\s/.test(line)),
      );
      const program = listing.filter((line) =>
        line.includes(' ./opt/freerdp-bridge'),
      );
      assert.ok(program.length > 5);
      assert.ok(
        program.every((line) =>
          /^(?:drwxr-xr-x|-rwxr-xr-x|-rw-r--r--) root\/root\s/.test(line),
        ),
      );
      await run(
        'dpkg-deb',
        ['--raw-extract', build.output, extracted],
        options,
      );
      const expected = await standalonePayloadInventory(
        join(directory, 'root'),
      );
      const actual = await standalonePayloadInventory(extracted);
      assert.deepEqual(actual, expected);
      assert.equal(
        (await readFile(join(extracted, 'DEBIAN/conffiles'), 'utf8')).trim(),
        '/etc/freerdp-bridge/bridge.json',
      );
      assert.equal(
        (await lstat(join(extracted, 'etc/freerdp-bridge/bridge.json'))).mode &
          0o777,
        0o640,
      );
      assert.equal(
        (await lstat(join(extracted, 'opt/freerdp-bridge/node/node'))).mode &
          0o111,
        0o111,
      );
      for (const name of ['postinst', 'prerm', 'postrm']) {
        assert.equal(
          (await lstat(join(extracted, 'DEBIAN', name))).mode & 0o777,
          0o755,
        );
        await run('sh', ['-n', join(extracted, 'DEBIAN', name)], options);
      }
      assert.ok(
        actual.every(
          (file) =>
            !file.path.startsWith(
              'opt/freerdp-bridge/service/node_modules/.bin/',
            ),
        ),
      );
      const unit = await readFile(
        join(extracted, 'lib/systemd/system/freerdp-bridge.service'),
        'utf8',
      );
      for (const required of [
        'User=freerdp-bridge',
        'Group=freerdp-bridge',
        'RuntimeDirectoryMode=0700',
        'KillMode=mixed',
        'LimitCORE=0',
        'NoNewPrivileges=yes',
        'ProtectSystem=strict',
      ])
        assert.ok(unit.includes(required));
    } finally {
      assert.equal(dirname(extracted), directory);
      assert.match(basename(extracted), /^extract-[A-Za-z0-9]+$/);
      await rm(extracted, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
