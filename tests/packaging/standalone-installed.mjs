// Destructive only in fresh CI or an explicitly selected owned Astra/RED OS lab.
// Never run this against a developer's existing service installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRdpTlsFixture } from '../fixtures/rdp-tls.mjs';
import { readStandalonePayloadFile } from '../../scripts/standalone/payload.mjs';
import {
  isReleaseVersion,
  compareReleaseVersions,
} from '../../scripts/github-delivery/manifest.mjs';

const ownedRedOs =
  process.platform === 'linux' &&
  process.argv.length === 3 &&
  process.argv[2] === '--owned-lab-redos-7.3';
const ownedAstra =
  process.platform === 'linux' &&
  process.argv.length === 3 &&
  process.argv[2] === '--owned-lab-astra-1.7.5';
const ownedLinux = ownedRedOs || ownedAstra;
if (
  !ownedLinux &&
  (process.env.GITHUB_ACTIONS !== 'true' ||
    !['win32', 'linux'].includes(process.platform) ||
    process.argv.length !== 2)
)
  throw new Error('STANDALONE_FRESH_CI_ONLY');
if (ownedLinux) {
  assert.equal(process.getuid(), 0);
  const os = await readFile('/etc/os-release', 'utf8');
  if (ownedRedOs) {
    assert.match(os, /^ID=["']?redos["']?$/m);
    assert.match(os, /^VERSION_ID=["']?7\.3["']?$/m);
  } else {
    assert.match(os, /^ID=["']?astra["']?$/m);
    assert.equal(
      (await readFile('/etc/astra_version', 'utf8')).trim(),
      '1.7.5',
    );
  }
}
const windows = process.platform === 'win32';
const build = JSON.parse(await readFile('build/standalone-ci.json', 'utf8'));
assert.equal(build.prototypeOnly, true);
assert.ok(isReleaseVersion(build.version));
if (build.previous) {
  assert.ok(isReleaseVersion(build.previous.version));
  assert.ok(compareReleaseVersions(build.previous.version, build.version) < 0);
  assert.match(build.previous.sha256, /^[a-f0-9]{64}$/);
  const previous = await readStandalonePayloadFile(
    build.previous.output,
    536870912,
  );
  assert.equal(
    createHash('sha256').update(previous).digest('hex'),
    build.previous.sha256,
  );
}
const firstBuild = build.previous ?? build;
const configuration = windows
  ? join(process.env.ProgramData, 'FreeRDPBridge/config/bridge.json')
  : '/etc/freerdp-bridge/bridge.json';
const runtime = windows
  ? join(process.env.ProgramData, 'FreeRDPBridge/runtime')
  : '/run/freerdp-bridge';
const program = windows
  ? join(process.env.ProgramFiles, 'FreeRDP Bridge')
  : '/opt/freerdp-bridge';
const retainedConfiguration = ownedRedOs
  ? configuration + '.rpmsave'
  : configuration;
const powershell =
  windows &&
  join(
    process.env.SystemRoot,
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
assert.equal(
  build.output.endsWith(ownedRedOs ? '.rpm' : windows ? '.msi' : '.deb'),
  true,
);
assert.equal(
  firstBuild.output.endsWith(ownedRedOs ? '.rpm' : windows ? '.msi' : '.deb'),
  true,
);
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
  if (code !== 0) {
    // These commands carry only fixed service names, public package/config paths
    // and PIDs. Session credentials/JWT are used exclusively by in-memory fetch.
    await writeFile(
      'build/standalone-command-failure.log',
      JSON.stringify({ command, exitCode: code }) + '\n' + output,
    );
    console.error(output);
    throw new Error('STANDALONE_INSTALLED_COMMAND_FAILED');
  }
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
const installLinux = (path = build.output) =>
  ownedRedOs
    ? invoke('rpm', ['--upgrade', '--replacepkgs', path], 120000)
    : invoke('dpkg', ['--install', path], 120000);
const removeLinux = () =>
  ownedRedOs
    ? invoke('rpm', ['--erase', 'freerdp-bridge'], 120000)
    : invoke('dpkg', ['--remove', 'freerdp-bridge'], 120000);
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
// CI requires a fresh product/config; owned labs may retain only the exact
// public default left by a preceding uninstall, with the original protections.
await assert.rejects(access(program), { code: 'ENOENT' });
if (ownedLinux) {
  // A preceding successful owned-lab run retains only this public default.
  // Refuse a deployment config, unknown files, permissive mode or links.
  let existing;
  try {
    existing = await lstat('/etc/freerdp-bridge');
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
  }
  if (existing) {
    assert.ok(existing.isDirectory() && !existing.isSymbolicLink());
    assert.equal(existing.uid, 0);
    assert.equal(existing.mode & 0o777, 0o750);
    assert.deepEqual(await readdir('/etc/freerdp-bridge'), [
      ownedRedOs ? 'bridge.json.rpmsave' : 'bridge.json',
    ]);
    const retained = await lstat(retainedConfiguration);
    assert.equal(retained.uid, 0);
    assert.equal(retained.mode & 0o777, 0o640);
    const bytes = await readStandalonePayloadFile(retainedConfiguration, 65536);
    assert.deepEqual(JSON.parse(bytes.toString('utf8')), {
      schemaVersion: 1,
      listen: { host: '127.0.0.1', port: 8080 },
      allowedOrigins: [],
      targets: [],
      limits: { maxSessions: 8, maxPerPrincipal: 2 },
    });
  }
  assert.equal(
    await invoke('systemctl', [
      'show',
      'freerdp-bridge.service',
      '--property=LoadState',
      '--value',
    ]),
    'not-found',
  );
} else await assert.rejects(access(configuration), { code: 'ENOENT' });
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
  endpoint,
  original,
  changedConfiguration = false;
try {
  if (windows)
    await invoke(
      'msiexec.exe',
      [
        '/i',
        firstBuild.output,
        '/qn',
        '/norestart',
        '/L*v',
        resolve('build/standalone-install.log'),
      ],
      120000,
    );
  else await installLinux(firstBuild.output);
  installed = true;
  const require = createRequire(join(program, 'service/package.json'));
  const { SignJWT } = await import(pathToFileURL(require.resolve('jose')).href);
  await waitReady();
  original = await readFile(configuration);
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
  changedConfiguration = true;
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
  const installedVersion = async (version) => {
    const serviceManifest = JSON.parse(
      await readFile(join(program, 'service/package.json'), 'utf8'),
    );
    assert.equal(serviceManifest.version, version);
    const nativeBuild = await (
      await fetch('http://127.0.0.1:8080/rdp/v1/build')
    ).json();
    assert.equal(nativeBuild.bridgeVersion, version);
    assert.equal(nativeBuild.nodeVersion, 'v24.21.0');
  };
  await installedVersion(firstBuild.version);
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
  const nativeSession = async (policy) => {
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
    return { session, state };
  };
  if (build.previous) {
    // Upgrade while an old worker awaits a certificate decision, proving the
    // installer retires the old process tree and preserves public ownership.
    const pending = await nativeSession('prompt');
    const previousPid = current.pid;
    if (windows)
      await invoke(
        'msiexec.exe',
        [
          '/i',
          build.output,
          '/qn',
          '/norestart',
          '/L*v',
          resolve('build/standalone-upgrade.log'),
        ],
        120000,
      );
    else await installLinux();
    current = await waitReady(previousPid);
    assert.deepEqual(await readFile(configuration), configured);
    assert.equal((await fetch(pending.session, { headers })).status, 404);
    assert.deepEqual(
      await readdir(runtime),
      windows ? ['.bridge-service.lock'] : [],
    );
    await installedVersion(build.version);
    if (windows) assert.equal(current.sid, 'S-1-5-19');
    else
      assert.equal(
        current.uid,
        Number(await invoke('id', ['-u', 'freerdp-bridge'])),
      );
  }
  for (const policy of ['strict', 'prompt']) {
    const { session, state } = await nativeSession(policy);
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
          '--kill-who=main',
          'freerdp-bridge.service',
        ]);
      current = await waitReady(previous);
      assert.equal((await fetch(session, { headers })).status, 404);
      const entries = await readdir(runtime);
      assert.deepEqual(entries, windows ? ['.bridge-service.lock'] : []);
    }
  }
  assert.equal(endpoint.applicationBytes, 0);
  assert.deepEqual(await readFile(configuration), configured);
  // Reinstall while running: replace/restart the service without losing config.
  const beforeReinstall = current.pid;
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
  else await installLinux();
  assert.deepEqual(await readFile(configuration), configured);
  await waitReady(beforeReinstall);
  if (ownedRedOs) {
    // RPM try-restart deliberately preserves an administrator-stopped service.
    await service('stop');
    await installLinux();
    assert.equal(
      await invoke('systemctl', [
        'show',
        'freerdp-bridge.service',
        '--property=ActiveState',
        '--value',
      ]),
      'inactive',
    );
    assert.deepEqual(await readFile(configuration), configured);
    await service('start');
    await waitReady();
  }
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
  else await removeLinux();
  installed = false;
  await assert.rejects(
    access(join(program, 'node', windows ? 'node.exe' : 'node')),
    { code: 'ENOENT' },
  );
  assert.deepEqual(await readFile(retainedConfiguration), configured);
  if (ownedRedOs) {
    await assert.rejects(access(configuration), { code: 'ENOENT' });
    assert.equal((await lstat(retainedConfiguration)).mode & 0o777, 0o640);
  }
  // The clean runner retains only public config by design; restore the default.
  await writeFile(retainedConfiguration, original);
  await writeFile(
    'build/standalone-installed.json',
    JSON.stringify(
      {
        platform: process.platform,
        version: build.version,
        acceptanceEnvironment: ownedRedOs
          ? 'owned-redos-7.3'
          : ownedAstra
            ? 'owned-astra-1.7.5'
            : 'github-hosted',
        nativeTls: true,
        nonRootService: true,
        crashRecovery: true,
        reinstallPreservesConfig: true,
        uninstall: true,
        retainedPublicConfig: true,
        retainedConfigFilename: ownedRedOs
          ? 'bridge.json.rpmsave'
          : 'bridge.json',
        realRdpDesktop: false,
        upgradeToNewVersion: Boolean(build.previous),
        ...(build.previous
          ? {
              previousVersion: build.previous.version,
              previousPackageSha256: build.previous.sha256,
            }
          : {}),
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
    console.error(status);
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
    else await removeLinux();
    // Only a fresh CI/explicit lab installation reaches this branch. Restore
    // its original public default even when a later fixture assertion fails.
    if (original && changedConfiguration)
      await writeFile(retainedConfiguration, original);
  }
}
