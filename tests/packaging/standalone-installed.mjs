// Destructive only within a fresh, explicit GitHub-hosted acceptance job.
// Never run this against a developer's existing service installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  !['win32', 'linux'].includes(process.platform) ||
  process.argv.length !== 2
)
  throw new Error('STANDALONE_FRESH_CI_ONLY');
const windows = process.platform === 'win32';
const build = JSON.parse(await readFile('build/standalone-ci.json', 'utf8'));
assert.equal(build.prototypeOnly, true);
const configuration = windows
  ? join(process.env.ProgramData, 'FreeRDPBridge/config/bridge.json')
  : '/etc/freerdp-bridge/bridge.json';
const runtime = windows
  ? join(process.env.ProgramData, 'FreeRDPBridge/runtime')
  : '/run/freerdp-bridge';
const program = windows
  ? join(process.env.ProgramFiles, 'FreeRDP Bridge')
  : '/opt/freerdp-bridge';
const powershell =
  windows &&
  join(
    process.env.SystemRoot,
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
const require = createRequire(resolve('apps/standalone/package.json'));
const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
const delay = () => new Promise((done) => setTimeout(done, 50));
async function invoke(command, args, timeout = 30000) {
  const child = spawn(command, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    bytes = 0;
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      if ((bytes += chunk.length) > 1048576) child.kill();
      else output += chunk.toString('utf8');
    });
  const timer = setTimeout(() => child.kill(), timeout);
  let code;
  try {
    code = await new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
  } finally {
    clearTimeout(timer);
  }
  if (code !== 0) throw new Error('STANDALONE_INSTALLED_COMMAND_FAILED');
  return output.trim();
}
const ps = (code) =>
  invoke(powershell, [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$ErrorActionPreference="Stop"; ' + code,
  ]);
