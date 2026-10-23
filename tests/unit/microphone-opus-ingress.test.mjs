import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneIngress } from '../../packages/node-bridge/dist/index.js';
import {
  encodeMicrophoneOpusRecord,
  encodeMicrophoneRecord,
  ProtocolError,
} from '../../packages/protocol/dist/index.js';
const source = () => ({
  enabled: true,
  availability: 'ready',
  revision: 1n,
  epoch: 1n,
  timestampUs: 100n,
});
const wire = (
  sequence = 1,
  timestampUs = 0n,
  discontinuity = true,
  epoch = 1n,
  lookaheadFrames = 312,
  length = 3,
) =>
  encodeMicrophoneOpusRecord(
    {
      epoch,
      timestampUs,
      discontinuity,
      lookaheadFrames,
      encoded: Buffer.alloc(length, 0xfc),
    },
    sequence,
  );
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('Opus ingress: selected bounded copied storage, frozen metadata and close joins borrowed packet before wipe', async () => {
  for (const length of [2, 1275]) {
    const pending = deferred();
    let borrowed,
      calls = 0;
    const ingress = new MicrophoneIngress({
      codec: 'opus',
      authorized: () => true,
      source,
      submit: (packet) => {
        borrowed = packet;
        ++calls;
        return pending.promise;
      },
    });
    const original = wire(1, 0n, true, 1n, 312, length),
      first = ingress.receive(original);
    original.fill(0, 40);
    assert.equal(borrowed.encoded.length, length);
    assert.equal(
      borrowed.encoded.every((v) => v === 0xfc),
      true,
    );
    assert.equal(borrowed.lookaheadFrames, 312);
    assert.equal(Object.isFrozen(borrowed), true);
    assert.equal('pcm' in borrowed, false);
    assert.equal(
      (await ingress.receive(wire(2, 20000n, false))).result,
      'busy',
    );
    assert.equal(calls, 1);
    let drained = false;
    const close = ingress.close().then(() => {
      drained = true;
    });
    await Promise.resolve();
    assert.equal(drained, false);
    assert.equal(borrowed.encoded[0], 0xfc);
    pending.resolve('accepted');
    assert.equal((await first).result, 'unavailable');
    await close;
    assert.equal(
      borrowed.encoded.every((v) => v === 0),
      true,
    );
    assert.equal(ingress.drainEpoch, 1n);
    assert.equal(ingress.stats.inFlight, false);
  }
});

test('Opus ingress: first boundary, stable lookahead, exact PTS and refused prediction recover only through newer discontinuity', async () => {
  let calls = 0,
    result = 'accepted';
  const ingress = new MicrophoneIngress({
    codec: 'opus',
    authorized: () => true,
    source,
    submit: async () => {
      ++calls;
      return result;
    },
  });
  assert.equal((await ingress.receive(wire(1, 0n, false))).result, 'invalid');
  assert.equal((await ingress.receive(wire(2))).result, 'accepted');
  assert.equal((await ingress.receive(wire(2))).result, 'stale');
  assert.equal(
    (await ingress.receive(wire(3, 20000n, false))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(4, 40000n, false, 1n, 0))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(5, 40000n, false))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(6, 40000n, true, 1n, 0))).result,
    'accepted',
  );
  result = 'busy';
  assert.equal(
    (await ingress.receive(wire(7, 60000n, false, 1n, 0))).result,
    'busy',
  );
  result = 'accepted';
  assert.equal(
    (await ingress.receive(wire(8, 60000n, false, 1n, 0))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(9, 40000n, true))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(10, 80000n, true))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(11, 100000n, false))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(13, 120000n, false))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(14, 140000n, true))).result,
    'accepted',
  );
  assert.equal(calls, 7);
  await ingress.close();
});

