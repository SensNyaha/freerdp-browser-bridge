import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseStandaloneInventoryArgs } from '../../apps/standalone/dist/inventory.js';

const root = resolve('build/owned-inventory-fixture');
const args = (selection = 'usb,serial', maximum = '16') => [
  '--inventory',
  selection,
  '--runtime-root',
  root,
  '--max-devices',
  maximum,
];
test('standalone inventory requires explicit unique classes, private absolute runtime and bounded decimal count', () => {
  assert.deepEqual(parseStandaloneInventoryArgs(args()), {
    runtimeRoot: root,
    request: { classes: ['serial', 'usb'], maxDevices: 16 },
  });
  assert.equal(
    parseStandaloneInventoryArgs(args('printers', '128')).request.maxDevices,
    128,
  );
  for (const value of [
    '',
    'usb,usb',
    'all',
    'browser',
    'usb,',
    ' usb',
    'usb;serial',
    'usb,smartcards,printers,serial,parallel,usb',
    'u'.repeat(65),
  ])
    assert.throws(
      () => parseStandaloneInventoryArgs(args(value)),
      /^Error: STANDALONE_INVENTORY_USAGE$/,
    );
  for (const value of [
    '0',
    '129',
    '-1',
    '1.5',
    '1e2',
    '0x10',
    '01',
    'Infinity',
    'NaN',
    '1000',
    ' 1',
  ])
    assert.throws(
      () => parseStandaloneInventoryArgs(args('usb', value)),
      /^Error: STANDALONE_INVENTORY_USAGE$/,
    );
  const relative = args();
  relative[3] = 'relative';
  assert.throws(() => parseStandaloneInventoryArgs(relative));
  for (let count = 0; count < 6; count++)
    assert.throws(() => parseStandaloneInventoryArgs(args().slice(0, count)));
  for (const extra of ['--config', '--supervised', '--password'])
    assert.throws(() => parseStandaloneInventoryArgs([...args(), extra]));
});
test('standalone inventory CLI refuses bad selectors without opening config, server or worker and emits only a fixed error', () => {
  for (const selected of ['PRIVATE-owned-invalid', 'usb,usb']) {
    const child = spawnSync(
      process.execPath,
      [resolve('apps/standalone/dist/main.js'), ...args(selected)],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 8192, windowsHide: true },
    );
    assert.ifError(child.error);
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.deepEqual(JSON.parse(child.stderr), {
      code: 'STANDALONE_INVENTORY_FAILED',
    });
    assert.ok(!child.stderr.includes('PRIVATE-owned-invalid'));
  }
});
