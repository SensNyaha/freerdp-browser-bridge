import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  realpath,
  chmod,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, toNamespacedPath } from 'node:path';
import { createHash } from 'node:crypto';
import {
  parseNativeRuntimeManifest,
  nativeRuntimePackageName,
  resolveNativeRuntime,
} from '../../packages/node-bridge/dist/native-runtime.js';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const worker =
  process.platform === 'win32' ? 'bin/rdp-worker.exe' : 'bin/rdp-worker';
function inventory(platform = process.platform) {
  const paths = [
    platform === 'linux' ? 'bin/rdp-worker' : 'bin/rdp-worker.exe',
    ...(platform === 'linux'
      ? [
          'bin/rdp-ipc.node',
          'bin/rdp-worker.ipc.json',
          'bin/rdp-runtime-check',
          'bin/rdp-process-query',
        ]
      : ['bin/rdp-runtime-directory.exe', 'bin/rdp-runtime-check.exe']),
    'share/freerdp-bridge/dependencies.json',
    'share/freerdp-bridge/native-features.json',
    'share/freerdp-bridge/licenses/freerdp/LICENSE',
  ];
  return {
    schema: 1,
    productVersion: version,
    freeRdpVersion: '3.32.1',
    freeRdpCommit: 'bf217a504e54cc719880c228e82353382cd7d4fa',
    platform,
    arch: 'x64',
    files: paths.map((path) => ({
      path,
      bytes: 1,
      sha256: createHash('sha256').update('x').digest('hex'),
    })),
  };
}

test('native npm inventory binds platform/version/pinned FreeRDP and bounds file paths/count/bytes before I/O', () => {
  for (const platform of ['win32', 'linux']) {
    const good = inventory(platform);
    assert.equal(
      parseNativeRuntimeManifest(good, version, platform).files.length,
      good.files.length,
    );
    for (const mutate of [
      (value) => {
        value.productVersion = '99.0.0';
      },
      (value) => {
        value.platform = 'darwin';
      },
      (value) => {
        value.freeRdpCommit = '0'.repeat(40);
      },
      (value) => {
        value.freeRdpVersion = '2.0.0';
      },
      (value) => {
        value.files.length = 513;
      },
      (value) => {
        value.files[0].path = '../../PRIVATE-CANARY';
      },
      (value) => {
        value.files[0].path = 'bin/../PRIVATE-CANARY';
      },
      (value) => {
        value.files[0].path = 'bin/C:\\PRIVATE-CANARY';
      },
      (value) => {
        value.files[0].bytes = 67108865;
      },
      (value) => {
        value.files[0].bytes = 0;
      },
      (value) => {
        value.files[0].sha256 = 'no';
      },
      (value) => {
        value.files.push({
          ...value.files[0],
          path: value.files[0].path.toUpperCase(),
        });
      },
      (value) => {
        value.files.shift();
      },
      (value) => {
        value.secret = 'PRIVATE-CANARY';
      },
    ]) {
      const invalid = structuredClone(good);
      mutate(invalid);
      assert.throws(
        () => parseNativeRuntimeManifest(invalid, version, platform),
        (error) => {
          assert.match(error.code, /^NATIVE_RUNTIME_(INVALID|MISMATCH)$/);
          assert.equal(String(error).includes('PRIVATE-CANARY'), false);
          return true;
        },
      );
    }
  }
});

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'rdp-native-package-'));
  const manifest = inventory();
  try {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: nativeRuntimePackageName(process.platform),
        version,
      }),
    );
    for (const file of manifest.files) {
      const path = join(root, 'runtime', file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'x');
      if (
        process.platform === 'linux' &&
        [
          'bin/rdp-worker',
          'bin/rdp-runtime-check',
          'bin/rdp-process-query',
        ].includes(file.path)
      )
        await chmod(path, 0o755);
    }
    if (process.platform === 'linux') {
      const hash = createHash('sha256').update('x').digest('hex');
      const pair = Buffer.from(
        JSON.stringify({
          v: 1,
          transport: 'unix-seqpacket-rws1',
          worker: 'rdp-worker',
          adapter: 'rdp-ipc.node',
          maxPairs: 32,
          workerSha256: hash,
          adapterSha256: hash,
        }),
      );
      await writeFile(join(root, 'runtime/bin/rdp-worker.ipc.json'), pair);
      Object.assign(
        manifest.files.find((file) => file.path === 'bin/rdp-worker.ipc.json'),
        {
          bytes: pair.length,
          sha256: createHash('sha256').update(pair).digest('hex'),
        },
      );
    }
    await writeFile(
      join(root, 'runtime-manifest.json'),
      JSON.stringify(manifest),
    );
    await run(root, manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('native npm resolver verifies an explicit complete inventory without running any worker or creating runtime entries', async () => {
  await fixture(async (root) => {
    const options = await resolveNativeRuntime({
      packageDirectory: root,
      runtimeRoot: join(root, 'private-session-root'),
    });
    assert.equal(
      options.workerPath,
      toNamespacedPath(join(await realpath(root), 'runtime', worker)),
    );
    assert.equal(options.ipcTransport, 'auto');
  });
});

test('native npm resolver refuses tampering, missing metadata, unlisted payload and version drift with fixed secret-free errors', async () => {
  for (const mutate of [
    ...(process.platform === 'linux'
      ? [(root) => chmod(join(root, 'runtime', worker), 0o644)]
      : []),
    ...(process.platform === 'linux'
      ? [
          async (root) => {
            const target = join(root, 'runtime', worker);
            await rm(target);
            await symlink(
              join(
                root,
                'runtime/share/freerdp-bridge/licenses/freerdp/LICENSE',
              ),
              target,
            );
          },
        ]
      : []),
    (root) => writeFile(join(root, 'runtime', worker), 'y'),
    (root) => writeFile(join(root, 'runtime-manifest.json'), '{PRIVATE-CANARY'),
    (root) =>
      writeFile(join(root, 'runtime/bin/unlisted.dll'), 'PRIVATE-CANARY'),
    (root) => rm(join(root, 'runtime-manifest.json')),
    (root) =>
      writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: nativeRuntimePackageName(process.platform),
          version: '99.0.0',
        }),
      ),
  ])
    await fixture(async (root) => {
      await mutate(root);
      await assert.rejects(
        resolveNativeRuntime({
          packageDirectory: root,
          runtimeRoot: join(root, 'private'),
        }),
        (error) => {
          assert.match(
            error.code,
            /^NATIVE_RUNTIME_(INVALID|INTEGRITY|MISMATCH|PERMISSION)$/,
          );
          assert.equal(String(error).includes('PRIVATE-CANARY'), false);
          assert.equal(String(error).includes(root), false);
          return true;
        },
      );
    });
  await assert.rejects(resolveNativeRuntime({ runtimeRoot: 'relative' }), {
    code: 'NATIVE_RUNTIME_ROOT',
  });
});
