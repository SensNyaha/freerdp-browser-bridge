import test from 'node:test';
import assert from 'node:assert/strict';
import { labTransportOptions } from '../../scripts/lab-transport-options.mjs';

test('lab transport mode: strict defaults, exact approved fingerprint and explicit framed fallback', () => {
  const fingerprint = 'sha256:' + 'a'.repeat(64);
  assert.equal(labTransportOptions([]).mode, 'strict');
  for (const mode of ['strict', 'connect', 'loss']) {
    const args = mode === 'strict' ? [mode] : [mode, fingerprint];
    assert.equal(labTransportOptions(args).ipcTransport, 'auto');
    assert.equal(
      labTransportOptions([...args, '--framed']).ipcTransport,
      'framed-pipes',
    );
    assert.deepEqual(args, mode === 'strict' ? [mode] : [mode, fingerprint]);
  }
  for (const args of [
    ['ignore'],
    ['strict', fingerprint],
    ['loss'],
    ['connect', 'sha256:' + 'A'.repeat(64)],
    ['connect', fingerprint, '--other'],
    ['strict', '--framed', '--framed'],
    ['--framed', 'strict'],
    ['loss', fingerprint, fingerprint],
  ])
    assert.throws(() => labTransportOptions(args), /approved fingerprint/);
});
