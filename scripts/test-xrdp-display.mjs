import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkerProcess } from '../packages/node-bridge/dist/index.js';

const args = process.argv.slice(2);
if (args.length !== 1 || !/^sha256:[0-9a-f]{64}$/.test(args[0]))
  throw new Error('Use test-xrdp-display.mjs sha256:<verified-fingerprint>');
async function localJson(path) {
  try {
    return JSON.parse(
      (await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''),
    );
  } catch {
    throw new Error('Local lab configuration is missing or invalid');
  }
}
const lab = await localJson('.local-tests/xrdp-lab.json');
const credentials = await localJson('.local-tests/xrdp-lab.secrets.json');
const worker = new WorkerProcess({
  workerPath: resolve(
    'build/bundled/rdp-worker' + (process.platform === 'win32' ? '.exe' : ''),
  ),
  runtimeRoot: resolve('.runtime/display-lab'),
});
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 30000);
let original;
let restored = false;
let phase = 'start';
let lastNativeState;
worker.on('rdp-state', (event) => {
  lastNativeState = {
    state: event.state,
    error: event.error,
    nativeError: event.nativeError,
  };
});
const state = () => {
  const value = worker.display;
  return value
    ? {
        ...value,
        generation: value.generation.toString(),
        framebufferRevision: value.framebufferRevision.toString(),
      }
    : undefined;
};
worker.on('certificate', (prompt) => {
  void worker
    .decideCertificate(prompt, prompt.fingerprint === args[0])
    .catch(() => abort.abort());
});
try {
  const report = await worker.start();
  assert.equal(report.capabilities.displayControl, true);
  const activation = new Promise((done, reject) => {
    const receive = (event) => {
      if (['connected', 'closed', 'failed'].includes(event.state)) {
        worker.off('rdp-state', receive);
        if (event.state === 'connected') done();
        else reject(new Error('LAB_ACTIVATION_FAILED'));
      }
    };
    worker.on('rdp-state', receive);
    abort.signal.addEventListener(
      'abort',
      () => reject(new Error('LAB_DEADLINE')),
      { once: true },
    );
  });
  void activation.catch(() => {});
  phase = 'connect';
  await worker.connect({
    target: { host: lab.host, port: lab.port },
    auth: { username: credentials.username, password: credentials.password },
    security: { certificatePolicy: 'prompt' },
    display: { width: 1920, height: 1080, dynamicResolution: true },
    timeouts: { connectMs: 20000, tcpAckMs: 10000 },
  });
  delete credentials.password;
  phase = 'activation';
  await activation;
  phase = 'negotiation';
  for (let attempt = 0; attempt < 80 && !worker.display?.negotiated; attempt++)
    await delay(50, undefined, { signal: abort.signal });
  original = worker.display;
  assert.ok(original);
  assert.equal(original.dynamicResolution, true);
  console.log(JSON.stringify({ type: 'lab.display', display: state() }));
  phase = 'capture-before';
  const before = await worker.captureFrame(0n, {
    codec: 'h264',
    forceKeyframe: true,
  });
  assert.equal(before.avc?.keyframe, true);
  phase = 'resize';
  const resize = await worker.resizeDisplay(1280, 720);
  if (!original.negotiated) {
    assert.equal(resize, 'unavailable');
    console.log(
      JSON.stringify({
        type: 'lab.display.unavailable',
        resize,
        remoteNegotiated: false,
      }),
    );
  } else {
    assert.equal(resize, 'applied');
    assert.equal(worker.display.width, 1280);
    assert.equal(worker.display.height, 720);
    assert.ok(worker.display.generation > original.generation);
    phase = 'capture-after';
    const after = await worker.captureFrame(before.revision, { codec: 'h264' });
    assert.equal(after.avc?.keyframe, true);
    assert.equal(after.width, 1280);
    assert.equal(after.height, 720);
    assert.ok(after.revision >= worker.display.framebufferRevision);
    const jpeg = await worker.captureFrame();
    assert.ok(jpeg.jpeg);
    assert.equal(jpeg.width, 1280);
    assert.equal(jpeg.height, 720);
    console.log(
      JSON.stringify({
        type: 'lab.display.resized',
        resize,
        idr: true,
        jpeg: true,
        display: state(),
      }),
    );
    assert.equal(await worker.resizeDisplay(1280, 720), 'unchanged');
    assert.equal(await worker.resizeDisplay(1281, 720), 'invalid');
    phase = 'restore';
    assert.equal(
      await worker.resizeDisplay(original.width, original.height),
      'applied',
    );
    restored = true;
    const recovered = await worker.captureFrame(after.revision, {
      codec: 'h264',
    });
    assert.equal(recovered.avc?.keyframe, true);
    assert.equal(recovered.width, original.width);
    assert.equal(recovered.height, original.height);
    console.log(
      JSON.stringify({
        type: 'lab.display.restored',
        idr: true,
        display: state(),
      }),
    );
  }
  phase = 'reset-and-heartbeat';
  await worker.sendInput({ type: 'reset' });
  await worker.ping();
} catch {
  console.error(
    JSON.stringify({
      type: 'lab.display.failed',
      phase,
      native: lastNativeState,
      worker: worker.state,
    }),
  );
  console.error(
    'XRDP display check failed; credentials and raw diagnostics omitted',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  delete credentials.password;
  if (original?.negotiated && !restored && worker.state === 'ready') {
    try {
      await worker.resizeDisplay(original.width, original.height);
    } catch {
      console.error('XRDP display restoration failed');
    }
  }
  await worker.close();
}
