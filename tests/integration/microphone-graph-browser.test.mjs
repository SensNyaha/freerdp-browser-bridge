import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge microphone graph: synthetic permission/stream, actual Worklet into bounded RWB1 sender, held network credit and complete graph/track retirement',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const names = [
      'microphone-graph.js',
      'microphone-permission.js',
      'microphone-sender.js',
      'microphone-wire.js',
      'microphone-worklet.js',
      'microphone-capture.js',
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
        files.get(request.url) ??
          '<button id="start">Synthetic microphone graph</button>',
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
      await page.evaluate(async () => {
        const [
          { MicrophoneGraph },
          { MicrophonePermission },
          { MicrophoneSender },
          { parseMicrophoneRecord },
        ] = await Promise.all([
          import('/microphone-graph.js'),
          import('/microphone-permission.js'),
          import('/microphone-sender.js'),
          import('/microphone-wire.js'),
        ]);
        document.querySelector('#start').onclick = async () => {
          const context = new AudioContext({ sampleRate: 48000 });
          const resumed = context.resume();
          const destination = context.createMediaStreamDestination(),
            tone = context.createConstantSource();
          tone.offset.value = -0.5;
          tone.connect(destination);
          tone.start();
          const stream = destination.stream,
            records = [];
          let graph,
            owner,
            held = true,
            authorized = true,
            retired = 0,
            failed = 0,
            requests = 0;
          navigator.mediaDevices.getUserMedia = () => {
            ++requests;
            return Promise.resolve(stream);
          };
          const state = (granted, epoch = '1', revision = '1') => ({
            granted,
            retiring: false,
            source: {
              enabled: true,
              availability: 'ready',
              revision,
              epoch,
              timestampUs: '0',
            },
          });
          const sender = new MicrophoneSender({
            send(record) {
              const value = parseMicrophoneRecord(record);
              if (records.length >= 16)
                throw new Error('Synthetic record storage exhausted');
              records.push(record.slice(0));
              if (!held)
                queueMicrotask(() =>
                  sender.acknowledge(
                    {
                      sequence: value.sequence,
                      epoch: value.epoch.toString(),
                      status: 'accepted',
                    },
                    performance.now(),
                  ),
                );
              return true;
            },
            revoke() {
              void owner?.stop();
            },
          });
          sender.status(state(false), performance.now());
          owner = new MicrophonePermission({
            eligible: () => authorized,
            begin(value, epoch) {
              sender.status(state(true), performance.now());
              const token = sender.authorize(performance.now());
              graph = new MicrophoneGraph(
                context,
                value,
                epoch,
                token,
                sender,
                {
                  authorized: () => authorized,
                  retire() {
                    ++retired;
                    authorized = false;
                    sender.status(state(false, '2', '2'), performance.now());
                    return Promise.resolve();
                  },
                  failed() {
                    ++failed;
                    void owner.stop();
                  },
                },
              );
              return graph;
            },
          });
          // The gesture prepares/resumes the context before the permission activation scope.
          await resumed;
          const started = owner.start(1n);
          window.fixture = {
            context,
            destination,
            tone,
            stream,
            sender,
            owner,
            started,
            records,
            graph: () => graph,
            release() {
              held = false;
              const value = parseMicrophoneRecord(records[0]);
              sender.acknowledge(
                { sequence: value.sequence, epoch: '1', status: 'accepted' },
                performance.now(),
              );
            },
            result: () => ({ requests, retired, failed }),
            parseMicrophoneRecord,
          };
        };
      });
      await page.click('#start');
      await page.waitForFunction(() => Boolean(window.fixture));
      const started = await page.evaluate(() => window.fixture.started);
      assert.equal(started, true);
      await page.waitForFunction(
        () => window.fixture.sender.stats.replaced >= 2,
      );
      const held = await page.evaluate(() => ({
        records: window.fixture.records.length,
        pending: window.fixture.sender.stats.pendingBytes,
        portPackets: window.fixture.graph().stats.lastPacketId,
      }));
      assert.equal(held.records, 1);
      assert.equal(held.pending, 3840);
      assert.ok(held.portPackets >= 4);
      await page.evaluate(() => window.fixture.release());
      await page.waitForFunction(() => window.fixture.records.length >= 3);
      const result = await page.evaluate(async () => {
        const f = window.fixture;
        const packets = f.records.map(f.parseMicrophoneRecord);
        const samples = packets.flatMap((value) =>
          Array.from(
            new Int16Array(value.pcm.buffer, value.pcm.byteOffset, 1920),
          ),
        );
        const latest =
          packets[1].timestampUs > packets[0].timestampUs + 20000n &&
          packets[1].discontinuity;
        await f.owner.stop();
        const count = f.records.length;
        await new Promise((resolve) => setTimeout(resolve, 40));
        const result = {
          latest,
          hasSignal: samples.includes(-16384),
          profile: packets.every(
            (value) => value.epoch === 1n && value.pcm.byteLength === 3840,
          ),
          contextClosed: f.context.state === 'closed',
          trackEnded: f.stream.getAudioTracks()[0].readyState === 'ended',
          graphClosed: f.graph().stats.closed,
          noLateRecords: f.records.length === count,
          pendingBytes: f.sender.stats.pendingBytes,
          ...f.result(),
        };
        f.tone.disconnect();
        f.destination.disconnect();
        await f.owner.close();
        return result;
      });
      assert.deepEqual(result, {
        latest: true,
        hasSignal: true,
        profile: true,
        contextClosed: true,
        trackEnded: true,
        graphClosed: true,
        noLateRecords: true,
        pendingBytes: 0,
        requests: 1,
        retired: 1,
        failed: 0,
      });
    } finally {
      await page?.close();
      server.closeAllConnections();
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
