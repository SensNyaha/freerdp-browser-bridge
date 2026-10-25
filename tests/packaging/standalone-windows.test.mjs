import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  readdir,
  rm,
  access,
  symlink,
} from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { listenBrowserLoopback } from '../fixtures/browser-port.mjs';

const bundle = process.env.BRIDGE_STANDALONE_TEST_ROOT;
const require = createRequire(
  new URL('../../apps/standalone/package.json', import.meta.url),
);
const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
const delay = () => new Promise((done) => setTimeout(done, 20));
async function retireScratch(path) {
  assert.equal(dirname(path), resolve(tmpdir()));
  assert.match(
    basename(path),
    /^bridge-(packaged-service|standalone-recovery)-[A-Za-z0-9]+$/,
  );
  await rm(path, { recursive: true, force: true, maxRetries: 3 });
}
function processSnapshot() {
  // Only public process IDs/parents/names; never command lines or environment.
  return JSON.parse(
    execFileSync(
      resolve('build/standalone-host/bridge-process-inventory.exe'),
      [],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 262144,
      },
    ),
  );
}
function descendants(rows, parent) {
  const selected = [];
  const ids = new Set([parent]);
  for (let index = 0; index < rows.length; ++index)
    for (const row of rows)
      if (ids.has(row.ParentProcessId) && !ids.has(row.ProcessId)) {
        ids.add(row.ProcessId);
        selected.push(row);
      }
  return selected;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

test(
  'Windows installed startup diagnostic uses the private payload and returns only a fixed phase',
  { skip: process.platform !== 'win32' || !bundle, timeout: 20000 },
  async () => {
    const root = resolve(bundle);
    const scratch = await mkdtemp(
      join(tmpdir(), 'bridge-standalone-recovery-'),
    );
    try {
      const config = JSON.parse(
        await readFile(join(root, 'bridge.example.json'), 'utf8'),
      );
      await listenBrowserLoopback(async (port) => {
        config.listen.port = port;
      });
      const configuration = join(scratch, 'public-config.json');
      await writeFile(configuration, JSON.stringify(config));
      const probe = spawnSync(
        join(root, 'node/node.exe'),
        [
          resolve('tests/fixtures/standalone-startup-diagnostic.mjs'),
          root,
          configuration,
          join(scratch, 'missing-runtime'),
        ],
        {
          cwd: root,
          windowsHide: true,
          encoding: 'utf8',
          timeout: 12000,
          maxBuffer: 8192,
        },
      );
      assert.equal(probe.status, 0);
      assert.deepEqual(JSON.parse(probe.stdout.trim().split(/\r?\n/).at(-1)), {
        v: 1,
        phase: 'complete',
        failed: false,
      });
    } finally {
      await retireScratch(scratch);
    }
  },
);

for (const mode of ['stop-byte', 'parent-eof', 'invalid-control', 'host-crash'])
  test(
    `Windows standalone supervisor / private Node and live native worker: ${mode} reclaims process tree`,
    { skip: process.platform !== 'win32' || !bundle, timeout: 45000 },
    async () => {
      const root = resolve(bundle);
      await access(join(root, 'bridge-service.exe'));
      const endpoint = await createRdpTlsFixture();
      const scratch = await mkdtemp(join(tmpdir(), 'bridge-packaged-service-'));
      const runtimeRoot = join(scratch, 'runtime');
      const nativeBin = join(
        root,
        'service/node_modules/@freerdp-bridge/runtime-win32-x64/runtime/bin',
      );
      const privateRoot = JSON.parse(
        execFileSync(
          join(nativeBin, 'rdp-runtime-directory.exe'),
          ['--create-private-directory', runtimeRoot],
          {
            windowsHide: true,
            timeout: 5000,
            maxBuffer: 4096,
            encoding: 'utf8',
          },
        ),
      );
      assert.deepEqual(privateRoot, { v: 1, created: true, error: 0 });
      let recoveryCapable = false;
      try {
        await access(join(nativeBin, 'rdp-worker.runtime.json'));
        recoveryCapable = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      let child, exited, timer;
      let owned = [];
      let output = '',
        outputBytes = 0;
      try {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
          modulusLength: 2048,
        });
        const settings = {
          schemaVersion: 1,
          listen: { host: '127.0.0.1', port: 8080 },
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
        const configPath = join(scratch, 'public-config.json');
        let port;
        await listenBrowserLoopback(async (selected) => {
          // Reserve only for configuration, release before the private service binds.
          const { createServer } = await import('node:net');
          const reservation = createServer();
          await new Promise((done, reject) => {
            reservation.once('error', reject);
            reservation.listen(selected, '127.0.0.1', done);
          });
          await new Promise((done) => reservation.close(done));
          port = selected;
        });
        settings.listen.port = port;
        await writeFile(configPath, JSON.stringify(settings));
        child = spawn(
          join(root, 'bridge-service.exe'),
          ['--console', '--config', configPath, '--runtime-root', runtimeRoot],
          {
            cwd: root,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
              SystemRoot: process.env.SystemRoot,
              WINDIR: process.env.WINDIR,
              PATH: join(process.env.SystemRoot, 'System32'),
            },
          },
        );
        exited = new Promise((done, reject) => {
          child.once('error', reject);
          child.once('close', done);
        });
        for (const stream of [child.stdout, child.stderr])
          stream.on('data', (bytes) => {
            outputBytes += bytes.length;
            if (outputBytes > 65536) child.kill();
            else output += bytes.toString('utf8');
          });
        timer = setTimeout(() => child.kill(), 30000);
        const readyDeadline = Date.now() + 12000;
        while (!output.includes('STANDALONE_READY')) {
          if (child.exitCode !== null || Date.now() > readyDeadline) {
            const probe = spawnSync(
              join(root, 'node/node.exe'),
              [
                resolve('tests/fixtures/standalone-startup-diagnostic.mjs'),
                root,
                configPath,
                runtimeRoot,
              ],
              {
                cwd: root,
                windowsHide: true,
                encoding: 'utf8',
                timeout: 10000,
                maxBuffer: 8192,
                env: {
                  SystemRoot: process.env.SystemRoot,
                  WINDIR: process.env.WINDIR,
                  PATH: join(process.env.SystemRoot, 'System32'),
                  TEMP: runtimeRoot,
                  TMP: runtimeRoot,
                },
              },
            );
            let diagnostic = 'unavailable';
            try {
              const value = JSON.parse(
                probe.stdout.trim().split(/\r?\n/).at(-1),
              );
              if (
                value.v === 1 &&
                typeof value.failed === 'boolean' &&
                [
                  'import',
                  'config',
                  'resolve',
                  'recovery',
                  'create',
                  'listen',
                  'close',
                  'complete',
                ].includes(value.phase)
              )
                diagnostic =
                  value.phase + (value.failed ? '-failed' : '-passed');
            } catch {
              /* Ignore arbitrary child output. */
            }
            throw new Error('PACKAGED_SERVICE_NOT_READY: ' + diagnostic);
          }
          await delay();
        }
        const now = Math.floor(Date.now() / 1000);
        const token = await new SignJWT({
          sub: 'synthetic-owner',
          scope: 'rdp:connect',
          iss: settings.auth.issuer,
          aud: 'bridge',
          iat: now,
          exp: now + 120,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'synthetic', typ: 'at+jwt' })
          .sign(privateKey);
        const headers = { authorization: 'Bearer ' + token };
        const base = 'http://127.0.0.1:' + port;
        assert.equal((await fetch(base + '/rdp/healthz')).status, 200);
        assert.ok(
          (await (await fetch(base + '/viewer/')).text()).includes(
            'application-auth',
          ),
        );
        const created = await fetch(base + '/rdp/v1/sessions', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            target: settings.targets[0],
            auth: {
              username: 'synthetic',
              password: 'synthetic-packaged-memory-only',
            },
            security: { protocol: 'tls', certificatePolicy: 'prompt' },
            timeouts: { connectMs: 5000 },
          }),
        });
        assert.equal(created.status, 202);
        const sessionId = (await created.json()).sessionId;
        const nativeDeadline = Date.now() + 7000;
        while (
          (
            await (
              await fetch(base + '/rdp/v1/sessions/' + sessionId, { headers })
            ).json()
          ).state !== 'awaiting-user'
        ) {
          if (Date.now() > nativeDeadline)
            throw new Error('PACKAGED_NATIVE_PROMPT_MISSING');
          await delay();
        }
        owned = descendants(processSnapshot(), child.pid);
        assert.ok(owned.some((row) => row.Name === 'node.exe'));
        assert.ok(owned.some((row) => row.Name === 'rdp-worker.exe'));
        for (const row of owned) assert.equal(alive(row.ProcessId), true);
        if (mode === 'stop-byte') {
          const duplicate = spawnSync(
            join(root, 'bridge-service.exe'),
            [
              '--console',
              '--config',
              configPath,
              '--runtime-root',
              runtimeRoot,
            ],
            {
              cwd: root,
              windowsHide: true,
              stdio: 'ignore',
              timeout: 5000,
            },
          );
          assert.equal(duplicate.error, undefined);
          assert.equal(duplicate.status, 1);
          assert.equal((await fetch(base + '/rdp/healthz')).status, 200);
          for (const row of owned) assert.equal(alive(row.ProcessId), true);
        }
        if (mode === 'host-crash') child.kill();
        else if (mode === 'parent-eof') child.stdin.end();
        else child.stdin.end(Buffer.from([mode === 'stop-byte' ? 1 : 2]));
        const code = await exited;
        if (mode === 'stop-byte' || mode === 'parent-eof') {
          assert.equal(code, 0);
          assert.deepEqual(await readdir(runtimeRoot), []);
        } else assert.notEqual(code, 0);
        const deathDeadline = Date.now() + 5000;
        while (owned.some((row) => alive(row.ProcessId))) {
          if (Date.now() > deathDeadline)
            throw new Error('PACKAGED_DESCENDANT_SURVIVED');
          await delay();
        }
        assert.equal(endpoint.applicationBytes, 0);
        assert.equal(output.includes(token), false);
        assert.equal(output.includes('synthetic-packaged-memory-only'), false);
        if (mode === 'invalid-control' || mode === 'host-crash') {
          // The original parent cannot run JS cleanup after forced termination.
          // A subsequent host acquires the released OS lock. Legacy recovery
          // stays in the host; schema-1 cleanup is performed by verified SDK
          // recovery before the new Node reports listener readiness.
          output = '';
          child = spawn(
            join(root, 'bridge-service.exe'),
            [
              '--console',
              '--config',
              configPath,
              '--runtime-root',
              runtimeRoot,
            ],
            {
              cwd: root,
              windowsHide: true,
              stdio: ['pipe', 'pipe', 'pipe'],
              env: {
                SystemRoot: process.env.SystemRoot,
                WINDIR: process.env.WINDIR,
                PATH: join(process.env.SystemRoot, 'System32'),
              },
            },
          );
          exited = new Promise((done, reject) => {
            child.once('error', reject);
            child.once('close', done);
          });
          child.stdout.on('data', (bytes) => {
            outputBytes += bytes.length;
            if (outputBytes > 65536) child.kill();
            else output += bytes.toString('utf8');
          });
          const recoveryDeadline = Date.now() + 12000;
          while (!output.includes('STANDALONE_READY')) {
            if (child.exitCode !== null || Date.now() > recoveryDeadline)
              throw new Error('PACKAGED_SERVICE_RECOVERY_FAILED');
            await delay();
          }
          assert.deepEqual(await readdir(runtimeRoot), [
            '.bridge-service.lock',
          ]);
          if (recoveryCapable) {
            const line = output
              .split(/\r?\n/)
              .find((value) =>
                value.includes('"code":"STANDALONE_RUNTIME_RECOVERY"'),
              );
            assert.ok(line);
            const report = JSON.parse(line.slice(line.indexOf('{')));
            assert.deepEqual(report, {
              code: 'STANDALONE_RUNTIME_RECOVERY',
              supported: true,
              complete: true,
              scanned: 2,
              removed: 1,
              active: 0,
              retained: 1,
            });
          }
          child.stdin.end(Buffer.from([1]));
          assert.equal(await exited, 0);
          assert.deepEqual(await readdir(runtimeRoot), []);
        }
      } finally {
        clearTimeout(timer);
        if (child && child.exitCode === null) {
          child.kill();
          await exited;
        }
        await endpoint.close();
        // Only the exact mkdtemp-owned directory, after descendant exit.
        if (owned.every((row) => !alive(row.ProcessId)))
          await retireScratch(scratch);
      }
    },
  );

