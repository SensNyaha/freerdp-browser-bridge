import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test(
  'installed-service lab emits only public configuration and refuses EOF before service readiness',
  { timeout: 15000 },
  async () => {
    const child = spawn(
      process.execPath,
      [
        'tests/fixtures/standalone-files-rdp-client.mjs',
        '--owned-managed-files-installed-rdp',
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const secret = 'synthetic-memory-only-never-in-configuration';
    let output = '',
      diagnostic = '',
      first;
    const closed = new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > 65536) {
        child.kill();
        return;
      }
      if (!first && output.includes('\n')) {
        first = JSON.parse(output.split('\n')[0]);
        child.stdin.end();
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostic += chunk.toString('utf8');
      if (diagnostic.length > 65536) child.kill();
    });
    const timer = setTimeout(() => child.kill(), 10000);
    try {
      assert.equal(typeof child.stdin.write, 'function');
      child.stdin.write(
        JSON.stringify({
          id: '1234567890abcdef1234567890abcdef',
          host: '127.0.0.1',
          port: 3389,
          fingerprint: 'sha256:' + 'a'.repeat(64),
          packageSha256: 'b'.repeat(64),
          credentials: { username: 'synthetic', password: secret },
        }) + '\n',
      );
      assert.equal(await closed, 1);
      assert.equal(diagnostic, '');
      assert.equal(first.event, 'service-configuration');
      assert.equal(first.configuration.listen.port, 8080);
      assert.deepEqual(first.configuration.files, {
        maxTotalBytes: 4194304,
        maxFileBytes: 2097152,
        maxEntries: 64,
        xrdpLegacyDelete: true,
      });
      const key = first.configuration.auth.jwks.keys[0];
      assert.equal(key.kty, 'RSA');
      assert.equal(key.alg, 'RS256');
      for (const name of ['d', 'p', 'q', 'dp', 'dq', 'qi'])
        assert.equal(key[name], undefined);
      assert.equal(
        first.configuration.auth.issuer,
        'https://standalone-lab.example.test',
      );
      assert.equal(output.includes(secret), false);
      assert.equal(output.includes('http-roundtrip-verified'), false);
      assert.equal(output.includes('service-stop-requested'), false);
      assert.ok(output.includes('"phase":"service-install"'));
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) {
        child.kill();
        await closed;
      }
    }
  },
);
