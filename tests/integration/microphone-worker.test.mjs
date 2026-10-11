import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import {
  WorkerProcess,
  NativeSessionWorker,
  MicrophoneIngress,
  MicrophoneOwnership,
} from '../../packages/node-bridge/dist/index.js';
import { encodeMicrophoneRecord } from '../../packages/protocol/dist/index.js';
import { eventually } from '../fixtures/session-worker.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
const directory = process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation';
const suffix = process.platform === 'win32' ? '.exe' : '';
const configuration = (host, microphone = 'pcm') => ({
  target: { host },
  auth: {},
  media: { microphone },
});
const samples = (epoch = 1n) => ({
  epoch,
  timestampUs: 0n,
  discontinuity: true,
  pcm: Buffer.alloc(3840, 7),
});
async function run(body, peer = 'fixture-microphone') {
  const runtimeRoot = await mkdtemp(
    join(tmpdir(), 'bridge-microphone-worker-'),
  );
  class SyntheticMicrophoneWorker extends WorkerProcess {
    spawnWorker(cwd, env) {
      return spawn(
        process.execPath,
        [resolve('tests/fixtures/microphone-worker.mjs')],
        {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
    }
  }
  const Worker =
    peer === 'fixture-microphone-reset'
      ? SyntheticMicrophoneWorker
      : WorkerProcess;
  const worker = new Worker({
    workerPath:
      peer === 'fixture-microphone-reset'
        ? process.execPath
        : resolve(directory, peer + suffix),
    runtimeRoot,
    heartbeatIntervalMs: 60000,
  });
  try {
    await worker.start();
    await body(worker);
  } finally {
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}
test('fake microphone peer: explicit private PCM selection, immutable state and bounded source admission', async () => {
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.pcmInput, true);
    assert.equal(worker.build.capabilities.pcmOutput, false);
    assert.equal(await worker.sendMicrophone(samples()), 'unavailable');
    const events = [];
    worker.on('microphone', (state) => events.push(state));
    await worker.connect(configuration('valid'));
    await eventually(() => events.length === 1);
    assert.equal(Object.isFrozen(events[0]), true);
    worker.microphoneState.epoch = 5n;
    assert.equal(worker.microphoneState.epoch, 1n);
    const input = samples();
    assert.equal(await worker.sendMicrophone(input), 'accepted');
    assert.equal(input.pcm[0], 7);
    assert.equal(await worker.sendMicrophone(samples(2n)), 'stale');
    await assert.rejects(
      worker.sendMicrophone({ ...input, pcm: Buffer.alloc(3) }),
    );
    await worker.ping();
    await worker.close();
    assert.equal(events.length, 1);
    assert.equal(worker.microphoneState, undefined);
  });
});
test('fake microphone peer: only one in-flight packet, heartbeat completes ownership without sample retry', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('hold'));
    await eventually(() => worker.microphoneState?.availability === 'ready');
    const first = worker.sendMicrophone(samples());
    assert.equal(await worker.sendMicrophone(samples()), 'busy');
    await worker.ping();
    assert.equal(await first, 'accepted');
    const next = worker.sendMicrophone(samples());
    const closing = worker.close();
    assert.equal(await next, 'unavailable');
    await closing;
    assert.equal(worker.state, 'closed');
  });
});
test('fake microphone peer: epoch replacement reports stale without replaying old samples', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('stale'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    assert.equal(await worker.sendMicrophone(samples()), 'stale');
    await eventually(() => worker.microphoneState?.epoch === 2n);
    assert.equal(await worker.sendMicrophone(samples()), 'stale');
    await worker.ping();
    assert.equal(worker.microphoneState.epoch, 2n);
    assert.equal(await worker.sendMicrophone(samples(2n)), 'stale');
    await eventually(() => worker.microphoneState?.epoch === 3n);
  });
});
test('fake microphone peer: off, waiting, missing metadata and closed sources do not send samples', async () => {
  for (const host of ['off', 'waiting', 'no-status', 'closed'])
    await run(async (worker) => {
      await worker.connect(configuration(host, host === 'off' ? 'off' : 'pcm'));
      await worker.ping();
      assert.equal(await worker.sendMicrophone(samples()), 'unavailable');
      assert.equal(worker.state, 'ready');
    });
});
test('fake microphone peer: premature, unsolicited, replayed and malformed authority fails IPC', async () => {
  for (const host of [
    'early',
    'unsolicited',
    'replay',
    'clock',
    'disabled',
    'malformed',
    'disconnected',
  ])
    await run(async (worker) => {
      const failures = [];
      worker.on('failure', (error) => failures.push(error.code));
      await worker
        .connect(configuration(host, host === 'unsolicited' ? 'off' : 'pcm'))
        .catch(() => {});
      await eventually(() => failures.length === 1);
      assert.equal(failures[0], 'IPC_PROTOCOL_ERROR');
      assert.equal(worker.state, 'failed');
    });
  await run(async (worker) => {
    await worker.connect(configuration('bad-result'));
    await eventually(() => worker.microphoneState?.availability === 'ready');
    await assert.rejects(worker.sendMicrophone(samples()), {
      code: 'IPC_PROTOCOL_ERROR',
    });
    assert.equal(worker.state, 'failed');
  });
});
test('private microphone selection: legacy and Opus input refuse before configure; public path stays gated', async () => {
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.pcmInput, false);
    await assert.rejects(worker.connect(configuration('valid')), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    await assert.rejects(worker.sendMicrophone(samples()), {
      code: 'MICROPHONE_NOT_IMPLEMENTED',
    });
    await worker.connect(configuration('valid', 'off'));
    await worker.ping();
  }, 'fixture-audio-1');
  await run(async (worker) => {
    await assert.rejects(worker.connect(configuration('valid', 'opus')), {
      code: 'RDP_SETTING_NOT_IMPLEMENTED',
    });
    await worker.connect(configuration('valid'));
    await worker.ping();
  });
  const runtimeRoot = await mkdtemp(
    join(tmpdir(), 'bridge-microphone-public-'),
  );
  const worker = new NativeSessionWorker({
    workerPath: resolve(directory, 'missing-worker' + suffix),
    runtimeRoot,
  });
  try {
    await assert.rejects(
      worker.start(configuration('valid'), new AbortController().signal),
      { code: 'RDP_SETTING_NOT_IMPLEMENTED' },
    );
    assert.deepEqual(await readdir(runtimeRoot), []);
  } finally {
    await worker.close();
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
});
test('synthetic process: public PCM ingress projects into private IPC, drains and resets before fresh ownership', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('valid'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    let authorized = true;
    const ingress = new MicrophoneIngress({
      authorized: () => authorized,
      source: () => worker.microphoneState,
      submit: (packet) => worker.sendMicrophone(packet),
    });
    assert.equal(
      (await ingress.receive(encodeMicrophoneRecord(samples(), 1))).result,
      'accepted',
    );
    authorized = false;
    await ingress.close();
    assert.equal(await worker.resetMicrophone(ingress.drainEpoch), 'scheduled');
    await eventually(() => worker.microphoneState?.epoch === 2n);
    assert.equal(
      (await ingress.receive(encodeMicrophoneRecord(samples(2n), 2))).result,
      'unavailable',
    );
    const replacement = new MicrophoneIngress({
      authorized: () => true,
      source: () => worker.microphoneState,
      submit: (packet) => worker.sendMicrophone(packet),
    });
    assert.equal(
      (await replacement.receive(encodeMicrophoneRecord(samples(), 1))).result,
      'stale',
    );
    assert.equal(
      (await replacement.receive(encodeMicrophoneRecord(samples(2n), 2)))
        .result,
      'accepted',
    );
    await replacement.close();
    assert.equal(
      await worker.resetMicrophone(replacement.drainEpoch),
      'scheduled',
    );
    await worker.ping();
  }, 'fixture-microphone-reset');
});
test('synthetic process: microphone ownership barrier joins private reset and fresh publication before transfer', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('valid'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    const ownership = new MicrophoneOwnership({
      source: () => worker.microphoneState,
      onSource: (listener) => {
        worker.on('microphone', listener);
        return () => worker.off('microphone', listener);
      },
      submit: (packet) => worker.sendMicrophone(packet),
      reset: (epoch) => worker.resetMicrophone(epoch),
      terminate: () => worker.terminate(),
    });
    const first = ownership.acquire(() => true);
    assert.equal(
      (await first.receive(encodeMicrophoneRecord(samples(), 1))).result,
      'accepted',
    );
    const released = ownership.release(first);
    assert.equal(ownership.release(first), released);
    assert.equal(
      ownership.acquire(() => true),
      undefined,
    );
    assert.equal(await released, true);
    assert.equal(worker.microphoneState.epoch, 2n);
    assert.equal(worker.listenerCount('microphone'), 0);
    const replacement = ownership.acquire(() => true);
    assert.equal(await ownership.release(first), false);
    assert.equal(
      (await first.receive(encodeMicrophoneRecord(samples(2n), 2))).result,
      'unavailable',
    );
    assert.equal(
      (await replacement.receive(encodeMicrophoneRecord(samples(2n), 1)))
        .result,
      'accepted',
    );
    assert.equal(await ownership.close(), true);
    assert.equal(ownership.status, 'closed');
    assert.equal(worker.microphoneState.epoch, 3n);
    assert.equal(worker.listenerCount('microphone'), 0);
    await worker.ping();
  }, 'fixture-microphone-reset');
});
const native = JSON.parse(
  execFileSync(resolve(directory, 'rdp-worker' + suffix), ['--capabilities'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
).capabilities.pcmInput;
test('private microphone reset: old PCM peers refuse without dispatch; new epoch resumes only fresh PCM', async () => {
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.microphoneReset, false);
    await assert.rejects(worker.resetMicrophone(1n), {
      code: 'MICROPHONE_RESET_NOT_IMPLEMENTED',
    });
    await worker.connect(configuration('valid'));
    await worker.ping();
  });
  await run(async (worker) => {
    assert.equal(worker.build.capabilities.microphoneReset, true);
    assert.equal(await worker.resetMicrophone(1n), 'unavailable');
    await worker.connect(configuration('valid'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    assert.equal(await worker.resetMicrophone(2n), 'stale');
    assert.equal(await worker.resetMicrophone(1n), 'scheduled');
    await eventually(() => worker.microphoneState?.epoch === 2n);
    assert.equal(await worker.sendMicrophone(samples()), 'stale');
    assert.equal(await worker.sendMicrophone(samples(2n)), 'accepted');
    await assert.rejects(worker.resetMicrophone(0n));
    await worker.ping();
  }, 'fixture-microphone-reset');
});
test('fake microphone reset: one pending operation pauses PCM and shutdown drains correlation', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('reset-hold'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    const pending = worker.resetMicrophone(1n);
    assert.equal(await worker.resetMicrophone(1n), 'busy');
    assert.equal(await worker.sendMicrophone(samples()), 'busy');
    await worker.ping();
    assert.equal(await pending, 'scheduled');
    await eventually(() => worker.microphoneState?.epoch === 2n);
    const second = worker.resetMicrophone(2n);
    const closing = worker.close();
    assert.equal(await second, 'unavailable');
    await closing;
    assert.equal(worker.state, 'closed');
  }, 'fixture-microphone-reset');
  await run(async (worker) => {
    await worker.connect(configuration('hold'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    const pending = worker.sendMicrophone(samples());
    assert.equal(await worker.resetMicrophone(1n), 'busy');
    await worker.ping();
    assert.equal(await pending, 'accepted');
  }, 'fixture-microphone-reset');
});
test('fake microphone reset: scheduled old epoch remains paused; typed refusal does not replay or replace state', async () => {
  await run(async (worker) => {
    await worker.connect(configuration('reset-scheduled-only'));
    await eventually(() => worker.microphoneState?.epoch === 1n);
    assert.equal(await worker.resetMicrophone(1n), 'scheduled');
    assert.equal(await worker.resetMicrophone(1n), 'busy');
    assert.equal(await worker.sendMicrophone(samples()), 'unavailable');
    await worker.ping();
    assert.equal(worker.microphoneState.epoch, 1n);
  }, 'fixture-microphone-reset');
  for (const [host, result] of [
    ['reset-stale', 'stale'],
    ['reset-busy', 'busy'],
    ['reset-unavailable', 'unavailable'],
  ])
    await run(async (worker) => {
      await worker.connect(configuration(host));
      await eventually(() => worker.microphoneState?.epoch === 1n);
      assert.equal(await worker.resetMicrophone(1n), result);
      await worker.ping();
      assert.equal(worker.microphoneState.epoch, 1n);
      assert.equal(await worker.sendMicrophone(samples()), 'accepted');
    }, 'fixture-microphone-reset');
});
test('fake microphone reset: malformed and duplicate results terminate private IPC', async () => {
  for (const host of ['reset-malformed', 'reset-duplicate'])
    await run(async (worker) => {
      const failures = [];
      worker.on('failure', (error) => failures.push(error.code));
      await worker.connect(configuration(host));
      await eventually(() => worker.microphoneState?.epoch === 1n);
      await worker.resetMicrophone(1n).catch(() => {});
      await eventually(() => failures.length === 1);
      assert.equal(failures[0], 'IPC_PROTOCOL_ERROR');
      assert.equal(worker.state, 'failed');
    }, 'fixture-microphone-reset');
});
test(
  'actual native private Node microphone: strict TLS refusal publishes closed input and cleans up',
  { skip: !native, timeout: 15000 },
  async () => {
    const endpoint = await createRdpTlsFixture();
    try {
      await run(async (worker) => {
        const microphone = [],
          terminal = [];
        worker.on('microphone', (state) => microphone.push(state));
        worker.on('rdp-state', (state) => {
          if (state.state === 'failed') terminal.push(state);
        });
        await worker.connect({
          target: { host: '127.0.0.1', port: endpoint.port },
          auth: { username: 'synthetic', password: 'synthetic-IPC-sentinel' },
          security: { protocol: 'tls', certificatePolicy: 'strict' },
          media: { microphone: 'pcm' },
          timeouts: { connectMs: 5000 },
        });
        await eventually(() => terminal.length === 1);
        assert.equal(terminal[0].error, 'RDP_CERTIFICATE_REJECTED');
        assert.equal(microphone.length, 1);
        assert.equal(worker.microphoneState.availability, 'closed');
        assert.equal(worker.build.capabilities.microphoneReset, true);
        assert.equal(await worker.resetMicrophone(1n), 'unavailable');
        assert.equal(await worker.sendMicrophone(samples()), 'unavailable');
        assert.equal(endpoint.applicationBytes, 0);
        await worker.ping();
      }, 'rdp-worker');
    } finally {
      await endpoint.close();
    }
  },
);
