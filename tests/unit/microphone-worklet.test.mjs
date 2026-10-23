import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { MicrophoneCapture } from '../../apps/reference-harness/microphone-capture.js';
const source = (
  await readFile('apps/reference-harness/microphone-worklet.js', 'utf8')
).replace(/^import[^\n]+\n/, '');
function fixture(rate = 48000, initial = { epoch: 1n }) {
  let Processor;
  const messages = [];
  const globals = {
    MicrophoneCapture,
    sampleRate: rate,
    currentFrame: 0,
    registerProcessor(name, value) {
      assert.equal(name, 'bridge-microphone-s16le');
      Processor = value;
    },
    AudioWorkletProcessor: class {
      port = {
        postMessage(value) {
          messages.push(value);
        },
        onmessage: undefined,
      };
    },
  };
  runInNewContext(source, globals, { timeout: 1000 });
  const processor = new Processor({ processorOptions: initial });
  const render = (frame, channels = [new Float32Array(128).fill(0.5)]) => {
    globals.currentFrame = frame;
    const output = new Float32Array(128).fill(99);
    const active = processor.process([channels], [[output]]);
    assert.ok(output.every((value) => value === 0));
    return active;
  };
  const send = (data, frame = globals.currentFrame) => {
    globals.currentFrame = frame;
    processor.port.onmessage({ data });
  };
  return { processor, messages, render, send };
}
test('microphone Worklet parser: fixed initial profile, exact command/ACK shapes, replay refusal and one terminal fault notification', () => {
  for (const initial of [
    undefined,
    { epoch: 0n },
    { epoch: 1n, extra: 1 },
    { epoch: 1 },
    { epoch: 1n << 64n },
  ]) {
    const f = fixture(48000, initial ?? null);
    assert.deepEqual(
      f.messages.map((value) => ({ ...value })),
      [{ type: 'ready', accepted: false }],
    );
    assert.equal(f.render(0), false);
  }
  const wrongRate = fixture(44100);
  assert.equal(wrongRate.messages[0].accepted, false);
  for (const bad of [
    null,
    {},
    { type: 'ack', id: 1 },
    { type: 'pause', id: 0 },
    { type: 'pause', id: 1, extra: 1 },
    { type: 'config', id: 1, epoch: '2' },
    { type: 'config', id: 1, epoch: 1n },
    { type: 'unknown', id: 1 },
    { type: 'dispose', id: 1.5 },
    { type: 'dispose', id: 0x100000000 },
  ]) {
    const f = fixture();
    f.send(bad);
    assert.equal(f.processor.capture.stats.closed, true);
    f.send(bad);
    f.render(0);
    assert.equal(
      f.messages.filter((value) => value.type === 'fault').length,
      1,
    );
    assert.equal(
      f.messages.filter((value) => value.type === 'packet').length,
      0,
    );
  }
  const replay = fixture();
  replay.send({ type: 'pause', id: 1 });
  replay.send({ type: 'pause', id: 1 });
  assert.equal(
    replay.messages.filter((value) => value.type === 'result').at(-1).accepted,
    false,
  );
  assert.equal(replay.processor.capture.stats.closed, true);
});

test('microphone Worklet parser: transfer one sample buffer, no ACK response amplification and clean disposal without a fault', () => {
  const f = fixture();
  for (let frame = 0; frame < 1024; frame += 128)
    assert.equal(f.render(frame), true);
  const packet = f.messages.find((value) => value.type === 'packet');
  assert.equal(packet.id, 1);
  assert.equal(packet.pcm.byteLength, 3840);
  f.send({ type: 'ack', id: 1 }, 1024);
  assert.equal(f.messages.filter((value) => value.type === 'result').length, 0);
  f.send({ type: 'pause', id: 1 }, 1024);
  f.send({ type: 'config', id: 2, epoch: 2n }, 1024);
  f.send({ type: 'dispose', id: 3 }, 1024);
  assert.equal(f.render(1024), false);
  assert.equal(f.messages.filter((value) => value.type === 'fault').length, 0);
  assert.deepEqual(
    f.messages
      .filter((value) => value.type === 'result')
      .map((value) => ({ ...value })),
    [1, 2, 3].map((id) => ({ type: 'result', id, accepted: true })),
  );
});
