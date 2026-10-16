import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge microphone Worklet: synthetic offline S16LE capture, silent output, live port credit/epoch/pause and no device permission',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const files = new Map(
      await Promise.all(
        ['microphone-worklet.js', 'microphone-capture.js'].map(async (name) => [
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
        files.get(request.url) ?? '<button id="start">Synthetic audio</button>',
      );
    });
    await listenBrowserHttp(server);
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
      // Any accidental device acquisition fails the test; no physical microphone is touched.
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new Error(
            'Device capture is forbidden in this synthetic fixture',
          );
        };
      });
      const offline = await page.evaluate(async () => {
        const context = new OfflineAudioContext(1, 2048, 48000);
        await context.audioWorklet.addModule('/microphone-worklet.js');
        const node = new AudioWorkletNode(context, 'bridge-microphone-s16le', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { epoch: 17n },
        });
        const buffer = context.createBuffer(2, 2048, 48000);
        buffer.getChannelData(0).fill(-1);
        buffer.getChannelData(1).fill(0.5);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(node);
        node.connect(context.destination);
        const messages = [];
        let packetResolve;
        const packet = new Promise((resolve) => {
          packetResolve = resolve;
        });
        node.port.onmessage = ({ data }) => {
          messages.push(data);
          if (data.type === 'packet') packetResolve(data);
        };
        source.start();
        try {
          const [rendered, captured] = await Promise.all([
            context.startRendering(),
            packet,
          ]);
          const view = new DataView(captured.pcm);
          return {
            epoch: captured.epoch.toString(),
            id: captured.id,
            timestampUs: captured.timestampUs.toString(),
            bytes: captured.pcm.byteLength,
            left: Array.from({ length: 960 }, (_, at) =>
              view.getInt16(at * 4, true),
            ).every((value) => value === -32768),
            right: Array.from({ length: 960 }, (_, at) =>
              view.getInt16(at * 4 + 2, true),
            ).every((value) => value === 16384),
            silent: rendered.getChannelData(0).every((value) => value === 0),
            packets: messages.filter((value) => value.type === 'packet').length,
            ready: messages.find((value) => value.type === 'ready')?.accepted,
          };
        } finally {
          source.disconnect();
          node.disconnect();
          node.port.close();
        }
      });
      assert.deepEqual(offline, {
        epoch: '17',
        id: 1,
        timestampUs: '0',
        bytes: 3840,
        left: true,
        right: true,
        silent: true,
        packets: 1,
        ready: true,
      });
      await page.evaluate(() => {
        document.querySelector('#start').onclick = () => {
          window.context = new AudioContext({ sampleRate: 48000 });
          window.resumed = window.context.resume();
        };
      });
      await page.click('#start');
      const live = await page.evaluate(async () => {
        const context = window.context;
        await window.resumed;
        await context.audioWorklet.addModule('/microphone-worklet.js');
        const node = new AudioWorkletNode(context, 'bridge-microphone-s16le', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { epoch: 1n },
        });
        const source = context.createConstantSource();
        source.offset.value = 0.25;
        source.connect(node);
        node.connect(context.destination);
        source.start();
        const packets = [],
          results = [];
        let ready = false,
          fault = false;
        node.port.onmessage = ({ data }) => {
          if (data.type === 'ready') ready = data.accepted;
          if (data.type === 'fault') fault = true;
          if (data.type === 'packet' && packets.length < 16) packets.push(data);
          if (data.type === 'result' && results.length < 16) results.push(data);
        };
        const wait = async (predicate) => {
          const until = performance.now() + 2000;
          while (!predicate()) {
            if (performance.now() >= until)
              throw new Error('Synthetic microphone fixture timed out');
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
        };
        try {
          await wait(() => ready && packets.length === 1);
          await new Promise((resolve) => setTimeout(resolve, 60));
          const held = packets.length === 1;
          node.port.postMessage({ type: 'ack', id: packets[0].id });
          await wait(() => packets.length === 2);
          const latestGap =
            packets[1].timestampUs > packets[0].timestampUs + 20000n;
          node.port.postMessage({ type: 'config', id: 1, epoch: 2n });
          await wait(() => results.some((value) => value.id === 1));
          await new Promise((resolve) => setTimeout(resolve, 30));
          node.port.postMessage({ type: 'ack', id: packets[1].id });
          await wait(() => packets.length === 3);
          const freshEpoch = packets[2].epoch === 2n;
          node.port.postMessage({ type: 'pause', id: 2 });
          await wait(() => results.some((value) => value.id === 2));
          node.port.postMessage({ type: 'ack', id: packets[2].id });
          await new Promise((resolve) => setTimeout(resolve, 40));
          const paused = packets.length === 3;
          node.port.postMessage({ type: 'dispose', id: 3 });
          await wait(() => results.some((value) => value.id === 3));
          const values = new DataView(packets[0].pcm);
          return {
            state: context.state,
            rate: context.sampleRate,
            held,
            latestGap,
            freshEpoch,
            paused,
            accepted:
              results.length === 3 && results.every((value) => value.accepted),
            sample: values.getInt16(0, true),
            mono: values.getInt16(2, true),
            fault,
          };
        } finally {
          source.stop();
          source.disconnect();
          node.disconnect();
          node.port.close();
          await context.close();
        }
      });
      assert.deepEqual(live, {
        state: 'running',
        rate: 48000,
        held: true,
        latestGap: true,
        freshEpoch: true,
        paused: true,
        accepted: true,
        sample: 8192,
        mono: 8192,
        fault: false,
      });
      const refused = await page.evaluate(async () => {
        const context = new OfflineAudioContext(1, 1024, 44100);
        await context.audioWorklet.addModule('/microphone-worklet.js');
        const node = new AudioWorkletNode(context, 'bridge-microphone-s16le', {
          processorOptions: { epoch: 1n },
        });
        const source = context.createConstantSource();
        source.connect(node);
        node.connect(context.destination);
        source.start();
        const messages = [];
        node.port.onmessage = ({ data }) => messages.push(data);
        try {
          const rendered = await context.startRendering();
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            refused: messages.some(
              (value) => value.type === 'ready' && value.accepted === false,
            ),
            packets: messages.filter((value) => value.type === 'packet').length,
            silent: rendered.getChannelData(0).every((value) => value === 0),
          };
        } finally {
          source.disconnect();
          node.disconnect();
          node.port.close();
        }
      });
      assert.deepEqual(refused, { refused: true, packets: 0, silent: true });
    } finally {
      await page?.close();
      server.closeAllConnections();
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
