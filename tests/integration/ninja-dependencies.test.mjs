import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';

test(
  'native build integration: Windows Ninja records worker header dependencies',
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
  },
);
