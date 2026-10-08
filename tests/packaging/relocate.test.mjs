import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerProcess } from '../../packages/node-bridge/dist/index.js';

const source = resolve(process.env.BRIDGE_NATIVE_STAGE ?? 'build/native-stage');
const windows = process.platform === 'win32';
const suffix = windows ? '.exe' : '';

test('native bundle relocates with its own ZLIB and FreeRDP, without dependency PATH', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'rdp-private-bundle-'));
  const relocated = join(temporary, 'relocated application');
  const env = windows
    ? {
        SystemRoot: process.env.SystemRoot,
        PATH: join(process.env.SystemRoot, 'System32'),
      }
    : { PATH: '/usr/bin:/bin' };
  try {
    await cp(source, relocated, { recursive: true });
    const files = await readdir(relocated, { recursive: true });
    assert.ok(files.every((file) => !/\.(pdb|obj|lib)$/i.test(file)));
    const probe = await promisify(execFile)(
      join(relocated, 'bin', 'rdp-runtime-check' + suffix),
      [],
      { env, cwd: temporary, windowsHide: true, timeout: 10000 },
    );
    const lines = Object.fromEntries(
      probe.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    const features = JSON.parse(
      await readFile(
        join(relocated, 'share', 'freerdp-bridge', 'native-features.json'),
        'utf8',
      ),
    );
    assert.equal(lines.zlib, features.dependencies.zlib);
    assert.equal(lines.freerdp, '3.32.1');
    for (const runtime of [lines.runtime, lines.freerdpRuntime]) {
      const loadedPath = relative(relocated, resolve(runtime));
      assert.ok(
        loadedPath &&
          !loadedPath.startsWith('..') &&
          !resolve(runtime).includes('.deps'),
      );
    }
    assert.deepEqual(
      lines.channels.split(',').filter(Boolean),
      features.enabledChannels,
    );
    const cli = await promisify(execFile)(
      join(relocated, 'bin', 'rdp-worker' + suffix),
      ['--version'],
      { env, cwd: temporary, windowsHide: true, timeout: 10000 },
    );
    assert.equal(JSON.parse(cli.stdout).freeRdpVersion, '3.32.1');
    assert.equal(JSON.parse(cli.stdout).capabilities.rdp, false);
    for (const dependency of ['zlib', 'openssl', 'libusb', 'freerdp']) {
      assert.ok(
        (
          await readFile(
            join(
              relocated,
              'share',
              'freerdp-bridge',
              'licenses',
              dependency,
              dependency === 'freerdp' ? 'LICENSE' : 'copyright',
            ),
          )
        ).length,
      );
    }
    const worker = new WorkerProcess({
      workerPath: join(relocated, 'bin', 'rdp-worker' + suffix),
      runtimeRoot: join(temporary, 'runtime'),
    });
    try {
      await worker.start();
      await worker.ping();
    } finally {
      await worker.close();
    }
    assert.deepEqual(await readdir(join(temporary, 'runtime')), []);
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
  }
});
