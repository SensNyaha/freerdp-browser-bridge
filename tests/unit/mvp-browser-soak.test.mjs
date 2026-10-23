import test from 'node:test';
import assert from 'node:assert/strict';
import { readMvpAudioReady } from '../../scripts/mvp-browser-soak.mjs';

test('combined observer waits for epoch recovery within the original finite sampling deadline', async () => {
  let clock = 0,
    calls = 0;
  const observation = await readMvpAudioReady(null, {
    now: () => clock,
    pause: async (ms) => {
      clock += ms;
    },
    read: async () => ({
      source: {
        enabled: true,
        availability: ++calls < 3 ? 'waiting' : 'ready',
      },
    }),
  });
  assert.equal(observation.source.availability, 'ready');
  assert.equal(clock, 200);
  assert.equal(calls, 3);
});

test('combined observer cannot turn persistent source loss or an overdue ready reply into a pass', async () => {
  for (const kind of ['waiting', 'disabled', 'late-ready']) {
    let clock = 0,
      calls = 0;
    await assert.rejects(
      readMvpAudioReady(null, {
        now: () => clock,
        pause: async (ms) => {
          clock += ms;
        },
        read: async () => {
          ++calls;
          if (kind === 'late-ready') clock = 3000;
          return {
            source: {
              enabled: kind !== 'disabled',
              availability: kind === 'late-ready' ? 'ready' : 'waiting',
            },
          };
        },
      }),
      /LAB_MVP_AUDIO_RECOVERY_FAILED/,
    );
    assert.equal(calls, kind === 'waiting' ? 31 : 1);
    assert.equal(clock, kind === 'disabled' ? 0 : 3000);
  }
});
