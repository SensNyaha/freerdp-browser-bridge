import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

test(
  'Edge microphone permission owner: real gesture gate, fake getUserMedia, late synthetic track stop and grant-loss cleanup',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const module = await readFile(
      'apps/reference-harness/microphone-permission.js',
    );
    const server = createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        request.url === '/microphone-permission.js'
          ? 'text/javascript'
          : 'text/html',
      );
      response.end(
        request.url === '/microphone-permission.js'
          ? module
          : '<button id="start">Synthetic permission</button>',
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
      const before = await page.evaluate(async () => {
        const { MicrophonePermission } = await import(
          '/microphone-permission.js'
        );
        const context = new AudioContext({ sampleRate: 48000 });
        const destination = context.createMediaStreamDestination();
        const stream = destination.stream;
        let resolvePermission;
        const permission = new Promise((resolve) => {
          resolvePermission = resolve;
        });
        const calls = { request: 0, begin: 0, close: 0 },
          options = [];
        navigator.mediaDevices.getUserMedia = (constraints) => {
          ++calls.request;
          options.push(constraints);
          return permission;
        };
        const owner = new MicrophonePermission({
          eligible: () => true,
          begin() {
            ++calls.begin;
            return {
              ready: Promise.resolve(true),
              current: () => true,
              close() {
                ++calls.close;
                return Promise.resolve();
              },
            };
          },
        });
        window.fixture = {
          context,
          destination,
          stream,
          calls,
          options,
          owner,
          resolvePermission,
          MicrophonePermission,
        };
        document.querySelector('#start').onclick = () => {
          window.started = owner.start(1n);
        };
        // Playwright evaluation itself can carry transient activation. Observe its
        // expiry rather than treating the automation call as a gesture-free task.
        const startedWithoutGesture = await new Promise((resolve, reject) => {
          const deadline = performance.now() + 7000;
          const check = () => {
            if (!navigator.userActivation.isActive) {
              void owner.start(1n).then(resolve, reject);
              return;
            }
            if (performance.now() >= deadline) {
              reject(new Error('Transient browser activation did not expire'));
              return;
            }
            setTimeout(check, 50);
          };
          check();
        });
        return {
          startedWithoutGesture,
          calls: calls.request,
          live: stream.getAudioTracks()[0].readyState,
        };
      });
      assert.deepEqual(before, {
        startedWithoutGesture: false,
        calls: 0,
        live: 'live',
      });
      await page.click('#start');
      const cancelled = await page.evaluate(async () => {
        const f = window.fixture;
        const stop = await f.owner.stop();
        const started = await window.started;
        const overlapping = await f.owner.start(1n);
        f.resolvePermission(f.stream);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = {
          stop,
          started,
          overlapping,
          calls: f.calls.request,
          began: f.calls.begin,
          ended: f.stream.getAudioTracks()[0].readyState,
          pending: f.owner.stats.permissionPending,
          options: f.options[0],
        };
        await f.owner.close();
        await f.context.close();
        return result;
      });
      assert.deepEqual(cancelled, {
        stop: true,
        started: false,
        overlapping: false,
        calls: 1,
        began: 0,
        ended: 'ended',
        pending: false,
        options: {
          audio: {
            channelCount: { ideal: 2 },
            sampleRate: { ideal: 48000 },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        },
      });
      await page.evaluate(() => {
        const f = window.fixture;
        const context = new AudioContext({ sampleRate: 48000 }),
          destination = context.createMediaStreamDestination(),
          stream = destination.stream;
        let current = true,
          requests = 0,
          closed = 0;
        navigator.mediaDevices.getUserMedia = () => {
          ++requests;
          return Promise.resolve(stream);
        };
        const owner = new f.MicrophonePermission({
          eligible: () => true,
          begin: () => ({
            ready: Promise.resolve(true),
            current: () => current,
            close: () => {
              ++closed;
              return Promise.resolve();
            },
          }),
        });
        window.activeFixture = {
          context,
          destination,
          stream,
          owner,
          lose: () => {
            current = false;
          },
          result: () => ({ requests, closed }),
        };
        document.querySelector('#start').onclick = () => {
          window.started = owner.start(2n);
        };
      });
      await page.click('#start');
      const active = await page.evaluate(async () => {
        const f = window.activeFixture;
        try {
          const started = await window.started,
            active = f.owner.poll();
          f.lose();
          const revoked = !f.owner.poll();
          await f.owner.stop();
          return {
            started,
            active,
            revoked,
            ended: f.stream.getAudioTracks()[0].readyState,
            ...f.result(),
            granted: f.owner.stats.granted,
          };
        } finally {
          await f.owner.close();
          await f.context.close();
        }
      });
      assert.deepEqual(active, {
        started: true,
        active: true,
        revoked: true,
        ended: 'ended',
        requests: 1,
        closed: 1,
        granted: 1,
      });
    } finally {
      await page?.close();
      server.closeAllConnections();
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
