import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge isolated microphone Opus encoder: actual synthetic AudioData, single input progress, discontinuity and no flush tail',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const source = await readFile(
      'apps/reference-harness/microphone-opus-encoder.js',
    );
    const server = createServer((request, reply) => {
      if (request.url === '/encoder.js') {
        reply.setHeader('Content-Type', 'text/javascript');
        reply.end(source);
      } else {
        reply.setHeader('Content-Type', 'text/html');
        reply.end('<!doctype html><title>Synthetic Opus input</title>');
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    let browser;
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        timeout: 5000,
      });
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port);
      const result = await page.evaluate(async () => {
        navigator.mediaDevices.getUserMedia = () => {
          throw new Error('Physical microphone forbidden in codec fixture');
        };
        const { MicrophoneOpusEncoder } = await import('/encoder.js');
        const support = await AudioEncoder.isConfigSupported({
          codec: 'opus',
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 64000,
          opus: { frameDuration: 20000, complexity: 5 },
        });
        if (!support.supported)
          throw new Error('Synthetic Opus encoder unsupported');
        const units = [];
        let failed = 0,
          resolve;
        const encoder = new MicrophoneOpusEncoder(1n, {
          authorized: () => true,
          receive(unit) {
            units.push({
              epoch: String(unit.epoch),
              timestampUs: String(unit.timestampUs),
              discontinuity: unit.discontinuity,
              lookahead: unit.lookaheadFrames,
              bytes: unit.encoded.byteLength,
              toc: unit.encoded[0],
            });
            resolve();
            return true;
          },
          failed: () => {
            ++failed;
            resolve?.();
          },
        });
        try {
          for (let index = 0; index < 5; ++index) {
            const pcm = new Uint8Array(3840),
              view = new DataView(pcm.buffer);
            for (let frame = 0; frame < 960; ++frame) {
              view.setInt16(frame * 4, 16384, true);
              view.setInt16(frame * 4 + 2, 16384, true);
            }
            const completed = new Promise((done) => {
              resolve = done;
            });
            const timestampUs = index === 4 ? 200000n : BigInt(index) * 20000n;
            if (
              !encoder.encode({
                epoch: 1n,
                timestampUs,
                discontinuity: index === 0 || index === 4,
                pcm,
              })
            )
              throw new Error('Synthetic Opus input refused');
            await completed;
            if (failed) break;
          }
          encoder.close();
          await new Promise((done) => setTimeout(done, 80));
          return { failed, units, stats: encoder.stats };
        } finally {
          encoder.close();
        }
      });
      assert.equal(result.failed, 0);
      assert.equal(result.units.length, 5);
      assert.deepEqual(
        result.units.map((unit) => unit.timestampUs),
        ['0', '20000', '40000', '60000', '200000'],
      );
      assert.deepEqual(
        result.units.map((unit) => unit.discontinuity),
        [true, false, false, false, true],
      );
      for (const unit of result.units) {
        assert.equal(unit.epoch, '1');
        assert.equal(unit.toc & 7, 4);
        assert.ok(unit.bytes >= 2 && unit.bytes <= 1275);
        assert.ok(unit.lookahead >= 0 && unit.lookahead <= 960);
      }
      assert.equal(result.stats.inputs, 5);
      assert.equal(result.stats.delivered, 5);
      assert.equal(result.stats.closed, true);
      assert.equal(result.stats.failed, false);
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  },
);
