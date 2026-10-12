import test from 'node:test';
import assert from 'node:assert/strict';
import { queryMicrophoneOpusSupport } from '../../apps/reference-harness/microphone-opus-encoder.js';

test('microphone Opus support: exact fresh profile query never creates codec/data/device', async () => {
  const configs = [];
  const api = {
    AudioEncoder: class {
      constructor() {
        throw new Error('Codec construction forbidden');
      }
      static async isConfigSupported(config) {
        configs.push(config);
        return { supported: true };
      }
    },
    AudioData: class {
      constructor() {
        throw new Error('AudioData construction forbidden');
      }
    },
  };
  assert.equal(await queryMicrophoneOpusSupport(api), true);
  assert.deepEqual(configs[0], {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 64000,
    opus: { complexity: 5, frameDuration: 20000 },
  });
  configs[0].opus.frameDuration = 10000;
  assert.equal(await queryMicrophoneOpusSupport(api), true);
  assert.equal(configs[1].opus.frameDuration, 20000);
});
test('microphone Opus support: absent APIs, unsupported, malformed and thrown/rejected query refuse selection', async () => {
  for (const result of [{ supported: false }, { supported: 1 }, true, null]) {
    assert.equal(
      await queryMicrophoneOpusSupport({
        AudioEncoder: { isConfigSupported: async () => result },
        AudioData: class {},
      }),
      false,
    );
  }
  for (const api of [
    {},
    { AudioEncoder: {} },
    { AudioData: class {} },
    {
      AudioEncoder: {
        isConfigSupported() {
          throw new Error('Private API detail');
        },
      },
      AudioData: class {},
    },
    {
      AudioEncoder: {
        isConfigSupported: async () => {
          throw new Error('Private API detail');
        },
      },
      AudioData: class {},
    },
  ])
    assert.equal(await queryMicrophoneOpusSupport(api), false);
});
