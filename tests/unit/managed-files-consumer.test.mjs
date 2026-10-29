import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  managedFilesArguments,
  managedFilesConsumerTypes,
  prepareManagedFilesConsumer,
} from '../../scripts/managed-files-consumer.mjs';

test('installed file checks are explicit for historical versions and mandatory from 0.6', () => {
  const legacy = ['--registry-only', '--archives', 'build/exact'];
  assert.deepEqual(managedFilesArguments(legacy, '0.5.0'), {
    args: legacy,
    managedFiles: false,
  });
  assert.deepEqual(
    managedFilesArguments(['--managed-files', ...legacy], '0.5.0'),
    { args: legacy, managedFiles: true },
  );
  assert.deepEqual(legacy, ['--registry-only', '--archives', 'build/exact']);
  for (const version of ['0.6.0', '0.10.1', '1.0.0', '2.1.0'])
    assert.equal(managedFilesArguments([], version).managedFiles, true);
  for (const version of ['0.5', '0.6.0-beta', '00.6.0', '', '1'.repeat(40)])
    assert.throws(() => managedFilesArguments([], version));
  assert.throws(() =>
    managedFilesArguments(['--managed-files', '--managed-files'], '0.5.0'),
  );
  assert.throws(() => managedFilesArguments([null], '0.5.0'));
});

test('file type consumers use only the selected installed adapter and preserve existing strict compiler configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'file-consumer-types-'));
  try {
    for (const kind of ['http', 'express', 'fastify', 'nestjs']) {
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { strict: true, skipLibCheck: false },
          include: ['consumer.ts'],
        }),
      );
      await prepareManagedFilesConsumer(root, kind);
      const config = JSON.parse(
        await readFile(join(root, 'tsconfig.json'), 'utf8'),
      );
      assert.deepEqual(config, {
        compilerOptions: { strict: true, skipLibCheck: false },
        include: ['consumer.ts', 'managed-files.ts'],
      });
      const types = await readFile(join(root, 'managed-files.ts'), 'utf8');
      assert.equal(types, managedFilesConsumerTypes(kind));
      assert.ok(types.includes("from '@freerdp-bridge/" + kind + "'"));
      const fixture = await readFile(join(root, 'managed-files.mjs'), 'utf8');
      assert.ok(!/from ['"]\.\.?\//.test(fixture));
      assert.ok(fixture.includes('syntheticRdpOnly: true'));
      await assert.rejects(prepareManagedFilesConsumer(root, kind));
    }
    assert.throws(() => managedFilesConsumerTypes('unknown'));
  } finally {
    for (const name of [
      'tsconfig.json',
      'managed-files.ts',
      'managed-files.mjs',
    ])
      await unlink(join(root, name));
    await rmdir(root);
  }
});
