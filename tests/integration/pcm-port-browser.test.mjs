import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { encodePcmAudioRecords } from '../../packages/protocol/dist/index.js';

test(
  'Edge PCM port owner: actual RWB1 burst credit, epoch reset and context-loss cleanup',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const names = ['pcm-playback.js', 'pcm-worklet.js', 'pcm-queue.js'];
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
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
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
      await page.evaluate(() => {
        document.querySelector('#start').onclick = () => {
          window.audio = new AudioContext({ sampleRate: 48000 });
          window.resumed = window.audio.resume();
        };
      });
      await page.click('#start');
      await page.evaluate(async () => {
        await window.resumed;
        const { createPcmPlayback } = await import('/pcm-playback.js');
        window.failures = [];
        window.sender = await createPcmPlayback(window.audio, {
          onFailure: (reason) => window.failures.push(reason),
        });
      });
      const configuration = {
        epoch: 1n,
        codec: 'pcm',
        sampleRate: 48000,
        channels: 2,
        sampleFormat: 's16le',
        packetFrames: 960,
      };
      const frame = (index, epoch = 1n) => ({
        epoch,
        timestampUs: BigInt(index) * 20000n,
        frames: 960,
        silenceFrames: 0,
        discontinuity: index === 0 || epoch === 2n,
        pcm: Buffer.alloc(3840),
      });
      const records = encodePcmAudioRecords(configuration, frame(0), 0, true);
      for (let index = 1; index < 100; index++)
        records.push(
          ...encodePcmAudioRecords(
            configuration,
            frame(index),
            index + 1,
            false,
          ),
        );
      const burst = await page.evaluate(
        (records) => {
          const accepted = records.every((bytes) =>
            window.sender.record(new Uint8Array(bytes).buffer),
          );
          return { accepted, snapshot: window.sender.snapshot() };
        },
        records.map((record) => Array.from(record)),
      );
      assert.equal(burst.accepted, true);
      assert.equal(burst.snapshot.inFlight, 1);
      assert.equal(burst.snapshot.pendingPacketBytes, 3840);
      assert.equal(burst.snapshot.replacedPackets, 99);
      await page.waitForFunction(() => window.sender.snapshot().inFlight === 0);
      await page.evaluate(() => window.sender.requestStats());
      await page.waitForFunction(
        () => window.sender.snapshot().remote !== undefined,
      );
      const first = await page.evaluate(() => window.sender.snapshot());
      assert.equal(first.remote.packets, 1);
      assert.equal(first.remote.queuedFrames, 960);
      assert.equal(first.inFlight, 0);
      const next = encodePcmAudioRecords(
        { ...configuration, epoch: 2n },
        frame(100, 2n),
        101,
        true,
      );
      await page.evaluate(
        (records) => {
          for (const bytes of records) {
            if (!window.sender.record(new Uint8Array(bytes).buffer))
              throw new Error('Epoch refused');
          }
        },
        next.map((record) => Array.from(record)),
      );
      await page.waitForFunction(() => window.sender.snapshot().inFlight === 0);
      await page.evaluate(() => window.sender.requestStats());
      await page.waitForFunction(
        () => window.sender.snapshot().remote?.configurations === 2,
      );
      const second = await page.evaluate(() => window.sender.snapshot());
      assert.equal(second.remote.packets, 2);
      assert.equal(second.remote.queuedFrames, 960);
      assert.equal(second.remote.resetDiscardedFrames, 960);
      await page.evaluate(() => window.audio.suspend());
      await page.waitForFunction(() => window.sender.snapshot().closed);
      const closed = await page.evaluate(async () => {
        await window.sender.close();
        return {
          state: window.audio.state,
          snapshot: window.sender.snapshot(),
          failures: window.failures,
        };
      });
      assert.equal(closed.state, 'closed');
      assert.equal(closed.snapshot.closed, true);
      assert.equal(closed.snapshot.pendingPacketBytes, 0);
      assert.equal(closed.snapshot.inFlight, 0);
      assert.deepEqual(closed.failures, ['context']);
    } finally {
      await page?.close();
      server.closeAllConnections();
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
