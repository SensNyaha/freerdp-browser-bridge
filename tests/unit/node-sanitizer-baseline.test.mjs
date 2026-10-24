import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sanitizerControlEnvironment,
  runSanitizerControl,
  verifyNodeSanitizerBaseline,
} from '../../scripts/node-sanitizer-baseline.mjs';

const environment = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
};

test('sanitizer controls reject inherited suppressions, loader overrides and Node injections', () => {
  for (const name of [
    'ASAN_OPTIONS',
    'LSAN_OPTIONS',
    'UBSAN_OPTIONS',
    'LD_PRELOAD',
    'LD_AUDIT',
    'LD_LIBRARY_PATH',
    'NODE_OPTIONS',
    'NODE_PATH',
  ])
    assert.throws(
      () =>
        sanitizerControlEnvironment('/opt/node/bin/node', {
          [name]: 'override',
        }),
      { message: 'SANITIZER_CONTROL_ENVIRONMENT_OVERRIDE' },
    );
  assert.deepEqual(
    sanitizerControlEnvironment('/opt/node/bin/node', { SECRET: 'private' }),
    {
      PATH: '/opt/node/bin:/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
    },
  );
});

test('actual control process rejects sanitizer diagnostics even when child exits zero', async () => {
  for (const diagnostic of [
    'ERROR: AddressSanitizer: heap-use-after-free',
    'ERROR: LeakSanitizer: detected memory leaks',
    'runtime error: signed integer overflow',
    'UndefinedBehaviorSanitizer: undefined-behavior',
  ]) {
    const result = await runSanitizerControl(
      process.execPath,
      `process.stderr.write(${JSON.stringify(diagnostic)})`,
      { env: environment },
    );
    assert.equal(result.code, 0);
    assert.equal(result.diagnostic, true);
    assert.equal(result.passed, false);
  }
});

test('actual control process must finish within its deadline and bounded output', async () => {
  const timed = await runSanitizerControl(
    process.execPath,
    'setInterval(() => {}, 1000)',
    {
      env: environment,
      timeoutMs: 500,
    },
  );
  assert.equal(timed.passed, false);
  assert.equal(timed.timedOut, true);
  const flood = await runSanitizerControl(
    process.execPath,
    'process.stderr.write(Buffer.alloc(2 * 1024 * 1024, 65))',
    { env: environment },
  );
  assert.equal(flood.passed, false);
  assert.equal(flood.outputExceeded, true);
  assert.ok(Buffer.byteLength(flood.stderr) <= 1024 * 1024);
});

test(
  'ordinary release Node cannot produce an accepted ASan baseline',
  {
    skip: process.config.variables.asan === 1,
  },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'bridge-sanitizer-baseline-'),
    );
    try {
      await assert.rejects(
        verifyNodeSanitizerBaseline(process.execPath, directory),
        {
          message: 'SANITIZER_NODE_BASELINE_FAILED',
        },
      );
      const receipt = JSON.parse(
        await readFile(join(directory, 'node-sanitizer-baseline.json'), 'utf8'),
      );
      assert.equal(receipt.passed, false);
      assert.equal(receipt.bridgeAddonLoaded, false);
      assert.equal(receipt.controls.length, 1);
      assert.equal(receipt.controls[0].name, 'identity');
      assert.equal(receipt.controls[0].passed, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test('missing runtime invalidates an existing successful baseline instead of preserving stale acceptance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-sanitizer-baseline-'));
  try {
    const receipt = join(directory, 'node-sanitizer-baseline.json');
    await writeFile(receipt, JSON.stringify({ schema: 1, passed: true }));
    await assert.rejects(
      verifyNodeSanitizerBaseline(join(directory, 'absent-node'), directory),
    );
    assert.deepEqual(JSON.parse(await readFile(receipt, 'utf8')), {
      schema: 1,
      passed: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'an executable that exits successfully without running the Node identity control is refused',
  {
    skip: process.platform !== 'linux',
  },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'bridge-sanitizer-baseline-'),
    );
    try {
      await assert.rejects(
        verifyNodeSanitizerBaseline(
          existsSync('/bin/true') ? '/bin/true' : '/usr/bin/true',
          directory,
        ),
        {
          message: 'SANITIZER_NODE_BASELINE_FAILED',
        },
      );
      const receipt = JSON.parse(
        await readFile(join(directory, 'node-sanitizer-baseline.json'), 'utf8'),
      );
      assert.equal(receipt.passed, false);
      assert.equal(receipt.controls[0].exitCode, 0);
      assert.equal(receipt.controls[0].passed, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