for (const mode of [
  'unexpected-root-file',
  'nonempty-worker',
  'changed-marker',
  'junction-worker',
  'existing-lock',
])
  test(
    `Windows standalone recovery refuses ${mode} without removing caller data`,
    { skip: process.platform !== 'win32' || !bundle, timeout: 15000 },
    async () => {
      const scratch = await mkdtemp(
        join(tmpdir(), 'bridge-standalone-recovery-'),
      );
      const runtimeRoot = join(scratch, 'runtime');
      const foreign = join(scratch, 'foreign');
      const worker = join(runtimeRoot, 'worker-' + 'a'.repeat(32));
      try {
        await mkdir(runtimeRoot);
        await mkdir(foreign);
        await writeFile(join(foreign, 'preserve.txt'), 'synthetic-public-data');
        if (mode === 'unexpected-root-file')
          await writeFile(
            join(runtimeRoot, 'preserve.txt'),
            'synthetic-public-data',
          );
        else if (mode === 'existing-lock')
          await writeFile(
            join(runtimeRoot, '.bridge-service.lock'),
            'synthetic-public-data',
          );
        else if (mode === 'junction-worker')
          await symlink(foreign, worker, 'junction');
        else {
          await mkdir(worker);
          await writeFile(
            join(worker, '.rdp-worker-owned'),
            mode === 'changed-marker' ? 'runtime-v2' : 'runtime-v1',
          );
          if (mode === 'nonempty-worker')
            await writeFile(
              join(worker, 'preserve.txt'),
              'synthetic-public-data',
            );
        }
        const initial = await readdir(runtimeRoot);
        // Recovery admission runs before loading configuration or starting Node.
        const child = spawnSync(
          join(resolve(bundle), 'bridge-service.exe'),
          [
            '--console',
            '--config',
            join(scratch, 'absent-public-config.json'),
            '--runtime-root',
            runtimeRoot,
          ],
          {
            windowsHide: true,
            stdio: 'ignore',
            timeout: 5000,
          },
        );
        assert.equal(child.error, undefined);
        assert.equal(child.status, 1);
        assert.deepEqual(await readdir(runtimeRoot), initial);
        assert.equal(
          await readFile(join(foreign, 'preserve.txt'), 'utf8'),
          'synthetic-public-data',
        );
        if (mode === 'nonempty-worker')
          assert.equal(
            await readFile(join(worker, 'preserve.txt'), 'utf8'),
            'synthetic-public-data',
          );
        if (mode === 'nonempty-worker')
          assert.equal(
            await readFile(join(worker, '.rdp-worker-owned'), 'utf8'),
            'runtime-v1',
          );
        if (mode === 'changed-marker')
          assert.equal(
            await readFile(join(worker, '.rdp-worker-owned'), 'utf8'),
            'runtime-v2',
          );
        if (mode === 'existing-lock')
          assert.equal(
            await readFile(join(runtimeRoot, '.bridge-service.lock'), 'utf8'),
            'synthetic-public-data',
          );
      } finally {
        // Remove the owned junction itself before recursively retiring its parent.
        if (mode === 'junction-worker') await rm(worker, { force: true });
        await retireScratch(scratch);
      }
    },
  );
