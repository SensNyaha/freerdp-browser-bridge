import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import {
  encodeOpusAudioStateRecord,
  encodeOpusAudioConfigRecord,
  encodeOpusAudioPacketRecord,
} from '../../packages/protocol/dist/index.js';
const binaryDir = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';

test(
  'Edge Opus: actual pinned SDK tones decode as 960-frame raw packets and receive Worklet admission credit',
  {
    skip: process.platform !== 'win32' || binaryDir.includes('foundation'),
    timeout: 60000,
  },
  async () => {
    const { stdout } = await promisify(execFile)(
      resolve(binaryDir, 'fixture-opus-tone.exe'),
      [],
      { timeout: 5000, maxBuffer: 100000, windowsHide: true },
    );
    const fixture = JSON.parse(stdout);
    assert.equal(fixture.packets.length, 20);
    assert.ok(
      Number.isInteger(fixture.lookaheadFrames) &&
        fixture.lookaheadFrames <= 960,
    );
    assert.ok(
      fixture.packets.every(
        (p) => Array.isArray(p) && p.length >= 2 && p.length <= 1275,
      ),
    );
    const names = [
      'opus-playback.js',
      'opus-wire.js',
      'pcm-playback.js',
      'pcm-worklet.js',
      'pcm-queue.js',
    ];
    const files = new Map(
      await Promise.all(
        names.map(async (name) => [
          '/' + name,
          await readFile('apps/reference-harness/' + name),
        ]),
      ),
    );
    const server = createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        files.has(request.url) ? 'text/javascript' : 'text/html',
      );
      response.end(
        files.get(request.url) ?? '<button id="start">Start audio</button>',
      );
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    let browser, page;
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        timeout: 5000,
      });
      page = await browser.newPage();
      page.setDefaultTimeout(3000);
      await page.goto('http://127.0.0.1:' + server.address().port);
      const decoded = await page.evaluate(
        async ({ packets, lookaheadFrames }) => {
          const { OPUS_DECODER_CONFIG } = await import('/opus-playback.js');
          const support =
            await AudioDecoder.isConfigSupported(OPUS_DECODER_CONFIG);
          if (!support.supported) throw new Error('Opus unsupported');
          const samples = new Float32Array(20 * 960 * 2);
          const profiles = [];
          let count = 0,
            closed = 0,
            errors = 0;
          const decoder = new AudioDecoder({
            output(data) {
              try {
                profiles.push([
                  data.numberOfFrames,
                  data.numberOfChannels,
                  data.sampleRate,
                  data.timestamp,
                ]);
                if (
                  data.numberOfFrames !== 960 ||
                  data.numberOfChannels !== 2 ||
                  data.sampleRate !== 48000 ||
                  Math.abs(data.timestamp - count * 20000) > 1 ||
                  count >= 20
                )
                  throw new Error('Decoded profile');
                for (let channel = 0; channel < 2; channel++) {
                  const plane = new Float32Array(960);
                  data.copyTo(plane, {
                    planeIndex: channel,
                    format: 'f32-planar',
                  });
                  for (let i = 0; i < 960; i++)
                    samples[(count * 960 + i) * 2 + channel] = plane[i];
                }
                count++;
              } catch {
                errors++;
              } finally {
                data.close();
                closed++;
              }
            },
            error() {
              errors++;
            },
          });
          try {
            decoder.configure(OPUS_DECODER_CONFIG);
            // Test-only fixed 20-packet corpus; production owner admits one packet.
            for (let i = 0; i < 20; i++)
              decoder.decode(
                new EncodedAudioChunk({
                  type: 'key',
                  timestamp: i * 20000,
                  duration: 20000,
                  data: new Uint8Array(packets[i]),
                }),
              );
            await decoder.flush();
          } finally {
            if (decoder.state !== 'closed') decoder.close();
          }
          const correlations = [];
          for (let channel = 0; channel < 2; channel++) {
            let dot = 0,
              sourcePower = 0,
              decodedPower = 0;
            for (let i = 1920; i < 20 * 960 - lookaheadFrames; i++) {
              const original = Math.sin(
                (2 * Math.PI * (channel ? 990 : 440) * i) / 48000,
              );
              const actual = samples[(i + lookaheadFrames) * 2 + channel];
              dot += original * actual;
              sourcePower += original * original;
              decodedPower += actual * actual;
            }
            correlations.push(dot / Math.sqrt(sourcePower * decodedPower));
          }
          return { count, closed, errors, correlations, profiles };
        },
        fixture,
      );
      assert.equal(decoded.count, 20, JSON.stringify(decoded.profiles));
      assert.equal(decoded.closed, 20);
      assert.equal(decoded.errors, 0);
      assert.ok(
        decoded.correlations.every((r) => r > 0.9),
        'Stereo tone correlation exceeds 0.9',
      );
      await page.evaluate(() => {
        document.querySelector('#start').onclick = () => {
          window.context = new AudioContext({ sampleRate: 48000 });
          window.resumed = window.context.resume();
        };
      });
      await page.click('#start');
      await page.evaluate(async () => {
        await window.resumed;
        const { createOpusPlayback } = await import('/opus-playback.js');
        window.acks = [];
        window.failures = [];
        window.owner = await createOpusPlayback(window.context, {
          onRecordAck: (seq) => window.acks.push(seq),
          onFailure: (why) => window.failures.push(why),
        });
      });
      const cfg = {
        codec: 'opus',
        epoch: 1n,
        sampleRate: 48000,
        channels: 2,
        packetFrames: 960,
        lookaheadFrames: fixture.lookaheadFrames,
      };
      const records = [
        encodeOpusAudioStateRecord(
          {
            enabled: true,
            availability: 'ready',
            revision: 1n,
            epoch: 1n,
            timestampUs: 1n,
          },
          0,
        ),
        encodeOpusAudioConfigRecord(cfg, 0n, 1),
        ...fixture.packets.map((bytes, i) =>
          encodeOpusAudioPacketRecord(
            {
              epoch: 1n,
              timestampUs: BigInt(i) * 20000n,
              frames: 960,
              silenceFrames: 0,
              discontinuity: i === 0,
              encoded: Buffer.from(bytes),
            },
            i + 2,
          ),
        ),
        encodeOpusAudioStateRecord(
          {
            enabled: true,
            availability: 'closed',
            revision: 2n,
            epoch: 1n,
            timestampUs: 2n,
          },
          22,
        ),
      ];
      for (let i = 0; i < records.length; i++) {
        const result = await page.evaluate(
          (bytes) => ({
            accepted: window.owner.record(new Uint8Array(bytes).buffer),
            credits: window.acks.length,
            snapshot: window.owner.snapshot(),
          }),
          Array.from(records[i]),
        );
        assert.equal(result.accepted, true);
        assert.equal(result.credits, i);
        assert.equal(result.snapshot.recordInFlight, 1);
        await page.waitForFunction(
          (count) => window.acks.length === count,
          i + 1,
        );
      }
      await page.evaluate(() => window.owner.requestStats());
      await page.waitForFunction(
        () =>
          window.owner.snapshot().playback.remote &&
          !window.owner.snapshot().playback.inFlight,
      );
      const final = await page.evaluate(async () => {
        const snapshot = window.owner.snapshot();
        await window.owner.close();
        return {
          snapshot,
          state: window.context.state,
          failures: window.failures,
          acks: window.acks,
        };
      });
      assert.equal(final.snapshot.decoded, 20);
      assert.equal(final.snapshot.playback.remote.packets, 20);
      assert.equal(final.snapshot.playback.remote.queuedFrames, 0);
      assert.equal(final.snapshot.playback.remote.invalidCalls, 0);
      assert.equal(final.snapshot.playback.source.availability, 'closed');
      assert.equal(final.state, 'closed');
      assert.deepEqual(final.failures, []);
      assert.deepEqual(
        final.acks,
        Array.from({ length: 23 }, (_, i) => i),
      );
    } finally {
      await page?.close();
      await browser?.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  },
);
