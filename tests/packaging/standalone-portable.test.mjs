import { listenBrowserHttp } from '../fixtures/browser-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  chmod,
  lstat,
  mkdir,
} from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { generateKeyPairSync, createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  standalonePayloadInventory,
  readStandalonePayloadFile,
} from '../../scripts/standalone/payload.mjs';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

const source = process.env.BRIDGE_PORTABLE_TEST_ROOT;
const windows = process.platform === 'win32';
const run = promisify(execFile);
const delay = () => new Promise((done) => setTimeout(done, 25));
test(
  'portable archive relocates with exact bytes and launcher joins private Node/native shutdown',
  {
    skip: !source || !['win32', 'linux'].includes(process.platform),
    timeout: 90000,
  },
  async () => {
    const directory = resolve(source);
    const receipt = JSON.parse(
      await readFile(join(directory, 'build.json'), 'utf8'),
    );
    const inventory = JSON.parse(
      await readFile(join(directory, 'payload.json'), 'utf8'),
    );
    assert.equal(dirname(receipt.output), directory);
    assert.equal(
      createHash('sha256')
        .update(await readStandalonePayloadFile(receipt.output, 536870912))
        .digest('hex'),
      receipt.sha256,
    );
    assert.equal(inventory.files.length, receipt.files);
    assert.match(
      receipt.rootName,
      /^freerdp-bridge-0\.[0-9]+\.[0-9]+-(win32-x64|linux-x64-gnu)$/,
    );
    const scratch = await mkdtemp(join(tmpdir(), 'bridge-portable-'));
    let child, closed, endpoint, timer, failure;
    let output = '',
      bytes = 0;
    try {
      await run(
        windows ? join(process.env.SystemRoot, 'System32/tar.exe') : 'tar',
        ['-xf', receipt.output, '-C', scratch],
        { timeout: 45000, maxBuffer: 65536, windowsHide: true },
      );
      const root = join(scratch, receipt.rootName);
      assert.deepEqual(await standalonePayloadInventory(root), inventory.files);
      for (const name of ['LICENSE', 'THIRD_PARTY.md', 'node/LICENSE'])
        assert.ok((await lstat(join(root, name))).size > 0);
      assert.ok(inventory.files.some((file) => /\/\.[^/]+\//.test(file.path)));
      endpoint = await createRdpTlsFixture();
      const reservation = createServer();
      await listenBrowserHttp(reservation);
      const port = reservation.address().port;
      await new Promise((done) => reservation.close(done));
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const config = {
        schemaVersion: 1,
        listen: { host: '127.0.0.1', port },
        allowedOrigins: [],
        targets: [{ host: '127.0.0.1', port: endpoint.port }],
        limits: { maxSessions: 1, maxPerPrincipal: 1 },
        auth: {
          issuer: 'https://issuer.example.test',
          audience: 'bridge',
          jwks: {
            keys: [
              {
                ...publicKey.export({ format: 'jwk' }),
                kid: 'synthetic',
                alg: 'RS256',
                use: 'sig',
              },
            ],
          },
        },
      };
      const configuration = join(scratch, 'public-config.json');
      const runtime = join(scratch, 'private-runtime');
      await writeFile(configuration, JSON.stringify(config));
      const nativeBin = join(
        root,
        'service/node_modules/@freerdp-bridge/runtime-' +
          (windows ? 'win32-x64' : 'linux-x64-gnu'),
        'runtime/bin',
      );
      const packagedVersion = JSON.parse(
        await readFile(join(root, 'service/package.json'), 'utf8'),
      ).version;
      const [major, minor] = packagedVersion.split('.').map(Number);
      let recoveryCapable = false;
      try {
        await lstat(join(nativeBin, 'rdp-worker.runtime.json'));
        recoveryCapable = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (major > 0 || minor >= 3) assert.equal(recoveryCapable, true);
      if (recoveryCapable) {
        const orphan = join(
          runtime,
          `worker-${randomBytes(16).toString('hex')}-1-${randomBytes(16).toString('hex')}`,
        );
        for (const directory of [runtime, orphan]) {
          if (windows) {
            const created = await run(
              join(nativeBin, 'rdp-runtime-directory.exe'),
              ['--create-private-directory', directory],
              { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
            );
            assert.deepEqual(JSON.parse(created.stdout), {
              v: 1,
              created: true,
              error: 0,
            });
          } else await mkdir(directory, { mode: 0o700 });
        }
        await writeFile(join(orphan, '.rdp-worker-owned'), 'runtime-v1', {
          flag: 'wx',
          mode: 0o600,
        });
      }
      const command = windows
        ? join(
            process.env.SystemRoot,
            'System32/WindowsPowerShell/v1.0/powershell.exe',
          )
        : join(root, 'start.sh');
      const args = windows
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-File',
            join(root, 'start.ps1'),
            '-Configuration',
            configuration,
            '-RuntimeRoot',
            runtime,
          ]
        : ['--config', configuration, '--runtime-root', runtime];
      const env = windows
        ? {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            PATH: join(process.env.SystemRoot, 'System32'),
          }
        : { PATH: '/usr/bin:/bin' };
      child = spawn(command, args, {
        cwd: scratch,
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      closed = new Promise((done, reject) => {
        child.once('error', reject);
        child.once('close', done);
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk) => {
          if ((bytes += chunk.length) > 65536) child.kill();
          else output += chunk.toString('utf8');
        });
      timer = setTimeout(() => child.kill(), 45000);
      const readyDeadline = Date.now() + 15000;
      while (!output.includes('STANDALONE_READY')) {
        if (child.exitCode !== null || Date.now() > readyDeadline)
          throw new Error(
            'PORTABLE_LAUNCH_NOT_READY: ' + output.slice(0, 1024),
          );
        await delay();
      }
      const base = 'http://127.0.0.1:' + port;
      if (recoveryCapable) {
        const line = output
          .split(/\r?\n/)
          .find((value) =>
            value.includes('"code":"STANDALONE_RUNTIME_RECOVERY"'),
          );
        assert.ok(
          line,
          'Packaged startup must report recovery before readiness',
        );
        const recovery = JSON.parse(line.slice(line.indexOf('{')));
        assert.deepEqual(recovery, {
          code: 'STANDALONE_RUNTIME_RECOVERY',
          supported: true,
          complete: true,
          scanned: windows ? 2 : 1,
          removed: 1,
          active: 0,
          retained: windows ? 1 : 0,
        });
        assert.ok(
          output.indexOf('STANDALONE_RUNTIME_RECOVERY') <
            output.indexOf('STANDALONE_READY'),
        );
        assert.deepEqual(
          await readdir(runtime),
          windows ? ['.bridge-service.lock'] : [],
        );
      }
      assert.equal((await fetch(base + '/rdp/healthz')).status, 200);
      assert.equal(
        (
          await fetch(base + '/rdp/v1/sessions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
        401,
      );
      const require = createRequire(join(root, 'service/package.json'));
      const { SignJWT } = await import(
        pathToFileURL(require.resolve('jose')).href
      );
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({
        sub: 'synthetic-owner',
        scope: 'rdp:connect',
        iss: config.auth.issuer,
        aud: 'bridge',
        iat: now,
        exp: now + 120,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'synthetic', typ: 'at+jwt' })
        .sign(privateKey);
      const headers = { authorization: 'Bearer ' + token };
      const response = await fetch(base + '/rdp/v1/sessions', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          target: config.targets[0],
          auth: {
            username: 'synthetic',
            password: 'synthetic-portable-memory-only',
          },
          security: { protocol: 'tls', certificatePolicy: 'prompt' },
          timeouts: { connectMs: 5000 },
        }),
      });
      assert.equal(response.status, 202);
      const sessionId = (await response.json()).sessionId;
      const nativeDeadline = Date.now() + 10000;
      while (
        (
          await (
            await fetch(base + '/rdp/v1/sessions/' + sessionId, { headers })
          ).json()
        ).state !== 'awaiting-user'
      ) {
        if (Date.now() > nativeDeadline)
          throw new Error('PORTABLE_NATIVE_PROMPT_MISSING');
        await delay();
      }
      if (windows) child.stdin.end(Buffer.from([1]));
      else child.kill('SIGTERM');
      const stopDeadline = Date.now() + 15000;
      while (child.exitCode === null) {
        if (Date.now() > stopDeadline)
          throw new Error('PORTABLE_SHUTDOWN_NOT_JOINED');
        await delay();
      }
      assert.equal(await closed, 0);
      assert.deepEqual(await readdir(runtime), []);
      assert.equal(endpoint.applicationBytes, 0);
      assert.equal(output.includes(token), false);
      assert.equal(output.includes('synthetic-portable-memory-only'), false);
      // Existing permissive scratch directories must not be silently repaired.
      if (!windows) {
        await chmod(runtime, 0o755);
        const refused = await run(command, args, {
          cwd: scratch,
          env,
          timeout: 10000,
          windowsHide: true,
        }).then(
          () => false,
          (error) => error.code === 1,
        );
        assert.equal(refused, true);
        assert.equal((await lstat(runtime)).mode & 0o777, 0o755);
      } else {
        for (const badPath of [
          'C:public-config.json',
          '\\public-config.json',
          'relative.json',
        ]) {
          const rejected = await run(
            command,
            [
              '-NoProfile',
              '-NonInteractive',
              '-File',
              join(root, 'start.ps1'),
              '-Configuration',
              badPath,
              '-RuntimeRoot',
              runtime,
            ],
            { cwd: scratch, env, timeout: 10000, windowsHide: true },
          ).then(
            () => undefined,
            (error) => error,
          );
          assert.equal(rejected?.code, 1);
          assert.match(rejected.stderr, /STANDALONE_PORTABLE_PATHS_FAILED/);
          assert.deepEqual(await readdir(runtime), []);
        }
        // Modify only this owned directory's DACL; PowerShell Set-Acl may also
        // attempt a SACL write requiring SeSecurityPrivilege on ordinary users.
        await run(
          join(process.env.SystemRoot, 'System32/icacls.exe'),
          [runtime, '/grant', '*S-1-5-32-545:(RX)'],
          { env, timeout: 10000, windowsHide: true },
        );
        const marker = join(runtime, 'preserve.txt');
        await writeFile(marker, 'synthetic-public-data');
        const refused = await run(command, args, {
          cwd: scratch,
          env,
          timeout: 10000,
          windowsHide: true,
        }).then(
          () => undefined,
          (error) => error,
        );
        assert.equal(refused?.code, 1);
        assert.match(
          refused.stderr,
          /STANDALONE_PORTABLE_RUNTIME_ACCESS_FAILED/,
        );
        assert.equal(await readFile(marker, 'utf8'), 'synthetic-public-data');
      }
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      clearTimeout(timer);
      if (child && child.exitCode === null) {
        if (windows)
          await run('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            timeout: 10000,
          }).catch(() => {});
        else child.kill();
        await closed;
      }
      if (endpoint) await endpoint.close();
      assert.equal(dirname(scratch), resolve(tmpdir()));
      assert.match(basename(scratch), /^bridge-portable-[A-Za-z0-9]+$/);
      try {
        await rm(scratch, { recursive: true, force: true, maxRetries: 3 });
      } catch (error) {
        if (!failure) throw error;
      }
    }
  },
);
