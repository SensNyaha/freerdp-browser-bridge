import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { bindStandaloneSupervisor } from '../../apps/standalone/dist/supervisor.js';

test('standalone supervisor joins exactly one shutdown request or parent EOF without accepting a command stream', async () => {
  for (const kind of ['shutdown', 'eof', 'invalid', 'oversized', 'error']) {
    const input = new PassThrough();
    const stops = [];
    bindStandaloneSupervisor(input, (failed) => stops.push(failed));
    if (kind === 'eof') input.end();
    else if (kind === 'error') input.destroy(new Error('synthetic'));
    else
      input.write(
        kind === 'shutdown'
          ? Buffer.from([1])
          : kind === 'invalid'
            ? Buffer.from([2])
            : Buffer.alloc(65536, 1),
      );
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(stops, [!['shutdown', 'eof'].includes(kind)]);
    assert.equal(input.destroyed, true);
  }
});
