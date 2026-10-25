import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceStandaloneLock } from '../../scripts/standalone/advance-lock.mjs';
for (const platform of ['win32-x64', 'linux-x64-gnu'])
  for (const version of ['0.2.99', '0.3.0'])
    test(
      'standalone ' +
        platform +
        ' ' +
        version +
        ' version advance preserves external graph and refuses dependency/platform drift',
      async () => {
        const lock = JSON.parse(
          await readFile(
            'packaging/standalone/locks/' + platform + '.json',
            'utf8',
          ),
        );
        const before = structuredClone(lock);
        const archives = Object.entries(lock.packages)
          .filter(([path]) => path.startsWith('node_modules/@freerdp-bridge/'))
          .map(([path, value]) => {
            const metadata = structuredClone(value);
            metadata.name = path.slice('node_modules/'.length);
            metadata.version = version;
            for (const field of [
              'dependencies',
              'optionalDependencies',
              'peerDependencies',
            ])
              for (const name of Object.keys(metadata[field] ?? {}))
                if (name.startsWith('@freerdp-bridge/'))
                  metadata[field][name] = version;
            return {
              metadata,
              integrity: 'sha512-' + Buffer.alloc(64, 2).toString('base64'),
            };
          });
        const result = advanceStandaloneLock(lock, version, platform, archives);
        assert.deepEqual(lock, before);
        assert.equal(result.version, version);
        for (const [path, value] of Object.entries(lock.packages))
          if (path && !path.startsWith('node_modules/@freerdp-bridge/'))
            assert.deepEqual(result.packages[path], value);
        const archiveBefore = structuredClone(archives);
        for (const mutate of [
          (a) => a.pop(),
          (a) => a.push(a[0]),
          (a) => (a[0].metadata.version = '0.0.0'),
          (a) => (a[0].metadata.dependencies = { unexpected: '1.0.0' }),
          (a) => (a[0].metadata.cpu = ['other']),
          (a) => (a[0].metadata.license = 'unknown'),
          (a) => (a[0].metadata.engines = { node: '*' }),
          (a) => (a[0].metadata.bin = { unexpected: 'runtime/bin/other' }),
          (a) => (a[0].integrity = 'bad'),
        ]) {
          const changed = structuredClone(archives);
          mutate(changed);
          assert.throws(
            () => advanceStandaloneLock(lock, version, platform, changed),
            /STANDALONE_LOCK_ADVANCE_REQUIRES_GRAPH_RESOLUTION/,
          );
        }
        assert.deepEqual(archives, archiveBefore);
      },
    );
