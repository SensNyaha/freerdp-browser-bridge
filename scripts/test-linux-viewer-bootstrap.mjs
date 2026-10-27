import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated linked-native Linux lab only. No RDP credentials or clipboard access.
if (
  process.platform !== 'linux' ||
  process.versions.node.split('.')[0] !== '24' ||
  resolve('.') !== resolve(fileURLToPath(new URL('..', import.meta.url))) ||
  process.argv.length !== 3 ||
  process.argv[2] !== '--linked-native' ||
  !process.env.BRIDGE_TEST_BINARY_DIR ||
  process.getuid() === 0
)
  throw new Error(
    'Use Node 24 --linked-native at the project root as non-root with BRIDGE_TEST_BINARY_DIR',
  );
const capabilities = /^CapEff:\s*([0-9a-f]+)$/im.exec(
  await readFile('/proc/self/status', 'utf8'),
);
if (!capabilities || BigInt('0x' + capabilities[1]) !== 0n)
  throw new Error(
    'Linux viewer bootstrap check requires zero effective capabilities',
  );

const report = {
  scope: 'Actual linked Linux viewer bootstrap/start/stop; no remote RDP',
  actualRdp: false,
  hostClipboardAccess: false,
  uid: process.getuid(),
  zeroEffectiveCapabilities: true,
  profiles: [],
  passed: false,
};
try {
  for (const profile of [
    {},
    { htmlClipboard: true },
    { htmlClipboard: true, ipcTransport: 'framed-pipes' },
    { imageClipboard: true },
    { imageClipboard: true, ipcTransport: 'framed-pipes' },
  ]) {
    const bearer = randomBytes(32).toString('base64url'),
      child = spawn(
        process.execPath,
        ['scripts/linux-xrdp-viewer-server.mjs'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    let buffered = '',
      count = 0,
      closed,
      ready,
      failed;
    const readiness = new Promise((resolve, reject) => {
      ready = resolve;
      failed = reject;
    });
    void readiness.catch(() => {});
    child.stderr.resume();
    child.stdout.on('data', (chunk) => {
      count += chunk.length;
      if (count > 8192) {
        failed(new Error('Output limit'));
        child.kill();
        return;
      }
      buffered += chunk.toString();
      for (let n; (n = buffered.indexOf('\n')) >= 0; ) {
        const line = buffered.slice(0, n);
        buffered = buffered.slice(n + 1);
        try {
          const item = JSON.parse(line);
          if (item.type === 'lab.server.ready') ready();
          else if (item.type === 'lab.server.closed') closed = item;
          else failed(new Error('Unknown event'));
        } catch {
          failed(new Error('Invalid event'));
        }
      }
    });
    const exited = new Promise((resolve) => {
      child.once('error', () => {
        failed(new Error('Child failed'));
        resolve(1);
      });
      child.once('close', (code) => {
        failed(new Error('Child closed'));
        resolve(code);
      });
    });
    const timeout = setTimeout(() => {
      failed(new Error('Start timeout'));
      child.kill();
    }, 30000);
    const input = Buffer.from(JSON.stringify({ bearer, ...profile }));
    child.stdin.on('error', () => {});
    child.stdin.end(input, () => input.fill(0));
    const request = (path, auth = true, method = 'GET') =>
      fetch('http://127.0.0.1:47999' + path, {
        method,
        headers: auth ? { authorization: 'Bearer ' + bearer } : {},
        signal: AbortSignal.timeout(10000),
      });
    try {
      await readiness;
      assert.equal((await request('/lab/stats', false)).status, 401);
      const caps = await (await request('/v1/capabilities')).json();
      assert.equal(caps.clipboardHtml, true);
      assert.equal(caps.clipboardImage, true);
      const build = await (await request('/v1/build')).json();
      assert.equal(
        build.transport,
        profile.ipcTransport === 'framed-pipes'
          ? 'framed-pipes'
          : 'unix-seqpacket-rws1',
      );
      const page = await request('/html-lab/');
      assert.equal(page.status, profile.htmlClipboard ? 200 : 404);
      const imagePage = await request('/image-lab/');
      assert.equal(imagePage.status, profile.imageClipboard ? 200 : 404);
      if (profile.imageClipboard) {
        assert.ok((await imagePage.text()).includes('data-image-clipboard'));
        for (const path of [
          '/image-lab-pixels.js',
          '/clipboard-image-view.js',
          '/clipboard-image-conversion.js',
          '/clipboard-image-worker.js',
        ])
          assert.equal((await request(path)).status, 200);
      }
      if (profile.htmlClipboard || profile.imageClipboard) {
        if (profile.htmlClipboard)
          assert.ok((await page.text()).includes('data-html-clipboard'));
        assert.equal((await request('/clipboard-client.js')).status, 200);
        const stats = await (await request('/lab/stats')).json();
        assert.equal(stats.htmlReads, 0);
        assert.equal(stats.textReads, 0);
        assert.equal(stats.writes, 0);
        if (profile.imageClipboard) assert.equal(stats.imageReads, 0);
      } else
        assert.deepEqual(await (await request('/lab/stats')).json(), {
          requested: 0,
          scheduled: 0,
        });
      assert.equal((await request('/lab/stop', true, 'POST')).status, 202);
      assert.equal(await exited, 0);
      assert.equal(closed.cleanup, true);
      if (profile.htmlClipboard || profile.imageClipboard) {
        assert.equal(closed.pidRetired, true);
        assert.equal(closed.clipboard.htmlReads, 0);
        if (profile.imageClipboard)
          assert.equal(closed.clipboard.imageReads, 0);
      }
      report.profiles.push({
        mode: profile.imageClipboard
          ? 'image-' + (profile.ipcTransport ?? 'auto')
          : profile.htmlClipboard
            ? (profile.ipcTransport ?? 'auto')
            : 'legacy',
        htmlCapability: true,
        imageCapability: true,
        transport: build.transport,
        ready: true,
        authenticated: true,
        cleanup: true,
      });
    } finally {
      clearTimeout(timeout);
      child.kill();
      await exited;
      input.fill(0);
    }
  }
  report.passed = true;
} catch {
  report.failure = 'LINUX_VIEWER_BOOTSTRAP_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(report));
}
