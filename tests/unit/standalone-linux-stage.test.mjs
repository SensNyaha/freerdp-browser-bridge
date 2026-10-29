import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  chmod,
  lstat,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { stageStandaloneLinux } from '../../scripts/standalone/linux-stage.mjs';

test('Linux distribution staging fixture shares immutable service bytes and refuses version/unit-root/overwrite drift', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'bridge-linux-stage-'));
  try {
    const source = join(scratch, 'input');
    const native = join(
      source,
      'service/node_modules/@freerdp-bridge/runtime-linux-x64-gnu',
    );
    await mkdir(native, { recursive: true });
    await mkdir(join(source, 'node'));
    await writeFile(
      join(source, 'node/node'),
      'synthetic staging fixture, never executed',
    );
    await writeFile(join(source, 'node/LICENSE'), 'synthetic license');
    await mkdir(join(source, 'service/dist'), { mode: 0o700 });
    await writeFile(
      join(source, 'service/dist/main.js'),
      'synthetic public entry point',
      { mode: 0o600 },
    );
    await mkdir(join(native, 'runtime/bin'), { recursive: true, mode: 0o700 });
    await writeFile(
      join(native, 'runtime/bin/rdp-worker'),
      'synthetic executable',
      { mode: 0o700 },
    );
    await chmod(join(source, 'node'), 0o700);
    const manifest = {
      name: '@freerdp-bridge/standalone',
      private: true,
      version: '0.2.4',
      dependencies: {
        '@freerdp-bridge/api': '0.2.4',
        '@freerdp-bridge/runtime-linux-x64-gnu': '0.2.4',
      },
    };
    await writeFile(
      join(source, 'service/package.json'),
      JSON.stringify(manifest),
    );
    await writeFile(
      join(native, 'package.json'),
      JSON.stringify({ version: '0.2.4' }),
    );
    for (const unitRoot of ['lib', 'usr/lib']) {
      const root = join(scratch, unitRoot === 'lib' ? 'deb' : 'rpm');
      assert.equal(
        (await stageStandaloneLinux(source, root, resolve('.'), { unitRoot }))
          .version,
        '0.2.4',
      );
      assert.equal(
        await readFile(join(root, 'opt/freerdp-bridge/node/node'), 'utf8'),
        'synthetic staging fixture, never executed',
      );
      await access(
        join(root, unitRoot, 'systemd/system/freerdp-bridge.service'),
      );
      if (process.platform === 'linux') {
        for (const [name, mode] of [
          ['opt/freerdp-bridge/node', 0o755],
          ['opt/freerdp-bridge/node/node', 0o755],
          ['opt/freerdp-bridge/service/dist', 0o755],
          ['opt/freerdp-bridge/service/dist/main.js', 0o644],
          [
            'opt/freerdp-bridge/service/node_modules/@freerdp-bridge/runtime-linux-x64-gnu/runtime/bin/rdp-worker',
            0o755,
          ],
          ['etc/freerdp-bridge', 0o750],
          ['etc/freerdp-bridge/bridge.json', 0o640],
        ])
          assert.equal(
            (await lstat(join(root, name))).mode & 0o777,
            mode,
            name,
          );
        assert.equal(
          (await lstat(join(source, 'service/dist/main.js'))).mode & 0o777,
          0o600,
        );
        assert.equal((await lstat(join(source, 'node'))).mode & 0o777, 0o700);
      }
      assert.deepEqual(
        JSON.parse(
          await readFile(join(root, 'etc/freerdp-bridge/bridge.json'), 'utf8'),
        ).targets,
        [],
      );
      await assert.rejects(
        stageStandaloneLinux(source, root, resolve('.'), { unitRoot }),
        { code: 'EEXIST' },
      );
    }
    await assert.rejects(
      stageStandaloneLinux(source, join(scratch, 'escape'), resolve('.'), {
        unitRoot: '../../escape',
      }),
      /STANDALONE_LINUX_UNIT_ROOT_INVALID/,
    );
    await writeFile(
      join(native, 'package.json'),
      JSON.stringify({ version: '0.0.0' }),
    );
    await assert.rejects(
      stageStandaloneLinux(source, join(scratch, 'mismatch'), resolve('.')),
      /STANDALONE_LINUX_VERSION_MISMATCH/,
    );
    await assert.rejects(access(join(scratch, 'mismatch')), { code: 'ENOENT' });
  } finally {
    assert.equal(dirname(scratch), resolve(tmpdir()));
    assert.match(basename(scratch), /^bridge-linux-stage-[A-Za-z0-9]+$/);
    await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
});
