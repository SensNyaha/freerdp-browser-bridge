import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
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
    assert.equal(lines.jpegRoundtrip, 'true');
    assert.equal(lines.h264Roundtrip, 'true');
    assert.equal(lines.freerdpAvc420Roundtrip, 'true');
    assert.equal(lines.opusRoundtrip, 'true');
    assert.equal(lines.opus, `libopus ${features.dependencies.opus}`);
    assert.match(
      basename(lines.opusRuntime),
      windows ? /^opus\.dll$/i : /^libopus\.so(?:\..*)?$/,
    );
    assert.equal(features.diagnostics.openH264, true);
    assert.equal(features.diagnostics.gfxH264, true);
    assert.equal(features.diagnostics.openH264DynamicLoading, false);
    assert.equal(lines.openh264, features.dependencies.openh264);
    for (const runtime of [
      lines.runtime,
      lines.freerdpRuntime,
      lines.jpegRuntime,
      lines.openh264Runtime,
      lines.opusRuntime,
    ]) {
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
    assert.equal(JSON.parse(cli.stdout).capabilities.jpegCapture, true);
    assert.equal(JSON.parse(cli.stdout).capabilities.h264Capture, true);
    assert.equal(JSON.parse(cli.stdout).capabilities.basicInput, true);
    assert.ok(features.codecProviders.includes('libjpeg-turbo'));
    assert.ok(features.codecProviders.includes('openh264'));
    assert.ok(features.codecProviders.includes('libopus'));
    const opusVersionPatch = await readFile(
      join(
        relocated,
        'share',
        'freerdp-bridge',
        'ports',
        'opus',
        '001-pinned-package-version.patch',
      ),
    );
    assert.equal(
      createHash('sha256').update(opusVersionPatch).digest('hex'),
      features.portOverlays.opus.versionPatchSha256,
    );
    const patch = await readFile(
      join(
        relocated,
        'share',
        'freerdp-bridge',
        'ports',
        'openh264',
        '002-relative-windows-nasm-includes.patch',
      ),
    );
    assert.equal(
      createHash('sha256').update(patch).digest('hex'),
      features.portOverlays.openh264.nasmPatchSha256,
    );
    const simdPatch = await readFile(
      join(
        relocated,
        'share',
        'freerdp-bridge',
        'ports',
        'openh264',
        '003-enable-windows-x86-simd.patch',
      ),
    );
    assert.equal(
      createHash('sha256').update(simdPatch).digest('hex'),
      features.portOverlays.openh264.simdPatchSha256,
    );
    for (const dependency of [
      'zlib',
      'openssl',
      'libusb',
      'freerdp',
      'libjpeg-turbo',
      'libspng',
      'openh264',
      'opus',
    ]) {
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
