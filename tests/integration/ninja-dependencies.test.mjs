import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve, join, win32 } from 'node:path';
import {
  rebaseWindowsBuildPath,
  windowsFreeRdpBuildPath,
} from '../fixtures/cmake-paths.mjs';

test(
  'native build integration: Windows Ninja tracks headers and refreshes private runtimes',
  { skip: process.platform !== 'win32' },
  async () => {
    const binaryDir = resolve(
      process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
    );
    const cache = await readFile(join(binaryDir, 'CMakeCache.txt'), 'utf8');
    const ninjaPath = cache
      .match(/^CMAKE_MAKE_PROGRAM:FILEPATH=(.+)$/m)?.[1]
      .trim();
    assert.ok(
      ninjaPath,
      'Ninja must be configured before native integration tests',
    );
    const { stdout } = await promisify(execFile)(
      ninjaPath,
      [
        '-C',
        binaryDir,
        '-t',
        'deps',
        'CMakeFiles/rdp-worker.dir/native/rdp-worker/main.cpp.obj',
      ],
      { windowsHide: true },
    );
    assert.match(stdout, /#deps [1-9][0-9]*,/);
    assert.ok(
      stdout.replaceAll('\\', '/').includes('/native/ipc/protocol.hpp'),
      'Worker ABI headers must be tracked so a header-only change cannot retain stale objects',
    );
    if (/^BRIDGE_WITH_FREERDP:BOOL=ON\r?$/m.test(cache)) {
      const configuredPrefix = cache
        .match(/^BRIDGE_FREERDP_PREFIX:PATH=(.+)$/m)?.[1]
        .trim();
      const configuredBuild = cache
        .match(/^CMAKE_CACHEFILE_DIR:INTERNAL=(.+)$/m)?.[1]
        .trim();
      assert.ok(configuredPrefix && configuredBuild);
      // The build helper removes its temporary subst alias after building.
      const freerdpPrefix = rebaseWindowsBuildPath(
        binaryDir,
        configuredBuild,
        configuredPrefix,
      );
      for (const runtime of [
        'freerdp3.dll',
        'freerdp-client3.dll',
        'winpr3.dll',
      ]) {
        const hash = async (path) =>
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex');
        assert.equal(
          await hash(join(binaryDir, runtime)),
          await hash(join(freerdpPrefix, 'bin', runtime)),
          'Runtime copies must match the private prefix even without an executable relink',
        );
      }
      const freerdpDir = windowsFreeRdpBuildPath(
        binaryDir,
        configuredBuild,
        configuredPrefix,
      );
      const sdkCache = await readFile(
        join(freerdpDir, 'CMakeCache.txt'),
        'utf8',
      );
      const sdkBuild = sdkCache
        .match(/^CMAKE_CACHEFILE_DIR:INTERNAL=(.+)$/m)?.[1]
        .trim();
      const sdkInstalled = sdkCache
        .match(/^CMAKE_INSTALL_PREFIX:PATH=(.+)$/m)?.[1]
        .trim();
      assert.ok(sdkBuild && sdkInstalled);
      assert.equal(
        rebaseWindowsBuildPath(
          freerdpDir,
          sdkBuild,
          sdkInstalled,
        ).toLowerCase(),
        freerdpPrefix.toLowerCase(),
        'Tracked C objects must belong to the SDK actually consumed by this worker',
      );
      for (const object of [
        'libfreerdp/CMakeFiles/freerdp.dir/gdi/gfx.c.obj',
        'libfreerdp/codec/CMakeFiles/freerdp-codecs.dir/h264.c.obj',
      ]) {
        const dependencies = await promisify(execFile)(
          ninjaPath,
          ['-C', freerdpDir, '-t', 'deps', object],
          { windowsHide: true },
        );
        assert.match(dependencies.stdout, /#deps [1-9][0-9]*,/);
        assert.ok(
          dependencies.stdout
            .split(/\r?\n/)
            .some(
              (line) =>
                rebaseWindowsBuildPath(
                  freerdpDir,
                  sdkBuild,
                  win32.resolve(sdkBuild, line.trim()),
                ).toLowerCase() ===
                join(
                  freerdpDir,
                  'include',
                  'freerdp',
                  'config.h',
                ).toLowerCase(),
            ),
          'C-only FreeRDP objects must track feature headers to match the installed decoder configuration',
        );
      }
    }
  },
);
