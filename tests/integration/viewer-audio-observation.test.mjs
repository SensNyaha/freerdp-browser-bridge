import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readViewerAudioObservation } from '../../scripts/viewer-audio-observation.mjs';

test(
  'Edge synthetic viewer observation waits for a fresh stats reply and excludes unrelated data',
  { skip: process.platform !== 'win32', timeout: 15000 },
  async (testContext) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      timeout: 5000,
    });
    const aborted = () => void browser.close().catch(() => {});
    testContext.signal.addEventListener('abort', aborted, { once: true });
    try {
      testContext.signal.throwIfAborted();
      const page = await browser.newPage();
      await page.evaluate(() => {
        window.bridgeViewer = {
          stats: {
            frames: 4,
            width: 1920,
            height: 1080,
            unrelated: 'synthetic-private-value',
            audio: {
              codec: 'opus',
              records: 8,
              decoded: 5,
              inFlight: 0,
              source: {
                enabled: true,
                availability: 'ready',
                revision: '2',
                epoch: '3',
                awaitingConfig: false,
                unrelated: 'synthetic-private-value',
              },
              remote: { playedFrames: 10 },
            },
          },
          requestAudioStats() {
            this.stats.audio.inFlight = 1;
            setTimeout(() => {
              this.stats.audio.remote = {
                configurations: 1,
                packets: 5,
                playedFrames: 4800,
                underflowFrames: 0,
                underflows: 0,
                bufferingSilenceFrames: 128,
                overflowSkippedFrames: 0,
                resetDiscardedFrames: 0,
                invalidCalls: 0,
                highWaterFrames: 960,
                queuedFrames: 0,
                buffering: false,
                unrelated: 'synthetic-private-value',
              };
              this.stats.audio.inFlight = 0;
            }, 50);
            return true;
          },
        };
      });
      const observation = await readViewerAudioObservation(page);
      assert.equal(observation.codec, 'opus');
      assert.deepEqual(observation.video, {
        frames: 4,
        width: 1920,
        height: 1080,
      });
      assert.equal(observation.source.epoch, '3');
      assert.equal(observation.worklet.playedFrames, 4800);
      assert.equal(observation.worklet.packets, 5);
      assert.equal(observation.decoded, 5);
      assert.ok(!JSON.stringify(observation).includes('private'));

      await page.evaluate(() => {
        window.bridgeViewer.stats.audio.codec = 'pcm';
        delete window.bridgeViewer.stats.audio.decoded;
      });
      assert.equal((await readViewerAudioObservation(page)).decoded, null);

      await page.evaluate(() => {
        window.bridgeViewer.requestAudioStats = () => false;
      });
      await assert.rejects(readViewerAudioObservation(page), {
        message: 'LAB_AUDIO_STATS_UNAVAILABLE',
      });
      await page.close();
      await assert.rejects(readViewerAudioObservation(page));
    } finally {
      testContext.signal.removeEventListener('abort', aborted);
      await browser.close();
    }
  },
);
