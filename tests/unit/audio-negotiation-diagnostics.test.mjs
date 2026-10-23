import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audioNegotiationDiagnostics,
  AudioNegotiationDiagnostics,
  AudioSummaryDiagnostics,
  AudioCauseDiagnostics,
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

const sourceReceipts = [
  [
    AudioSummaryDiagnostics,
    'bridge.audio.summary',
    ['chunks', 'overflow', 'skipped', 'late', 'revisions', 'resets', 'packets'],
  ],
  [
    AudioCauseDiagnostics,
    'bridge.audio.causes',
    [
      'first',
      'profile',
      'block',
      'arrivalBackward',
      'arrivalGap',
      'timestampBackward',
      'timestampGap',
      'formats',
      'close',
    ],
  ],
];

test('audio source diagnostics preserve all stderr splits and exact uint64 counters with copied receipts', () => {
  for (const [Parser, prefix, names] of sourceReceipts) {
    const expected = Object.fromEntries(
      names.map((name, i) => [name, i % 2 ? '0' : '18446744073709551615']),
    );
    for (const ending of ['\n', '\r\n']) {
      const bytes = Buffer.from(
        prefix +
          ' ' +
          names.map((name) => name + '=' + expected[name]).join(' ') +
          ending,
      );
      for (let split = 0; split <= bytes.length; ++split) {
        const parser = new Parser();
        parser.push(bytes.subarray(0, split));
        if (split < bytes.length) assert.equal(parser.snapshot(), undefined);
        parser.push(bytes.subarray(split));
        assert.deepEqual(parser.snapshot(), expected);
        parser.snapshot()[names[0]] = '1';
        assert.deepEqual(parser.snapshot(), expected);
      }
      const parser = new Parser();
      for (const byte of bytes) parser.push(Uint8Array.of(byte));
      assert.deepEqual(parser.snapshot(), expected);
    }
  }
});

test('audio source diagnostics reject malformed or oversized fields without retaining private text or inventing zeros', () => {
  for (const [Parser, prefix, names] of sourceReceipts) {
    const line =
      prefix + ' ' + names.map((name) => name + '=0').join(' ') + '\n';
    for (const name of names) {
      for (const invalid of [
        '18446744073709551616',
        '0'.repeat(21),
        '-1',
        '',
        'synthetic-private-text',
      ]) {
        const parser = new Parser();
        parser.push(
          Buffer.from(line.replace(name + '=0', name + '=' + invalid)),
        );
        assert.equal(parser.snapshot(), undefined);
        parser.push(Buffer.from('\n' + line));
        assert.deepEqual(
          parser.snapshot(),
          Object.fromEntries(names.map((key) => [key, '0'])),
        );
      }
    }
    for (const invalid of [
      'private-prefix ' + line,
      line.replace('\n', ' extra=0\n'),
      line.replace('\n', '\rX\n'),
      line.trimEnd(),
      'private'.repeat(10000),
    ]) {
      const parser = new Parser();
      parser.push(Buffer.from(invalid));
      assert.equal(parser.snapshot(), undefined);
      parser.push(Buffer.from('\n' + line));
      assert.ok(!JSON.stringify(parser.snapshot()).includes('private'));
    }
    assert.throws(() => new Parser().push('private-input'), {
      message: 'LAB_AUDIO_DIAGNOSTIC_INPUT_INVALID',
    });
  }
});

test('audio diagnostics keep independent latest numeric source and negotiation receipts in a mixed stream', () => {
  const parsers = [
    new AudioNegotiationDiagnostics(),
    ...sourceReceipts.map(([Parser]) => new Parser()),
  ];
  const negotiation =
    'bridge.audio.negotiation v=1 server=1 client=1 training=1 waves=240 writes=483 completed=483 cancelled=0 failures=0\n';
  const sources = sourceReceipts.map(
    ([, prefix, names]) =>
      prefix + ' ' + names.map((name, i) => name + '=' + i).join(' ') + '\n',
  );
  const bytes = Buffer.from(
    'unrelated-private-text\n' + sources[0] + negotiation + sources[1],
  );
  for (let pos = 0; pos < bytes.length; pos += 7)
    for (const parser of parsers) parser.push(bytes.subarray(pos, pos + 7));
  assert.equal(parsers[0].snapshot().waves, '240');
  assert.equal(parsers[1].snapshot().resets, '5');
  assert.equal(parsers[2].snapshot().timestampGap, '6');
  for (const parser of parsers) {
    const before = parser.snapshot();
    parser.push(Buffer.from('arbitrary private next record\n'));
    assert.deepEqual(parser.snapshot(), before);
  }
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
