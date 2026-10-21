import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ownedPointerReader,
  ownedInputStateReader,
  parseOwnedInputState,
} from '../../scripts/owned-xrdp-pointer.mjs';

test('owned pointer CLI refuses the default external lab before loading credentials or connecting', () => {
  const env = { ...process.env };
  delete env.BRIDGE_LAB_PROFILE;
  for (const flag of ['--owned-pointer-test', '--owned-held-loss-test']) {
    const child = spawnSync(
      process.execPath,
      [
        'scripts/test-xrdp-viewer.mjs',
        'sha256:' + '0'.repeat(64),
        'jpeg',
        flag,
        'build/native-clean-unused/receipt.json',
      ],
      { env, encoding: 'utf8', timeout: 5000, maxBuffer: 4096 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /LAB_OWNED_TARGET_REFUSED/);
    assert.doesNotMatch(child.stderr, /LAB_CONFIGURATION_UNAVAILABLE|ENOENT/);
  }
});

test('owned application readback refuses oversized, malformed or foreign metadata before Docker', async () => {
  const original = process.cwd();
  const root = await mkdtemp(resolve('build/owned-pointer-refusal-'));
  await mkdir(join(root, '.local-tests'));
  try {
    process.chdir(root);
    for (const value of [
      'x'.repeat(8193),
      '{invalid-private-marker',
      JSON.stringify({
        v: 1,
        container: 'a'.repeat(64),
        host: '192.168.21.149',
        port: 3391,
        hostMounts: 0,
      }),
    ]) {
      await writeFile('.local-tests/owned-xrdp-lab.receipt.json', value);
      await assert.rejects(ownedPointerReader(), (error) => {
        assert.equal(error.message, 'LAB_OWNED_POINTER_TARGET_REFUSED');
        assert.equal(error.cause, undefined);
        return true;
      });
      await assert.rejects(
        ownedInputStateReader(),
        /LAB_OWNED_POINTER_TARGET_REFUSED/,
      );
    }
  } finally {
    process.chdir(original);
    await rm(root, { recursive: true, force: true });
  }
});

test('owned X11 input receipt accepts only the fixed bounded key/button schema', () => {
  const valid = { v: 1, controlLeft: true, buttons: 5 };
  assert.deepEqual(parseOwnedInputState(JSON.stringify(valid)), valid);
  for (const value of [
    null,
    '',
    '{private-marker',
    'x'.repeat(129),
    'null',
    '[]',
    JSON.stringify({ ...valid, v: 2 }),
    JSON.stringify({ ...valid, controlLeft: 1 }),
    JSON.stringify({ ...valid, buttons: -1 }),
    JSON.stringify({ ...valid, buttons: 8 }),
    JSON.stringify({ ...valid, buttons: 0.5 }),
    JSON.stringify({ ...valid, private: 'private-marker' }),
  ])
    assert.throws(() => parseOwnedInputState(value), {
      message: 'LAB_OWNED_INPUT_STATE_INVALID',
    });
});
