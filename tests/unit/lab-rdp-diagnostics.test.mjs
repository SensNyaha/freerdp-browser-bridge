import test from 'node:test';
import assert from 'node:assert/strict';
import { LabRdpDiagnostics } from '../../scripts/lab-rdp-diagnostics.mjs';
const line =
  'bridge.rdp.failure v=1 stage=3 channel=0 receive=0 assembly=0 registry=1 plugins=0 reserved=42 active=1 abandoned=1\n';
test('lab numeric fault diagnostics preserve fragmented records and copied latest-only ownership', () => {
  for (const ending of ['\n', '\r\n']) {
    const bytes = Buffer.from(line.replace(/\n$/, ending));
    for (let split = 0; split <= bytes.length; split++) {
      const parser = new LabRdpDiagnostics();
      parser.push(bytes.subarray(0, split));
      parser.push(bytes.subarray(split));
      const first = parser.snapshot();
      assert.equal(first.stage, 3);
      assert.equal(first.registry, 1);
      first.stage = 99;
      assert.equal(parser.snapshot().stage, 3);
      for (const byte of Buffer.from(line.replace('stage=3', 'stage=10')))
        parser.push(Uint8Array.of(byte));
      assert.equal(parser.snapshot().stage, 10);
    }
  }
});
test('lab fault diagnostics discard upstream text, oversized numbers and invalid fixed fields', () => {
  for (const text of [
    'password=synthetic-private-sentinel\n',
    line.replace('stage=3', 'stage=12'),
    line.replace('v=1', 'v=2'),
    line.replace('registry=1', 'registry=2'),
    line.replace('channel=0', 'channel=4294967296'),
    line.replace('reserved=42', 'reserved=67108865'),
    line.replace('active=1', 'active=33'),
    line.replace('abandoned=1', 'abandoned=18446744073709551616'),
    line.replace('stage=3', 'stage=' + '0'.repeat(21)),
    line.replace('stage=3', 'stage=secret'),
    line.trimEnd(),
  ]) {
    const parser = new LabRdpDiagnostics();
    parser.push(Buffer.from(text));
    assert.equal(parser.snapshot(), undefined);
    parser.push(Buffer.from('\n' + line));
    assert.equal(parser.snapshot().stage, 3);
    assert.ok(!JSON.stringify(parser.snapshot()).includes('sentinel'));
  }
});
