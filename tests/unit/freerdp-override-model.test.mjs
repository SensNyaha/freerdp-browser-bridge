import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { freeRdpOverrideInventory } from '../../scripts/freerdp-override-model.mjs';

const pin = 'bf217a504e54cc719880c228e82353382cd7d4fa';
const recipe = readFileSync(
  new URL('../../native/freerdp-dsp-override.cmake', import.meta.url),
);
const manifest = {
  schema: 1,
  id: 'dsp-opus-reset-ownership-v1',
  sourceCommit: pin,
  sourceSha256:
    '40715894dc14e2869c64bbf3ebfcf209fe12483890ffb709133d7034f32ad10f',
  recipeSha256:
    '6e0d1b10ae4e85effeaf4f2e91b15a140028d4bc7c6f46fb6f4ab5c6923847dd',
  outputSha256:
    'f1da137622368914628be9ef79888186bb6a9a1dc7e5fa77771535c061dae35a',
};
const bytes = (value) => Buffer.from(JSON.stringify(value));
const invalid = (fn) =>
  assert.throws(fn, { message: 'FREERDP_OVERRIDE_INVALID' });

test('SPDX override projection binds exact artifact bytes and excludes arbitrary metadata', () => {
  const input = bytes({
    ...manifest,
    privateValue: 'synthetic-secret',
    path: 'C:/private/local',
  });
  const result = freeRdpOverrideInventory(pin, input, recipe);
  assert.ok(result.sourceInfo.includes(manifest.id));
  assert.ok(result.sourceInfo.includes(manifest.outputSha256));
  assert.equal(result.files.length, 2);
  assert.equal(
    result.files[0].sha256,
    createHash('sha256').update(input).digest('hex'),
  );
  assert.equal(
    result.files[1].sha256,
    createHash('sha256').update(recipe).digest('hex'),
  );
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  assert.ok(!JSON.stringify(result).includes('C:/private'));
  const lf = recipe.toString('utf8').replaceAll('\r\n', '\n');
  for (const variant of [
    Buffer.from(lf),
    Buffer.from(lf.replaceAll('\n', '\r\n')),
  ])
    assert.equal(
      freeRdpOverrideInventory(pin, input, variant).sourceInfo,
      result.sourceInfo,
    );
});

test('SPDX override admission refuses incomplete, oversized, malformed, changed and unknown corrections', () => {
  for (const [metadata, code] of [
    [undefined, recipe],
    [bytes(manifest), undefined],
    [Buffer.alloc(4097), recipe],
    [bytes(manifest), Buffer.alloc(131073)],
    [Buffer.from('{'), recipe],
    [bytes(null), recipe],
    [bytes([]), recipe],
    [bytes(manifest), Buffer.concat([recipe, Buffer.from('changed')])],
    ['not bytes', recipe],
  ])
    invalid(() => freeRdpOverrideInventory(pin, metadata, code));
  for (const key of Object.keys(manifest)) {
    const changed = { ...manifest, [key]: key === 'schema' ? '1' : 'unknown' };
    invalid(() => freeRdpOverrideInventory(pin, bytes(changed), recipe));
    const missing = { ...manifest };
    delete missing[key];
    invalid(() => freeRdpOverrideInventory(pin, bytes(missing), recipe));
  }
  invalid(() =>
    freeRdpOverrideInventory('0'.repeat(40), bytes(manifest), recipe),
  );
});

test('historical artifact without correction metadata explicitly leaves modification status unestablished', () => {
  const result = freeRdpOverrideInventory(pin, undefined, undefined);
  assert.deepEqual(result.files, []);
  assert.ok(result.sourceInfo.includes('override metadata absent'));
  assert.ok(result.sourceInfo.includes('modification status not established'));
  assert.ok(!result.sourceInfo.includes(manifest.id));
});