async function service(action) {
  if (windows)
    await ps(
      (action === 'stop' ? 'Stop-Service' : 'Start-Service') +
        ' -Name FreeRDPBridge; (Get-Service FreeRDPBridge).WaitForStatus("' +
        (action === 'stop' ? 'Stopped' : 'Running') +
        '",[TimeSpan]::FromSeconds(20))',
    );
  else await invoke('systemctl', [action, 'freerdp-bridge.service']);
}
async function owner() {
  if (windows)
    return JSON.parse(
      await ps(
        '$s=Get-CimInstance Win32_Service -Filter "Name=\u0027FreeRDPBridge\u0027"; $p=Get-CimInstance Win32_Process -Filter ("ProcessId="+$s.ProcessId); $sid=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid; @{pid=[int]$s.ProcessId;account=$s.StartName;sid=$sid.Sid}|ConvertTo-Json -Compress',
      ),
    );
  const pid = Number(
    await invoke('systemctl', [
      'show',
      '--property=MainPID',
      '--value',
      'freerdp-bridge.service',
    ]),
  );
  const status = await readFile('/proc/' + pid + '/status', 'utf8');
  return { pid, uid: Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) };
}
async function waitReady(previousPid) {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const current = await owner();
      if (
        current.pid > 0 &&
        current.pid !== previousPid &&
        (
          await fetch('http://127.0.0.1:8080/rdp/healthz', {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 200
      )
        return current;
    } catch {}
    if (Date.now() > deadline)
      throw new Error('STANDALONE_INSTALLED_READY_DEADLINE');
    await delay();
  }
}
// Refuse to touch a pre-existing product/configuration, even on a CI runner.
await assert.rejects(access(program), { code: 'ENOENT' });
await assert.rejects(access(configuration), { code: 'ENOENT' });
if (windows)
  assert.equal(
    await ps(
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    ),
    'True',
  );
else {
  assert.equal(process.getuid(), 0);
  await access('/run/systemd/system');
}
let installed = false,
  endpoint;
try {
  if (windows)
    await invoke(
      'msiexec.exe',
      [
        '/i',
        build.output,
        '/qn',
        '/norestart',
        '/L*v',
        resolve('build/standalone-install.log'),
      ],
      120000,
    );
  else await invoke('dpkg', ['--install', build.output], 120000);
  installed = true;
  await waitReady();
  const original = await readFile(configuration);
  await service('stop');
  endpoint = await createRdpTlsFixture();
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
  const configured = Buffer.from(JSON.stringify(settings));
  // Public keys/settings only. No private signing key, JWT or RDP credential file.
  await writeFile(configuration, configured);
  await service('start');
  let current = await waitReady();
  if (windows) {
    assert.equal(current.sid, 'S-1-5-19');
    assert.equal(current.account, 'NT AUTHORITY\\LocalService');
  } else {
    assert.equal(
      current.uid,
      Number(await invoke('id', ['-u', 'freerdp-bridge'])),
    );
    assert.notEqual(current.uid, 0);
    assert.equal((await lstat(configuration)).mode & 0o777, 0o640);
  }
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: 'synthetic-owner',
    scope: 'rdp:connect',
    iss: settings.auth.issuer,
    aud: 'bridge',
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic', typ: 'at+jwt' })
    .sign(privateKey);
  const headers = { authorization: 'Bearer ' + token };
  const base = 'http://127.0.0.1:8080/rdp/v1/sessions';
  assert.equal(
    (
      await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: settings.targets[0], auth: {} }),
      })
    ).status,
    401,
  );
  for (const policy of ['strict', 'prompt']) {
    const created = await fetch(base, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        target: settings.targets[0],
        auth: {
          username: 'synthetic',
          password: 'synthetic-installed-memory-only',
        },
        security: { protocol: 'tls', certificatePolicy: policy },
        timeouts: { connectMs: 5000 },
      }),
    });
    assert.equal(created.status, 202);
    const session = base + '/' + (await created.json()).sessionId;
    const deadline = Date.now() + 10000;
    let state;
    do {
      state = await (await fetch(session, { headers })).json();
      if (state.state === (policy === 'strict' ? 'failed' : 'awaiting-user'))
        break;
      if (Date.now() > deadline)
        throw new Error('STANDALONE_INSTALLED_NATIVE_DEADLINE');
      await delay();
    } while (true);
    if (policy === 'strict') {
      assert.equal(state.error.code, 'RDP_CERTIFICATE_REJECTED');
      assert.equal(
        (await fetch(session, { method: 'DELETE', headers })).status,
        200,
      );
    } else {
      const previous = current.pid;
      if (windows)
        await invoke('taskkill.exe', ['/PID', String(previous), '/F']);
      else
        await invoke('systemctl', [
          'kill',
          '--signal=SIGKILL',
          '--kill-whom=main',
          'freerdp-bridge.service',
        ]);
      current = await waitReady(previous);
      assert.equal((await fetch(session, { headers })).status, 404);
      const entries = await readdir(runtime);
      assert.deepEqual(entries, windows ? ['.bridge-service.lock'] : []);
    }
  }
  assert.equal(endpoint.applicationBytes, 0);
  await service('stop');
  assert.deepEqual(await readFile(configuration), configured);
  // Reinstall the same package: no conffile loss or reset of admin public keys.
  if (windows)
    await invoke(
      'msiexec.exe',
      [
        '/fa',
        build.output,
        '/qn',
        '/norestart',
        '/L*v',
        resolve('build/standalone-reinstall.log'),
      ],
      120000,
    );
  else await invoke('dpkg', ['--install', build.output], 120000);
  assert.deepEqual(await readFile(configuration), configured);
  await waitReady();
  await service('stop');
  if (windows)
    await invoke(
      'msiexec.exe',
      [
        '/x',
        build.output,
        '/qn',
        '/norestart',
        '/L*v',
        resolve('build/standalone-uninstall.log'),
      ],
      120000,
    );
  else await invoke('dpkg', ['--remove', 'freerdp-bridge'], 120000);
  installed = false;
  await assert.rejects(
    access(join(program, 'node', windows ? 'node.exe' : 'node')),
    { code: 'ENOENT' },
  );
  assert.deepEqual(await readFile(configuration), configured);
  // The clean runner retains only public config by design; restore the default.
  await writeFile(configuration, original);
  await writeFile(
    'build/standalone-installed.json',
    JSON.stringify(
      {
        platform: process.platform,
        version: build.version,
        nativeTls: true,
        nonRootService: true,
        crashRecovery: true,
        reinstallPreservesConfig: true,
        uninstall: true,
        retainedPublicConfig: true,
        realRdpDesktop: false,
        upgradeToNewVersion: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('STANDALONE_INSTALLED_SERVICE_PASS');
} catch (error) {
  try {
    const status = windows
      ? await ps(
          'Get-CimInstance Win32_Service -Filter "Name=\u0027FreeRDPBridge\u0027" | Select-Object State,ProcessId,ExitCode,ServiceSpecificExitCode | ConvertTo-Json -Compress',
        )
      : await invoke('systemctl', [
          'show',
          'freerdp-bridge.service',
          '--property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus,MainPID',
        ]);
    await writeFile('build/standalone-service-status.log', status + '\n');
  } catch {}
  throw error;
} finally {
  await endpoint?.close();
  if (installed) {
    try {
      await service('stop');
    } catch {}
    if (windows)
      await invoke(
        'msiexec.exe',
        ['/x', build.output, '/qn', '/norestart'],
        120000,
      );
    else await invoke('dpkg', ['--remove', 'freerdp-bridge'], 120000);
  }
}
