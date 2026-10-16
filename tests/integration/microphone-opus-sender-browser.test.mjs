import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge Opus sender: synthetic codec output, held real credit, latest PCM and epoch retirement without device capture',
  { skip: process.platform !== 'win32', timeout: 25000 },
  async () => {
    const names = [
      'microphone-opus-sender.js',
      'microphone-opus-encoder.js',
      'microphone-sender.js',
      'microphone-wire.js',
      'microphone-opus-wire.js',
    ];
    const files = new Map(
      await Promise.all(
        names.map(async (name) => [
          '/' + name,
          await readFile('apps/reference-harness/' + name),
        ]),
      ),
    );
    const server = createServer((request, reply) => {
      reply.setHeader(
        'Content-Type',
        files.has(request.url) ? 'text/javascript' : 'text/html',
      );
      reply.end(
        files.get(request.url) ??
          '<!doctype html><title>Synthetic Opus sender</title>',
      );
    });
    await listenBrowserHttp(server);
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
        let requests = 0,
          revoked = 0,
          created = 0;
        navigator.mediaDevices.getUserMedia = () => {
          ++requests;
          throw new Error(
            'Physical capture forbidden in synthetic sender fixture',
          );
        };
        const [{ MicrophoneOpusSender }, { parseMicrophoneOpusRecord }] =
          await Promise.all([
            import('/microphone-opus-sender.js'),
            import('/microphone-opus-wire.js'),
          ]);
        const support = await AudioEncoder.isConfigSupported({
          codec: 'opus',
          sampleRate: 48000,
          numberOfChannels: 2,
          bitrate: 64000,
          opus: { frameDuration: 20000, complexity: 5 },
        });
        if (!support.supported)
          throw new Error('Synthetic Opus codec unsupported');
        const units = [],
          codecs = [];
        const sender = new MicrophoneOpusSender(
          {
            send(record) {
              if (units.length >= 8)
                throw new Error('Synthetic record bound exceeded');
              const unit = parseMicrophoneOpusRecord(record);
              units.push({
                sequence: unit.sequence,
                epoch: String(unit.epoch),
                timestampUs: String(unit.timestampUs),
                discontinuity: unit.discontinuity,
                lookahead: unit.lookaheadFrames,
                bytes: unit.encoded.byteLength,
              });
              return true;
            },
            revoke() {
              ++revoked;
            },
          },
          {
            encoder(callbacks) {
              ++created;
              const codec = new AudioEncoder(callbacks);
              codecs.push(codec);
              return codec;
            },
            data(options) {
              return new AudioData(options);
            },
          },
        );
        const state = (epoch = '1', revision = '1') => ({
          granted: true,
          retiring: false,
          source: {
            enabled: true,
            availability: 'ready',
            epoch,
            revision,
            timestampUs: revision,
          },
        });
        const pcm = new Uint8Array(3840),
          view = new DataView(pcm.buffer);
        for (let frame = 0; frame < 960; ++frame) {
          view.setInt16(frame * 4, 8192, true);
          view.setInt16(frame * 4 + 2, -8192, true);
        }
        const wait = async (count) => {
          const deadline = performance.now() + 2000;
          while (units.length < count && !sender.stats.closed) {
            if (performance.now() >= deadline)
              throw new Error('Synthetic sender progress deadline');
            await new Promise((done) => setTimeout(done, 5));
          }
          if (units.length !== count)
            throw new Error('Synthetic sender output failed');
        };
        const acknowledge = (index) => {
          sender.acknowledge(
            {
              sequence: units[index].sequence,
              epoch: units[index].epoch,
              status: 'accepted',
            },
            performance.now(),
          );
          return !sender.stats.closed;
        };
        try {
          const beforePermission = created;
          sender.status(state(), performance.now());
          const token = sender.authorize(performance.now());
          for (let index = 0; index < 3; ++index) {
            if (
              !sender.offer(
                token,
                { epoch: 1n, timestampUs: BigInt(index) * 20000n, pcm },
                performance.now(),
              )
            )
              throw new Error('Synthetic input refused');
            await wait(index + 1);
            if (index < 2 && !acknowledge(index))
              throw new Error('Synthetic ACK refused');
          }
          sender.offer(
            token,
            { epoch: 1n, timestampUs: 60000n, pcm },
            performance.now(),
          );
          sender.offer(
            token,
            { epoch: 1n, timestampUs: 80000n, pcm },
            performance.now(),
          );
          const held = {
            count: units.length,
            created,
            pending: sender.stats.pendingBytes,
          };
          if (!acknowledge(2)) throw new Error('Held ACK refused');
          await wait(4);
          // Retire the old codec now, but preserve issued old-epoch network correlation.
          sender.status(state('2', '2'), performance.now());
          const retiredBeforeAck = codecs.every(
            (codec) => codec.state === 'closed',
          );
          sender.offer(
            token,
            { epoch: 2n, timestampUs: 0n, pcm },
            performance.now(),
          );
          if (!acknowledge(3)) throw new Error('Old epoch ACK refused');
          await wait(5);
          if (!acknowledge(4)) throw new Error('Fresh epoch ACK refused');
          sender.close();
          await new Promise((done) => setTimeout(done, 80));
          return {
            units,
            held,
            beforePermission,
            retiredBeforeAck,
            requests,
            revoked,
            created,
            allClosed: codecs.every((codec) => codec.state === 'closed'),
            stats: sender.stats,
          };
        } finally {
          sender.close();
        }
      });
      assert.equal(result.beforePermission, 0);
      assert.equal(result.requests, 0);
      assert.equal(result.revoked, 1);
      assert.deepEqual(
        result.units.map((unit) => unit.timestampUs),
        ['0', '20000', '40000', '80000', '0'],
      );
      assert.deepEqual(
        result.units.map((unit) => unit.epoch),
        ['1', '1', '1', '1', '2'],
      );
      assert.deepEqual(
        result.units.map((unit) => unit.discontinuity),
        [true, false, false, true, true],
      );
      assert.equal(result.held.count, 3);
      assert.equal(result.held.created, 1);
      assert.equal(result.held.pending, 3840);
      assert.equal(result.retiredBeforeAck, true);
      assert.equal(result.created, 3);
      assert.equal(result.allClosed, true);
      assert.equal(result.stats.closed, true);
      assert.equal(result.stats.faults, 0);
      assert.equal(result.stats.sent, 5);
      assert.equal(result.stats.accepted, 4);
      assert.equal(result.stats.refused, 1); // Old-epoch ACK releases credit only.
      for (const unit of result.units) {
        assert.ok(unit.bytes >= 2 && unit.bytes <= 1275);
        assert.ok(unit.lookahead >= 0 && unit.lookahead <= 960);
      }
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  },
);
