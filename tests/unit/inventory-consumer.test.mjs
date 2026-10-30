import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  inventoryConsumerArguments,
  inventoryConsumerTypes,
  prepareInventoryConsumer,
} from '../../scripts/inventory-consumer.mjs';
test('installed inventory is opt-in in development and mandatory from 0.7, preserving all other arguments', () => {
  const args = ['--managed-files', '--archives', 'build/exact'];
  assert.deepEqual(inventoryConsumerArguments(args, '0.6.0'), {
    args,
    hostInventory: false,
  });
  for (const version of ['0.7.0', '0.7.1', '0.8.0'])
    assert.deepEqual(inventoryConsumerArguments(args, version), {
      args,
      hostInventory: true,
    });
  assert.deepEqual(
    inventoryConsumerArguments([...args, '--host-inventory'], '0.6.0'),
    { args, hostInventory: true },
  );
  for (const value of [null, [1], ['--host-inventory', '--host-inventory']])
    assert.throws(() => inventoryConsumerArguments(value, '0.6.0'));
  assert.throws(() => inventoryConsumerArguments([], '0.7.0-PRIVATE-owned'));
});
test('four independent consumers receive strict inventory types and a checkout-free actual native fixture without weakening their tsconfig', async () => {
  const root = await mkdtemp(
    join(tmpdir(), 'bridge-inventory-consumer-controls-'),
  );
  try {
    for (const kind of ['http', 'express', 'fastify', 'nestjs']) {
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { strict: true, skipLibCheck: false },
          include: ['consumer.ts', 'managed-files.ts'],
        }),
      );
      await prepareInventoryConsumer(root, kind);
      assert.deepEqual(
        JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8')),
        {
          compilerOptions: { strict: true, skipLibCheck: false },
          include: ['consumer.ts', 'managed-files.ts', 'host-inventory.ts'],
        },
      );
      assert.equal(
        await readFile(join(root, 'host-inventory.ts'), 'utf8'),
        inventoryConsumerTypes(kind),
      );
      const fixture = await readFile(join(root, 'host-inventory.mjs'), 'utf8');
      assert.ok(!/from ['"]\.\.?\//.test(fixture));
      assert.match(fixture, /automaticPackagedRuntime:\s*true/);
      await assert.rejects(prepareInventoryConsumer(root, kind));
    }
    assert.throws(() => inventoryConsumerTypes('unknown'));
  } finally {
    for (const file of [
      'tsconfig.json',
      'host-inventory.ts',
      'host-inventory.mjs',
    ])
      await unlink(join(root, file));
    await rmdir(root);
  }
});
