import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audioNegotiationDiagnostics,
  AudioNegotiationDiagnostics,
} from '../../scripts/audio-negotiation-diagnostics.mjs';
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

test('audio negotiation stream preserves every stderr split, CRLF, exact counters and copied latest ownership', () => {
  for (const ending of ['\n', '\r\n']) {
    const bytes = Buffer.from(
      'bridge.audio.negotiation v=1 server=65535 client=1 training=18 waves=18446744073709551615 writes=54 completed=54 cancelled=0 failures=0' +
        ending,
    );
    const expected = audioNegotiationDiagnostics(bytes);
    for (let split = 0; split <= bytes.length; ++split) {
      const parser = new AudioNegotiationDiagnostics();
      parser.push(bytes.subarray(0, split));
      if (split < bytes.length) assert.equal(parser.snapshot(), undefined);
      parser.push(bytes.subarray(split));
      assert.deepEqual(parser.snapshot(), expected);
      const copy = parser.snapshot();
      copy.waves = '0';
      assert.equal(parser.snapshot().waves, '18446744073709551615');
    }
    const parser = new AudioNegotiationDiagnostics();
    for (const byte of bytes) parser.push(Uint8Array.of(byte));
    assert.deepEqual(parser.snapshot(), expected);
    parser.push(
      Buffer.from(bytes.toString().replace('training=18', 'training=0')),
    );
    assert.equal(parser.snapshot().training, '0');
  }
});

test('audio negotiation stream distinguishes missing receipt from zero and recovers after invalid or oversized lines', () => {
  const line =
    'bridge.audio.negotiation v=1 server=0 client=0 training=0 waves=0 writes=0 completed=0 cancelled=0 failures=0\n';
  for (const invalid of [
    'synthetic-private-text\n',
    'prefix ' + line,
    line.replace('v=1', 'v=2'),
    line.replace('server=0', 'server=65536'),
    line.replace('client=0', 'client=000000'),
    line.replace('waves=0', 'waves=18446744073709551616'),
    line.replace('waves=0', 'waves=-1'),
    line.replace('training=0', 'training=' + '0'.repeat(21)),
    line.replace('cancelled=0', 'cancelled=synthetic-private-text'),
    line.replace(' failures=0', ' extra=0 failures=0'),
    line.replace('\n', '\rX\n'),
    line.trimEnd(),
    'x'.repeat(10000),
  ]) {
    const parser = new AudioNegotiationDiagnostics();
    parser.push(Buffer.from(invalid));
    assert.equal(parser.snapshot(), undefined);
    parser.push(Buffer.from('\n' + line));
    assert.deepEqual(
      parser.snapshot(),
      audioNegotiationDiagnostics(Buffer.from(line)),
    );
    assert.ok(!JSON.stringify(parser.snapshot()).includes('private'));
  }
  const parser = new AudioNegotiationDiagnostics();
  assert.throws(() => parser.push(line), {
    message: 'LAB_AUDIO_DIAGNOSTIC_INPUT_INVALID',
  });
});
