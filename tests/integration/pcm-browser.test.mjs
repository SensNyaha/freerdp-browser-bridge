import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge AudioWorklet: actual offline stereo PCM rendering and one-command live acknowledgments',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async (testContext) => {
    const files = new Map(
      await Promise.all(
        ['pcm-worklet.js', 'pcm-queue.js'].map(async (name) => [
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
    let phase = 'launch';
    const aborted = () => {
      testContext.diagnostic('PCM fixture timeout phase: ' + phase);
      server.closeAllConnections();
      // Abort an unbounded evaluate/render/resume promise, preserving test failure.
      void browser?.close({ reason: 'PCM fixture deadline' }).catch(() => {});
    };
    testContext.signal.addEventListener('abort', aborted, { once: true });
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        timeout: 5000,
      });
      testContext.signal.throwIfAborted();
      phase = 'page';
      page = await browser.newPage();
      page.setDefaultTimeout(3000);
      page.setDefaultNavigationTimeout(5000);
      phase = 'navigation';
      await page.goto('http://127.0.0.1:' + server.address().port);
      phase = 'offline';
      const result = await page.evaluate(async () => {
        const make = (index, left, right) => {
          const pcm = new ArrayBuffer(3840),
            view = new DataView(pcm);
          for (let at = 0; at < 960; at++) {
            view.setInt16(at * 4, left, true);
            view.setInt16(at * 4 + 2, right, true);
          }
          return {
            epoch: 1n,
            timestampUs: BigInt(index) * 20000n,
            discontinuity: index === 0,
            pcm,
          };
        };
        const context = new OfflineAudioContext(2, 2048, 48000);
        await context.audioWorklet.addModule('/pcm-worklet.js');
        const node = new AudioWorkletNode(context, 'bridge-pcm-s16le', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: {
            initial: {
              epoch: 1n,
              packets: [make(0, -32768, 32767), make(1, 12345, -23456)],
            },
          },
        });
        node.connect(context.destination);
        try {
          const rendered = await context.startRendering();
          const left = rendered.getChannelData(0),
            right = rendered.getChannelData(1);
          return {
            rate: rendered.sampleRate,
            frames: rendered.length,
            first:
              left.slice(0, 960).every((value) => value === -1) &&
              right.slice(0, 960).every((value) => value === 32767 / 32768),
            second:
              left.slice(960, 1920).every((value) => value === 12345 / 32768) &&
              right.slice(960, 1920).every((value) => value === -23456 / 32768),
            silence:
              left.slice(1920).every((value) => value === 0) &&
              right.slice(1920).every((value) => value === 0),
          };
        } finally {
          node.disconnect();
          node.port.close();
        }
      });
      assert.deepEqual(result, {
        rate: 48000,
        frames: 2048,
        first: true,
        second: true,
        silence: true,
      });
      phase = 'invalid-offline';
      const refused = await page.evaluate(async () => {
        const results = [];
        for (const [rate, count] of [
          [44100, 2],
          [48000, 3],
        ]) {
          const context = new OfflineAudioContext(2, 256, rate);
          await context.audioWorklet.addModule('/pcm-worklet.js');
          const packets = Array.from({ length: count }, (_, index) => {
            const pcm = new ArrayBuffer(3840);
            new Uint8Array(pcm).fill(127);
            return {
              epoch: 1n,
              timestampUs: BigInt(index) * 20000n,
              discontinuity: index === 0,
              pcm,
            };
          });
          const node = new AudioWorkletNode(context, 'bridge-pcm-s16le', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { initial: { epoch: 1n, packets } },
          });
          node.connect(context.destination);
          try {
            const output = await context.startRendering();
            results.push(
              output.getChannelData(0).every((value) => value === 0) &&
                output.getChannelData(1).every((value) => value === 0),
            );
          } finally {
            node.disconnect();
            node.port.close();
          }
        }
        return results;
      });
      assert.deepEqual(refused, [true, true]);
      phase = 'gesture';
      await page.evaluate(() => {
        document.querySelector('#start').onclick = () => {
          window.audio = new AudioContext({ sampleRate: 48000 });
          window.resumed = window.audio.resume();
        };
      });
      await page.click('#start');
      phase = 'live';
      const live = await page.evaluate(async () => {
        const context = window.audio;
        await window.resumed;
        await context.audioWorklet.addModule('/pcm-worklet.js');
        const node = new AudioWorkletNode(context, 'bridge-pcm-s16le', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        const badNode = new AudioWorkletNode(context, 'bridge-pcm-s16le', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        let id = 0;
        const command = (data) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Worklet acknowledgement deadline')),
              2000,
            );
            node.port.onmessage = ({ data: reply }) => {
              clearTimeout(timer);
              resolve(reply);
            };
            node.port.postMessage({ ...data, id: ++id });
          });
        try {
          node.connect(context.destination);
          const config = await command({ type: 'config', epoch: 1n });
          const packet = await command({
            type: 'packet',
            packet: {
              epoch: 1n,
              timestampUs: 0n,
              discontinuity: true,
              pcm: new ArrayBuffer(3840),
            },
          });
          const stats = await command({ type: 'stats' });
          const reset = await command({ type: 'reset' });
          const disposed = await command({ type: 'dispose' });
          badNode.connect(context.destination);
          const badCommand = (data, id) =>
            new Promise((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('Worklet refusal deadline')),
                2000,
              );
              badNode.port.onmessage = ({ data: reply }) => {
                clearTimeout(timer);
                resolve(reply);
              };
              badNode.port.postMessage({ ...data, id });
            });
          await badCommand({ type: 'config', epoch: 1n }, 1);
          const bad = await badCommand(
            {
              type: 'packet',
              packet: {
                epoch: 1n,
                timestampUs: 0n,
                discontinuity: true,
                pcm: new ArrayBuffer(3841),
              },
            },
            2,
          );
          return {
            state: context.state,
            rate: context.sampleRate,
            accepted: [config, packet, stats, reset, disposed].every(
              (value) => value.accepted,
            ),
            ids: [config, packet, stats, reset, disposed].map(
              (value) => value.id,
            ),
            packets: stats.stats.packets,
            queued: stats.stats.queuedFrames,
            malformedRefused: bad.accepted === false && bad.id === 2,
          };
        } finally {
          node.disconnect();
          node.port.close();
          badNode.disconnect();
          badNode.port.close();
          await context.close();
        }
      });
      assert.equal(live.state, 'running');
      assert.equal(live.rate, 48000);
      assert.equal(live.accepted, true);
      assert.deepEqual(live.ids, [1, 2, 3, 4, 5]);
      assert.equal(live.packets, 1);
      assert.equal(live.queued, 960);
      assert.equal(live.malformedRefused, true);
    } catch (error) {
      testContext.diagnostic('PCM fixture phase: ' + phase);
      throw error;
    } finally {
      testContext.signal.removeEventListener('abort', aborted);
      phase = 'page-close';
      try {
        await page?.close();
      } finally {
        server.closeAllConnections();
        phase = 'browser-close';
        try {
          await browser?.close();
        } finally {
          phase = 'server-close';
          await new Promise((resolve) => server.close(resolve));
        }
      }
    }
  },
);
