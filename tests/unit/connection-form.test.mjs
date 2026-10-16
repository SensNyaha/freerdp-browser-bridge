import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionConfig } from '../../apps/reference-harness/connection-config.js';
import { ConnectionOwner } from '../../apps/reference-harness/connection-owner.js';
import { validateSessionConfig } from '../../packages/config/dist/index.js';
const values = {
  host: 'rdp.example.test',
  port: '3389',
  username: 'test-user',
  domain: '',
  password: 'synthetic-only',
  security: 'auto',
  minimumTls: '1.2',
  certificatePolicy: 'strict',
  width: '1920',
  height: '1080',
  video: 'h264',
  quality: 'balanced',
  fps: '20',
  audio: 'off',
  microphone: 'off',
  audioBuffer: '120',
  connectMs: '30000',
  dynamicResolution: 'on',
};
const caps = {
  connectCore: true,
  h264Capture: true,
  jpegCapture: true,
  displayControl: true,
  touchInput: true,
  pcmOutput: true,
  opusOutput: true,
  audioBuffer200: true,
  pcmInput: true,
  opusInput: true,
  microphoneReset: true,
};
const fields = (extra = {}) => new Map(Object.entries({ ...values, ...extra }));
test('manual clipboard selection: explicit text directions and finite quota require both native capabilities', () => {
  const available = { ...caps, clipboardText: true, clipboardRevoke: true };
  assert.equal(
    connectionConfig(fields(), available).config.clipboard,
    undefined,
  );
  for (const mode of [
    'bidirectional',
    'server-to-browser',
    'browser-to-server',
  ]) {
    const config = connectionConfig(
      fields({ clipboard: mode, clipboardMax: '16777216' }),
      available,
    ).config;
    assert.deepEqual(validateSessionConfig(config).clipboard, {
      mode,
      text: true,
      maxItemBytes: 16777216,
    });
    for (const flag of ['clipboardText', 'clipboardRevoke'])
      assert.throws(() =>
        connectionConfig(fields({ clipboard: mode, clipboardMax: '1024' }), {
          ...available,
          [flag]: false,
        }),
      );
  }
  for (const clipboardMax of ['0', '16777217', '1.5', 'NaN'])
    assert.throws(() =>
      connectionConfig(
        fields({ clipboard: 'bidirectional', clipboardMax }),
        available,
      ),
    );
  assert.throws(() =>
    connectionConfig(
      fields({ clipboard: 'html', clipboardMax: '1024' }),
      available,
    ),
  );
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const id = 'a'.repeat(32);
test('manual connection: supported form profiles agree with strict session schema; video stays in viewer negotiation', () => {
  for (const video of ['h264', 'jpeg'])
    for (const audio of ['off', 'pcm', 'opus'])
      for (const microphone of ['off', 'pcm', 'opus']) {
        const result = connectionConfig(
          fields({ video, audio, microphone }),
          caps,
        );
        assert.deepEqual(validateSessionConfig(result.config), result.config);
        assert.equal(result.config.media.videoCodec, undefined);
        assert.deepEqual(result.viewer, {
          codecs: [video],
          audioOutput: audio,
          microphone,
        });
        assert.equal(result.config.security.certificatePolicy, 'strict');
        assert.equal(result.config.display.multiMonitor, undefined);
      }
});
test('manual connection: malformed, unsupported and oversized input refuses without disclosing credentials', () => {
  for (const extra of [
    { host: 'bad host' },
    { port: '0' },
    { port: '3389.5' },
    { width: '1281' },
    { height: '2162' },
    { video: 'vp9' },
    { security: 'rdp' },
    { certificatePolicy: 'tofu' },
    { audioBuffer: '150' },
    { fps: '31' },
    { password: 'x'.repeat(1025) },
    { username: '\0' },
  ]) {
    assert.throws(
      () => connectionConfig(fields(extra), caps),
      (error) => !error.message.includes(values.password),
    );
  }
  for (const [extra, absent] of [
    [{}, 'connectCore'],
    [{ video: 'jpeg' }, 'jpegCapture'],
    [{ audio: 'opus' }, 'opusOutput'],
    [{ audio: 'pcm', audioBuffer: '200' }, 'audioBuffer200'],
    [{ microphone: 'opus' }, 'microphoneReset'],
    [{ touch: 'on' }, 'touchInput'],
  ])
    assert.throws(
      () => connectionConfig(fields(extra), { ...caps, [absent]: false }),
      /не поддерживается/,
    );
});
test('manual owner: cancelled late creation deletes before replacement; duplicate start never sends a second POST', async () => {
  const response = deferred(),
    deletion = deferred();
  const calls = [],
    attached = [];
  const owner = new ConnectionOwner({
    request(path, method, config) {
      calls.push({ path, method, config: config && structuredClone(config) });
      return method === 'POST' ? response.promise : deletion.promise;
    },
    attach: (...args) => attached.push(args),
    detach() {},
  });
  const { config, viewer } = connectionConfig(fields(), caps);
  const operation = owner.connect(config, viewer);
  await Promise.resolve();
  assert.equal(config.auth.password, undefined);
  await assert.rejects(
    owner.connect(connectionConfig(fields(), caps).config, viewer),
  );
  const stopped = owner.stop();
  response.resolve({ sessionId: id, attach: {} });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, 'DELETE');
  assert.equal(owner.snapshot().pending, true);
  assert.equal(attached.length, 0);
  deletion.resolve({ state: 'closed' });
  await stopped;
  await operation;
  assert.equal(owner.snapshot().connected, false);
  assert.equal(owner.snapshot().pending, false);
});
test('manual owner: cancel before request, failed delete and uncertain creation preserve bounded ownership', async () => {
  let calls = 0;
  const owner = new ConnectionOwner({
    request() {
      calls++;
      return Promise.resolve({ sessionId: id });
    },
    attach() {},
    detach() {},
  });
  const { config, viewer } = connectionConfig(fields(), caps);
  const pending = owner.connect(config, viewer);
  await owner.stop();
  await pending;
  assert.equal(calls, 0);
  assert.equal(config.auth.password, undefined);
  await owner.connect(connectionConfig(fields(), caps).config, viewer);
  owner.request = () => Promise.reject(new Error('synthetic transport fault'));
  await assert.rejects(owner.stop(), /Не подтверждено/);
  assert.equal(owner.snapshot().uncertain, true);
  assert.equal(owner.snapshot().connected, true);
  await assert.rejects(
    owner.connect(connectionConfig(fields(), caps).config, viewer),
  );
  owner.request = () => Promise.resolve({ state: 'closed' });
  await owner.stop();
  assert.equal(owner.snapshot().uncertain, false);
  owner.request = () => {
    const error = new Error('synthetic timeout');
    error.uncertain = true;
    return Promise.reject(error);
  };
  await assert.rejects(
    owner.connect(connectionConfig(fields(), caps).config, viewer),
  );
  assert.equal(owner.snapshot().uncertain, true);
});
