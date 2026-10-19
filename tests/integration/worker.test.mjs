import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { eventually } from '../fixtures/session-worker.mjs';
import {
  WorkerProcess,
  probeWorkerBuild,
  NativeSessionWorker,
  SessionManager,
} from '../../packages/node-bridge/dist/index.js';
import { createBuildServer } from '../../apps/bridge-api/dist/index.js';
import {
  Kind,
  encodePacket,
  helloPayload,
} from '../../packages/protocol/dist/index.js';
const suffix = process.platform === 'win32' ? '.exe' : '';
const binaryDir = resolve(
  process.env.BRIDGE_TEST_BINARY_DIR ?? 'build/foundation',
);
const workerPath = join(binaryDir, 'rdp-worker' + suffix);
const fixture = (mode) => join(binaryDir, `fixture-worker-${mode}${suffix}`);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function withRoot(run) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), 'rdp-bridge-test-'));
  try {
    await run(runtimeRoot);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true, maxRetries: 3 });
  }
}

test('native lifecycle integration: pipeline diagnostics are capability gated and start empty', async () => {
  await withRoot(async (runtimeRoot) => {
    const worker = new (class extends WorkerProcess {
      spawnWorker(directory, env) {
        if (process.platform === 'linux') {
          assert.equal(env.HOME, process.env.HOME);
          assert.equal(env.XDG_CONFIG_HOME, undefined);
          assert.equal(env.XDG_CACHE_HOME, undefined);
        }
        return super.spawnWorker(directory, env);
      }
    })({ workerPath, runtimeRoot });
    try {
      const build = await worker.start();
      if (build.capabilities.pipelineStats) {
        assert.deepEqual(await worker.pipelineStats(), {
          rdpChecks: 0,
          paints: 0,
          encodedFrames: 0,
          encodeMeanUs: 0,
          encodeP95Us: 0,
          encodeMaxUs: 0,
          maxReadBatch: 0,
          maxReadBatchUs: 0,
        });
      } else {
        await assert.rejects(
          worker.pipelineStats(),
          /DIAGNOSTICS_NOT_IMPLEMENTED/,
        );
      }
      await worker.ping();
    } finally {
      await worker.close();
    }
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test(
  'native integration: 100 sequential workers, hello/heartbeat/shutdown and zero leaked resources',
  { timeout: 120000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      for (let i = 0; i < 100; ++i) {
        const worker = new WorkerProcess({ workerPath, runtimeRoot });
        try {
          const build = await worker.start();
          const pid = worker.pid;
          assert.ok(pid);
          assert.equal(build.targetFreeRdpVersion, '3.32.1');
          assert.equal(build.capabilities.rdp, false);
          assert.ok(
            ['framed-pipes', 'unix-seqpacket-rws1'].includes(build.transport),
          );
          await worker.ping();
          await worker.close();
          await worker.close();
          assert.equal(worker.state, 'closed');
          assert.equal(alive(pid), false);
          assert.deepEqual(await readdir(runtimeRoot), []);
        } finally {
          await worker.close();
        }
      }
    });
  },
);

test('native lifecycle: cancellation during async startup cannot spawn a late child', async () => {
  await withRoot(async (runtimeRoot) => {
    const worker = new WorkerProcess({ workerPath, runtimeRoot });
    const startup = worker.start();
    worker.terminate();
    await assert.rejects(
      startup,
      (error) => error.code === 'WORKER_TERMINATED',
    );
    await worker.close();
    assert.equal(worker.pid, undefined);
    assert.equal(worker.state, 'failed');
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test('native integration: worker crash is isolated and a replacement starts', async () => {
  await withRoot(async (runtimeRoot) => {
    const a = new WorkerProcess({ workerPath, runtimeRoot });
    const b = new WorkerProcess({ workerPath, runtimeRoot });
    try {
      await Promise.all([a.start(), b.start()]);
      const failure = once(a, 'failure');
      process.kill(a.pid, 'SIGKILL');
      await failure;
      await a.close();
      assert.equal(a.state, 'failed');
      await b.ping();
      const c = new WorkerProcess({ workerPath, runtimeRoot });
      try {
        await c.start();
        await c.ping();
      } finally {
        await c.close();
      }
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test('native integration: build REST is backed by actual handshake and CLI report', async () => {
  await withRoot(async (runtimeRoot) => {
    const build = await probeWorkerBuild({ workerPath, runtimeRoot });
    const cli = await promisify(execFile)(
      workerPath,
      ['--version', '--capabilities'],
      { windowsHide: true },
    );
    const standalone = JSON.parse(cli.stdout);
    // Legacy native CLI reports predate the optional HELLO extension/property.
    standalone.capabilities.performanceSettings ??= false;
    assert.equal(standalone.transport, 'framed-pipes');
    assert.deepEqual({ ...standalone, transport: build.transport }, build);
    const featureCli = await promisify(execFile)(
      workerPath,
      ['--build-features'],
      { windowsHide: true },
    );
    const features = JSON.parse(featureCli.stdout);
    const server = await createBuildServer({ workerPath, runtimeRoot });
    try {
      const response = await server.inject({ method: 'GET', url: '/v1/build' });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().gitCommit, build.gitCommit);
      assert.equal(response.json().freeRdpVersion, build.freeRdpVersion);
      assert.equal(response.json().capabilities.rdp, false);
      assert.equal(response.json().capabilities.penInput, false);
      assert.equal(
        response.json().capabilities.opusOutput,
        build.capabilities.opusOutput,
      );
      assert.deepEqual(
        response.json().enabledChannels,
        features.enabledChannels,
      );
      assert.equal(
        response.json().capabilities.audioReset,
        build.capabilities.audioReset,
      );
      assert.equal(
        response.json().capabilities.pcmInput,
        build.capabilities.pcmInput,
      );
      assert.deepEqual(response.json().dependencies, features.dependencies);
      assert.equal((await server.inject('/v1/capabilities')).json().rdp, false);
      assert.equal(
        (await server.inject('/v1/capabilities')).json().penInput,
        false,
      );
      const capabilityCli = JSON.parse(
        (
          await promisify(execFile)(workerPath, ['--capabilities'], {
            windowsHide: true,
          })
        ).stdout,
      );
      assert.equal(capabilityCli.capabilities.penInput, false);
      assert.equal(
        capabilityCli.capabilities.opusInput,
        build.capabilities.opusInput,
      );
      assert.equal(
        response.json().capabilities.opusInput,
        build.capabilities.opusInput,
      );
      assert.equal(
        (await server.inject('/v1/capabilities')).json().opusInput,
        build.capabilities.opusInput,
      );
      assert.equal(
        capabilityCli.capabilities.microphoneReset,
        build.capabilities.microphoneReset,
      );
      assert.equal(
        capabilityCli.capabilities.pcmInput,
        build.capabilities.pcmInput,
      );
      assert.equal(
        (await server.inject('/v1/capabilities')).json().pcmInput,
        build.capabilities.pcmInput,
      );
      assert.equal(
        (await server.inject('/v1/capabilities')).json().audioReset,
        capabilityCli.capabilities.audioReset,
      );
      assert.equal(
        (await server.inject('/v1/capabilities')).json().opusOutput,
        capabilityCli.capabilities.opusOutput,
      );
    } finally {
      await server.close();
    }
  });
});

test(
  'native integration: parent death closes inherited IPC, worker and empty runtime directory',
  { timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const parent = spawn(
        process.execPath,
        [resolve('tests/fixtures/parent.mjs'), workerPath, runtimeRoot],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      let workerPid;
      try {
        const [chunk] = await once(parent.stdout, 'data');
        workerPid = JSON.parse(chunk.toString()).pid;
        assert.ok(alive(workerPid));
        const closed = once(parent, 'close');
        parent.kill('SIGKILL');
        await closed;
        for (
          let i = 0;
          i < 100 && (alive(workerPid) || (await readdir(runtimeRoot)).length);
          ++i
        )
          await delay(25);
        assert.equal(alive(workerPid), false);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        parent.kill('SIGKILL');
        if (workerPid && alive(workerPid)) process.kill(workerPid, 'SIGKILL');
      }
    });
  },
);

test('fake-worker integration: handshake timeout, wrong reply and shutdown deadline reclaim resources', async () => {
  await withRoot(async (runtimeRoot) => {
    for (const mode of [1, 2]) {
      const worker = new WorkerProcess({
        workerPath: fixture(mode),
        runtimeRoot,
        requestTimeoutMs: 100,
        startupTimeoutMs: 1000,
      });
      await assert.rejects(worker.start(), (error) =>
        ['IPC_TIMEOUT', 'IPC_PROTOCOL_ERROR'].includes(error.code),
      );
      await worker.close();
      assert.equal(alive(worker.pid), false);
      assert.deepEqual(await readdir(runtimeRoot), []);
    }
    const worker = new WorkerProcess({
      workerPath: fixture(3),
      runtimeRoot,
      requestTimeoutMs: 1000,
      shutdownTimeoutMs: 100,
    });
    await worker.start();
    await worker.close();
    assert.equal(alive(worker.pid), false);
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test(
  'fake-worker native registry: forced termination joins child close and runtime removal',
  { timeout: 10000 },
  async () => {
    await withRoot(async (runtimeRoot) => {
      let forced = 0;
      let providedProcess;
      class ObservedSession extends NativeSessionWorker {
        createWorkerProcess(options) {
          assert.equal(providedProcess, undefined);
          providedProcess = new WorkerProcess(options);
          return providedProcess;
        }
      }
      const manager = new SessionManager({
        shutdownTimeoutMs: 20,
        terminationTimeoutMs: 2000,
        workerFactory: () => {
          const worker = new ObservedSession({
            workerPath: fixture(3),
            runtimeRoot,
            requestTimeoutMs: 5000,
            shutdownTimeoutMs: 5000,
          });
          const terminate = worker.terminate.bind(worker);
          worker.terminate = () => {
            forced++;
            return terminate();
          };
          return worker;
        },
      });
      try {
        manager.create(
          {
            target: { host: 'unused.example.test' },
            auth: { username: 'synthetic-user', password: 'synthetic-only' },
          },
          { id: 'synthetic-owner' },
          '127.0.0.1',
        );
        await eventually(() => manager.statistics().active === 0);
        assert.equal(forced, 1);
        assert.ok(providedProcess.pid > 0);
        assert.equal(alive(providedProcess.pid), false);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        await manager.shutdown();
      }
    });
  },
);

test('fake-worker integration: bounded pending requests reject overload without growing queues', async () => {
  await withRoot(async (runtimeRoot) => {
    const worker = new WorkerProcess({
      workerPath: fixture(3),
      runtimeRoot,
      maxPendingRequests: 1,
      requestTimeoutMs: 100,
    });
    await worker.start();
    const pending = worker.ping();
    const first = assert.rejects(
      pending,
      (error) => error.code === 'IPC_TIMEOUT',
    );
    await assert.rejects(
      worker.ping(),
      (error) => error.code === 'IPC_QUEUE_FULL',
    );
    await first;
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test('native integration: malformed/truncated records and pre-handshake commands fail without payload disclosure', async () => {
  for (const bytes of [
    Buffer.from('secret-SENTINEL'),
    encodePacket({
      kind: Kind.Heartbeat,
      requestId: 1n,
      payload: Buffer.alloc(0),
    }),
    encodePacket({
      kind: Kind.Hello,
      requestId: 1n,
      payload: helloPayload(),
    }).subarray(0, 26),
  ]) {
    const child = spawn(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.resume();
    const closed = once(child, 'close');
    child.stdin.end(bytes);
    const [code] = await closed;
    assert.equal(code, 2);
    assert.ok(!stderr.includes('SENTINEL'));
  }
});

test(
  'native queued IPC: paused output and raw parent flood fail within bounds and remove owned runtime',
  {
    skip: !['win32', 'linux'].includes(process.platform),
    timeout: 10000,
  },
  async () => {
    await withRoot(async (runtimeRoot) => {
      const directory = await mkdtemp(join(runtimeRoot, 'worker-'));
      await writeFile(join(directory, '.rdp-worker-owned'), 'runtime-v1', {
        flag: 'wx',
      });
      const child = spawn(workerPath, [], {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdin.on('error', () => {});
      child.stderr.resume();
      child.stdout.pause();
      const exited = once(child, 'exit');
      const closed = once(child, 'close');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        const hello = encodePacket({
          kind: Kind.Hello,
          requestId: 1n,
          payload: helloPayload(),
        });
        // Bounded adversarial parent fixture, outside the normal supervisor's 32-request cap.
        const requests = Buffer.alloc(hello.length + 12000 * 24);
        hello.copy(requests);
        for (let i = 0; i < 12000; ++i)
          encodePacket({
            kind: Kind.Heartbeat,
            requestId: BigInt(i + 2),
            payload: Buffer.alloc(0),
          }).copy(requests, hello.length + i * 24);
        child.stdin.end(requests);
        const [code] = await exited;
        child.stdout.resume();
        await closed;
        assert.equal(code, 2);
        assert.equal(alive(child.pid), false);
        assert.deepEqual(await readdir(runtimeRoot), []);
      } finally {
        clearTimeout(force);
        child.stdout.resume();
        if (alive(child.pid)) child.kill('SIGKILL');
        await closed;
      }
    });
  },
);

test('missing executable fails with a sanitized error and cleans its private directory', async () => {
  await withRoot(async (runtimeRoot) => {
    const worker = new WorkerProcess({
      workerPath: join(binaryDir, 'sentinel-NONEXISTENT'),
      runtimeRoot,
    });
    await assert.rejects(
      worker.start(),
      (error) =>
        error.code === 'WORKER_SPAWN_FAILED' &&
        !error.message.includes('sentinel'),
    );
    await worker.close();
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});

test('fake-worker integration: automatic heartbeat watchdog stops an unresponsive worker', async () => {
  await withRoot(async (runtimeRoot) => {
    const worker = new WorkerProcess({
      workerPath: fixture(3),
      runtimeRoot,
      heartbeatIntervalMs: 25,
      requestTimeoutMs: 100,
    });
    const failed = once(worker, 'failure');
    await worker.start();
    await failed;
    await worker.close();
    assert.equal(worker.state, 'failed');
    assert.equal(alive(worker.pid), false);
    assert.deepEqual(await readdir(runtimeRoot), []);
  });
});