test('Opus ingress: busy attempt during pending discontinuity cannot be erased by its later accepted completion', async () => {
  const pending = deferred();
  let calls = 0;
  const ingress = new MicrophoneIngress({
    codec: 'opus',
    authorized: () => true,
    source,
    submit: () => {
      ++calls;
      return calls === 1 ? pending.promise : Promise.resolve('accepted');
    },
  });
  const first = ingress.receive(wire());
  assert.equal((await ingress.receive(wire(2, 20000n, false))).result, 'busy');
  pending.resolve('accepted');
  assert.equal((await first).result, 'accepted');
  assert.equal(
    (await ingress.receive(wire(3, 20000n, false))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(4, 40000n, true))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(5, 60000n, false))).result,
    'accepted',
  );
  assert.equal(calls, 3);
  await ingress.close();
});

test('Opus ingress: malformed input during pending boundary interrupts future prediction without consuming sequence', async () => {
  const pending = deferred();
  let calls = 0;
  const ingress = new MicrophoneIngress({
    codec: 'opus',
    authorized: () => true,
    source,
    submit: () => {
      ++calls;
      return calls === 1 ? pending.promise : Promise.resolve('accepted');
    },
  });
  const first = ingress.receive(wire());
  await assert.rejects(ingress.receive(Buffer.alloc(1316)), ProtocolError);
  pending.resolve('accepted');
  assert.equal((await first).result, 'accepted');
  assert.equal(
    (await ingress.receive(wire(2, 20000n, false))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(3, 40000n, true))).result,
    'accepted',
  );
  assert.equal(
    (await ingress.receive(wire(4, 60000n, false))).result,
    'accepted',
  );
  assert.equal(calls, 3);
  await ingress.close();
});

test('Opus ingress: wrong profile and malformed frame never dispatch; immutable selection and source loss suppress late acceptance', async () => {
  const pending = deferred();
  let state = source(),
    calls = 0;
  const backend = {
    codec: 'opus',
    authorized: () => true,
    source: () => state,
    submit: () => {
      ++calls;
      return pending.promise;
    },
  };
  const ingress = new MicrophoneIngress(backend);
  backend.codec = 'pcm';
  backend.submit = () => {
    throw new Error('Mutated selected callback');
  };
  await assert.rejects(
    ingress.receive(
      encodeMicrophoneRecord(
        {
          epoch: 1n,
          timestampUs: 0n,
          discontinuity: true,
          pcm: Buffer.alloc(3840),
        },
        1,
      ),
    ),
    ProtocolError,
  );
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.alloc(1316),
    wire().subarray(0, 41),
  ])
    await assert.rejects(ingress.receive(bytes), ProtocolError);
  assert.equal(calls, 0);
  const first = ingress.receive(wire());
  assert.equal(calls, 1);
  state = { ...state, epoch: 2n, revision: 2n, timestampUs: 101n };
  pending.resolve('accepted');
  assert.equal((await first).result, 'stale');
  assert.equal(
    (await ingress.receive(wire(2, 0n, false, 2n))).result,
    'invalid',
  );
  assert.equal(
    (await ingress.receive(wire(3, 0n, true, 2n))).result,
    'accepted',
  );
  await ingress.close();
});

test('Opus ingress: authority reentrant close and backend failure remain closed with payload-free scalar statistics', async () => {
  for (const mode of ['reentrant', 'throw', 'unknown', 'bad-source']) {
    let ingress,
      drain,
      calls = 0;
    ingress = new MicrophoneIngress({
      codec: 'opus',
      authorized: () => true,
      source: () => {
        if (mode === 'reentrant') drain = ingress.close();
        return mode === 'bad-source' ? { ...source(), epoch: 0n } : source();
      },
      submit: async () => {
        ++calls;
        if (mode === 'throw') throw new Error('synthetic-sample-sentinel');
        return mode === 'unknown' ? 'unknown' : 'accepted';
      },
    });
    assert.equal((await ingress.receive(wire())).result, 'unavailable');
    await drain;
    assert.equal(ingress.stats.closed, true);
    assert.equal(calls, ['reentrant', 'bad-source'].includes(mode) ? 0 : 1);
    assert.equal((await ingress.receive(wire(2))).result, 'unavailable');
    assert.equal(JSON.stringify(ingress.stats).includes('sentinel'), false);
    await ingress.close();
  }
  assert.throws(
    () =>
      new MicrophoneIngress({
        codec: 'unknown',
        authorized: () => true,
        source,
        submit: async () => 'accepted',
      }),
  );
});
