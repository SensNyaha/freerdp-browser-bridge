import test from 'node:test';
import assert from 'node:assert/strict';
import { audioNegotiationDiagnostics } from '../../scripts/audio-negotiation-diagnostics.mjs';
test('audio negotiation diagnostics: versioned bounded numeric fields only; incomplete/raw/overflow is not fabricated as zero', () => {
  const line =
    'bridge.audio.negotiation v=1 server=1 client=1 training=18 waves=0 writes=54 completed=54 cancelled=0 failures=0\n';
  assert.deepEqual(
    audioNegotiationDiagnostics(
      Buffer.from(
        'synthetic-secret-prefix\n' + line + 'synthetic-secret-suffix',
      ),
    ),
    {
      serverFormats: '1',
      clientFormats: '1',
      training: '18',
      waves: '0',
      writes: '54',
      completed: '54',
      cancelled: '0',
      failures: '0',
    },
  );
  for (const invalid of [
    line.trim(),
    line.replace('v=1', 'v=2'),
    line.replace('server=1', 'server=65536'),
    line.replace('writes=54', 'writes=18446744073709551616'),
    line.replace('client=1', 'client=synthetic-secret'),
    'arbitrary upstream error',
  ])
    assert.equal(audioNegotiationDiagnostics(Buffer.from(invalid)), undefined);
  assert.equal(audioNegotiationDiagnostics(line), undefined);
});
