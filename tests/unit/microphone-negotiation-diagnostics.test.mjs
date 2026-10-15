import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneNegotiationDiagnostics } from '../../scripts/microphone-negotiation-diagnostics.mjs';

const line =
  'bridge.microphone.negotiation v=1 channels=1 versions=1 offers=1 server=4 client=2 opens=3 refused=2 recording=2 failures=0\n';
test('microphone negotiation diagnostics preserve every fragmentation and exact uint64 values', () => {
  for (const ending of ['\n', '\r\n']) {
    const bytes = Buffer.from(line.replace(/\n$/, ending));
    for (let split = 0; split <= bytes.length; split++) {
      const parser = new MicrophoneNegotiationDiagnostics();
      parser.push(bytes.subarray(0, split));
      parser.push(bytes.subarray(split));
      assert.deepEqual(parser.snapshot(), {
        channels: '1',
        versions: '1',
        offers: '1',
        server: '4',
        client: '2',
        opens: '3',
        refused: '2',
        recording: '2',
        failures: '0',
      });
      const changed = parser.snapshot();
      changed.opens = '999';
      assert.equal(parser.snapshot().opens, '3');
      for (const byte of Buffer.from(
        line.replace('opens=3', 'opens=18446744073709551615'),
      ))
        parser.push(Uint8Array.of(byte));
      assert.equal(parser.snapshot().opens, '18446744073709551615');
    }
  }
});
test('microphone negotiation diagnostics discard untrusted lines, malformed fields and excessive claims', () => {
  for (const value of [
    'password=synthetic-private-canary\n',
    'synthetic-private-canary ' + line,
    line.replace('v=1', 'v=2'),
    line.replace('channels=1', 'channels=2'),
    line.replace('server=4', 'server=65'),
    line.replace('client=2', 'client=65'),
    line.replace('opens=3', 'opens=18446744073709551616'),
    line.replace('opens=3', 'opens=' + '0'.repeat(21)),
    line.replace('refused=2', 'refused=secret'),
    line.trimEnd(),
  ]) {
    const parser = new MicrophoneNegotiationDiagnostics();
    parser.push(Buffer.from(value));
    assert.equal(parser.snapshot(), undefined);
    parser.push(Buffer.from('\n' + line));
    assert.equal(parser.snapshot().recording, '2');
    assert.ok(!JSON.stringify(parser.snapshot()).includes('canary'));
  }
});
