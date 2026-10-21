import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import {
  decodeMicrophoneOpusRecord,
  encodeMicrophoneOpus,
  decodeMicrophonePcm,
} from '../../packages/protocol/dist/index.js';
const binaryDir = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const linked =
  process.platform === 'win32' &&
  JSON.parse(
    execFileSync(resolve(binaryDir, 'rdp-worker.exe'), ['--capabilities'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 8192,
    }),
  ).freeRdpVersion !== null;
async function nativeDecode(packets) {
  assert.ok(packets.length <= 16);
  const records = packets.map((packet) => {
    const body = encodeMicrophoneOpus(packet),
      header = Buffer.alloc(2);
    header.writeUInt16BE(body.length);
    return Buffer.concat([header, body]);
  });
  const input = Buffer.concat([...records, Buffer.alloc(2)]);
  return await new Promise((done, reject) => {
    const child = spawn(
      resolve(binaryDir, 'fixture-microphone-opus-decode.exe'),
      [],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const chunks = [];
    let size = 0,
      errors = 0,
      failure;
    const timer = setTimeout(() => {
      failure = new Error('Native synthetic codec deadline');
      child.kill();
    }, 5000);
    child.stdout.on('data', (bytes) => {
      size += bytes.length;
      if (size > 65536) {
        failure = new Error('Native synthetic output limit');
        child.kill();
      } else chunks.push(bytes);
    });
    child.stderr.on('data', (bytes) => {
      errors += bytes.length;
      if (errors > 1024) {
        failure = new Error('Native synthetic diagnostics limit');
        child.kill();
      }
    });
    child.once('error', (error) => {
      failure = error;
    });
    child.stdin.once('error', (error) => {
      failure = error;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure || code !== 0 || errors !== 0)
        reject(failure ?? new Error('Native synthetic codec failed'));
      else done(Buffer.concat(chunks, size));
    });
    child.stdin.end(input);
  });
}

test(
  'Edge/native microphone Opus: synthetic stereo encoder wire projection and compensated libopus capture clock agree',
  {
    skip: !linked,
    timeout: 25000,
  },
  async () => {
    const files = new Map(
      await Promise.all(
        ['microphone-opus-encoder.js', 'microphone-opus-wire.js'].map(
          async (name) => [
            '/' + name,
            await readFile('apps/reference-harness/' + name),
          ],
        ),
      ),
    );
    const server = createServer((request, reply) => {
      reply.setHeader(
        'Content-Type',
        files.has(request.url) ? 'text/javascript' : 'text/html',
      );
      reply.end(
        files.get(request.url) ??
          '<!doctype html><title>Synthetic native Opus capture</title>',
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
        let captureCalls = 0,
          failed = 0,
          resolve;
        navigator.mediaDevices.getUserMedia = () => {
          ++captureCalls;
          throw new Error('Physical microphone forbidden');
        };
        const { MicrophoneOpusEncoder } = await import(
          '/microphone-opus-encoder.js'
        );
        const { encodeMicrophoneOpusRecord } = await import(
          '/microphone-opus-wire.js'
        );
        const records = [];
        const encoder = new MicrophoneOpusEncoder(1n, {
          authorized: () => true,
          receive(unit) {
            records.push(
              Array.from(
                new Uint8Array(
                  encodeMicrophoneOpusRecord(unit, records.length + 1),
                ),
              ),
            );
            resolve();
            return true;
          },
          failed() {
            ++failed;
            resolve?.();
          },
        });
        try {
          for (let index = 0; index < 8; ++index) {
            const pcm = new Uint8Array(3840),
              view = new DataView(pcm.buffer);
            for (let frame = 0; frame < 960; ++frame)
              for (let channel = 0; channel < 2; ++channel) {
                const value = Math.round(
                  (channel === 0 ? 12000 : 8000) *
                    Math.sin(
                      (2 *
                        Math.PI *
                        (channel === 0 ? 440 : 660) *
                        (index * 960 + frame)) /
                        48000,
                    ),
                );
                view.setInt16(frame * 4 + channel * 2, value, true);
              }
            const completed = new Promise((done) => {
              resolve = done;
            });
            if (
              !encoder.encode({
                epoch: 1n,
                timestampUs: BigInt(index) * 20000n,
                discontinuity: index === 0 || index === 4,
                pcm,
              })
            )
              throw new Error('Synthetic encode refused');
            await completed;
            if (failed) break;
          }
          encoder.close();
          return { records, failed, captureCalls };
        } finally {
          encoder.close();
        }
      });
      assert.equal(result.failed, 0);
      assert.equal(result.captureCalls, 0);
      assert.equal(result.records.length, 8);
      const packets = result.records.map((bytes) =>
        decodeMicrophoneOpusRecord(Buffer.from(bytes)),
      );
      for (const [index, p] of packets.entries()) {
        assert.equal(p.sequence, index + 1);
        assert.equal(p.timestampUs, BigInt(index) * 20000n);
        assert.equal(p.discontinuity, index === 0 || index === 4);
        assert.ok(p.lookaheadFrames > 0 && p.lookaheadFrames <= 960);
        assert.equal(
          p.lookaheadFrames,
          packets[index < 4 ? 0 : 4].lookaheadFrames,
        );
      }
      const bytes = await nativeDecode(packets),
        outputs = [];
      let offset = 0,
        priming = 0;
      for (let index = 0; index < 8; ++index) {
        assert.ok(offset + 2 <= bytes.length);
        const length = bytes.readUInt16BE(offset);
        offset += 2;
        if (length === 0) {
          ++priming;
          assert.ok(index === 0 || index === 4);
        } else {
          assert.equal(length, 3864);
          assert.ok(offset + length <= bytes.length);
          outputs.push(
            decodeMicrophonePcm(bytes.subarray(offset, offset + length)),
          );
          offset += length;
        }
      }
      assert.equal(offset, bytes.length);
      assert.equal(priming, 2);
      assert.equal(outputs.length, 6);
      assert.deepEqual(
        outputs.map((p) => p.timestampUs),
        [0n, 20000n, 40000n, 80000n, 100000n, 120000n],
      );
      assert.deepEqual(
        outputs.map((p) => p.discontinuity),
        [true, false, false, true, false, false],
      );
      for (const p of outputs)
        for (let channel = 0; channel < 2; ++channel) {
          assert.equal(p.epoch, 1n);
          let dot = 0,
            actualEnergy = 0,
            expectedEnergy = 0;
          const first = (Number(p.timestampUs) * 48000) / 1000000;
          for (let frame = 0; frame < 960; ++frame) {
            const actual = p.pcm.readInt16LE(frame * 4 + channel * 2);
            const expected =
              (channel === 0 ? 12000 : 8000) *
              Math.sin(
                (2 * Math.PI * (channel === 0 ? 440 : 660) * (first + frame)) /
                  48000,
              );
            dot += actual * expected;
            actualEnergy += actual * actual;
            expectedEnergy += expected * expected;
          }
          assert.ok(Math.sqrt(actualEnergy / 960) > 1000);
          assert.ok(
            dot / Math.sqrt(actualEnergy * expectedEnergy) > 0.95,
            'Compensated synthetic tone aligns with capture PTS',
          );
        }
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  },
);
