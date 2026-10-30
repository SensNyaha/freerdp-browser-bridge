import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  readdir,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { downloadWindowsInstalledMsi } from '../fixtures/windows-installed-full-download.mjs';
import {
  requireWindowsInstalledCi,
  windowsInstalledRelease,
  windowsInstalledPrivateRecords,
  windowsInstalledBootstrap,
  windowsInstalledVersion,
  windowsInstalledRuntimeComponent,
  windowsInstalledStagingRequest,
  windowsInstalledStagingResponse,
} from '../fixtures/windows-installed-full-inputs.mjs';

const refused = { message: 'OWNED_INSTALLED_INPUT_REFUSED' };
const version = '0.6.0';
test('installed metadata observations require ordered bounded byte/count records', () => {
  const request = { sequence: 1, entries: 1, minimum: 393216 };
  assert.equal(windowsInstalledStagingRequest(request, 1), request);
  const result = { sequence: 1, entries: 1, bytes: 393216 };
  assert.equal(windowsInstalledStagingResponse(result, request), result);
  for (const change of [
    { sequence: 2 },
    { entries: true },
    { minimum: 1 },
    { path: 'PRIVATE-unadmitted' },
  ])
    assert.throws(
      () => windowsInstalledStagingRequest({ ...request, ...change }, 1),
      refused,
    );
  for (const change of [
    { sequence: 2 },
    { entries: 0 },
    { bytes: true },
    { bytes: 393215 },
    { bytes: 2097153 },
    { filename: 'PRIVATE-unadmitted' },
  ])
    assert.throws(
      () => windowsInstalledStagingResponse({ ...result, ...change }, request),
      refused,
    );
  assert.throws(() => windowsInstalledStagingRequest(request, 25), refused);
  const empty = { sequence: 24, entries: 0, minimum: 0 };
  assert.deepEqual(
    windowsInstalledStagingResponse(
      { sequence: 24, entries: 0, bytes: 0 },
      empty,
    ),
    { sequence: 24, entries: 0, bytes: 0 },
  );
});

test('installed SYSTEM metadata observer refuses ordinary invocation without output', () => {
  const result = spawnSync(
    process.execPath,
    [
      'tests/fixtures/windows-installed-staging-observer.mjs',
      '--owned-staging-observer',
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 8192 },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
test('installed runtime selection uses the native owner UUID with one exclusive worker directory', () => {
  const component = 'worker-' + 'b'.repeat(32) + '-1-' + 'c'.repeat(32);
  assert.equal(
    windowsInstalledRuntimeComponent(['.bridge-service.lock', component]),
    component,
  );
  for (const names of [
    [],
    [component],
    ['.bridge-service.lock'],
    ['.bridge-service.lock', component, component],
    ['.bridge-service.lock', '.bridge-service.lock'],
    ['.bridge-service.lock', '../' + component],
    ['.bridge-service.lock', component.replace('-1-', '-2-')],
    ['.bridge-service.lock', 42],
  ])
    assert.throws(() => windowsInstalledRuntimeComponent(names), refused);
});
const asset = {
  id: 19,
  name: 'freerdp-bridge-0.6.0-win32-x64.msi',
  state: 'uploaded',
  size: 36837695,
  digest:
    'sha256:8019d33db826150488cc3eaa8c4fdb2f3f1bb5a5963d08ec6c8d6aea78dc1666',
  browser_download_url:
    'https://github.com/SensNyaha/freerdp-browser-bridge/releases/download/v0.6.0/freerdp-bridge-0.6.0-win32-x64.msi',
};
const release = {
  id: 17,
  tag_name: 'v0.6.0',
  draft: false,
  prerelease: false,
  assets: [asset],
};

test('installed MSI test requires exact owned Windows CI invocation before side effects', () => {
  const argv = ['--owned-windows-msi-full'];
  const env = { GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows' };
  requireWindowsInstalledCi('win32', argv, env);
  for (const value of [
    ['linux', argv, env],
    ['win32', [], env],
    ['win32', [...argv, '--extra'], env],
    ['win32', argv, {}],
    ['win32', argv, { ...env, GITHUB_ACTIONS: 'false' }],
    ['win32', argv, { ...env, RUNNER_OS: 'Linux' }],
  ])
    assert.throws(() => requireWindowsInstalledCi(...value), refused);
});

test('published MSI selection binds stable exact version, owner, name, size and digest', () => {
  assert.equal(windowsInstalledVersion('1.0.0'), '1.0.0');
  assert.equal(windowsInstalledVersion('255.255.65535'), '255.255.65535');
  assert.deepEqual(windowsInstalledRelease(release, version), {
    version,
    releaseId: 17,
    assetId: 19,
    name: asset.name,
    bytes: asset.size,
    sha256: asset.digest.slice(7),
    url: asset.browser_download_url,
  });
  for (const value of [
    null,
    {},
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, tag_name: 'v0.6.1' },
    { ...release, assets: [asset, asset] },
    { ...release, assets: Array.from({ length: 33 }, () => asset) },
    ...[
      { state: 'new' },
      { size: 0 },
      { size: 536870913 },
      { size: 12.5 },
      { digest: null },
      { digest: 'sha256:unknown' },
      { browser_download_url: asset.browser_download_url + '?token=other' },
      {
        browser_download_url: asset.browser_download_url.replace(
          'SensNyaha/',
          'another-owner/',
        ),
      },
    ].map((change) => ({ ...release, assets: [{ ...asset, ...change }] })),
  ])
    assert.throws(() => windowsInstalledRelease(value, version), refused);
  for (const value of [
    'latest',
    '0.6.0-rc.1',
    '../0.6.0',
    '0.06.0',
    '256.0.0',
    '1.256.0',
    '1.0.65536',
  ])
    assert.throws(() => windowsInstalledRelease(release, value), refused);
});

async function records(chunks) {
  const values = [];
  for await (const record of windowsInstalledPrivateRecords(
    Readable.from(chunks),
  ))
    values.push(record);
  return values;
}

test('private records handle fragmented/coalesced input and wipe bytes before returning secrets', async () => {
  const first = Buffer.from('{"password":"PRIVATE-owned'),
    second = Buffer.from('-fixture"}\n{"command":"ready"}\n');
  assert.deepEqual(await records([first, second]), [
    { password: 'PRIVATE-owned-fixture' },
    { command: 'ready' },
  ]);
  assert.ok(first.every((byte) => byte === 0));
  assert.ok(second.every((byte) => byte === 0));
  const bytes = Buffer.from('{"password":"PRIVATE-owned-fixture"}\n');
  const iterator = windowsInstalledPrivateRecords(Readable.from([bytes]));
  assert.equal((await iterator.next()).value.password, 'PRIVATE-owned-fixture');
  assert.ok(bytes.every((byte) => byte === 0));
  await iterator.return();
});

test('private record bounds reject partial EOF, malformed UTF8/JSON, extra records and oversized chunks', async () => {
  for (const chunks of [
    [],
    [Buffer.from('{"command":"ready"}')],
    [Buffer.from('\n')],
    [Buffer.from('[]\n')],
    [Buffer.from('null\n')],
    [Buffer.from('{\n')],
    [Buffer.from([123, 34, 0xc0, 0xaf, 34, 58, 49, 125, 10])],
    [Buffer.alloc(32769, 65)],
    [Buffer.alloc(65537, 65)],
    [Buffer.from('{}\n'.repeat(65))],
    [
      Buffer.from(
        JSON.stringify(
          Object.fromEntries(Array.from({ length: 33 }, (_, n) => [n, n])),
        ) + '\n',
      ),
    ],
  ]) {
    await assert.rejects(records(chunks), refused);
    assert.ok(chunks.every((chunk) => chunk.every((byte) => byte === 0)));
  }
  const largest = Buffer.from('{"x":"' + 'a'.repeat(32760) + '"}\n');
  assert.equal(largest.length, 32769);
  assert.equal((await records([largest]))[0].x.length, 32760);
  assert.equal((await records([Buffer.from('{}\n'.repeat(64))])).length, 64);
});

test('bootstrap admits only its nonce-bound local CI account and private parent inputs', () => {
  const value = {
    id: 'a'.repeat(32),
    credentials: {
      username: 'bridgefull_aaaaaaaa',
      domain: 'OWNED-CI',
      password: 'PRIVATE-owned-fixture-only-123456789',
    },
    userSid: 'S-1-5-21-1-2-3-1001',
    fingerprint: 'sha256:' + 'b'.repeat(64),
    msiSha256: 'c'.repeat(64),
    workerSha256: 'd'.repeat(64),
    root: 'V:\\bridge-owned-full-' + 'e'.repeat(32),
    proofPath: 'D:\\build\\proof.json',
    runtimePackageRoot: 'D:\\build\\public-runtime\\package',
    runtimeArchivePath: 'D:\\build\\public-runtime\\runtime.tgz',
    version,
  };
  assert.equal(windowsInstalledBootstrap(value, 'OWNED-CI'), value);
  for (const change of [
    { id: 'b'.repeat(32) },
    { host: '192.0.2.7' },
    { root: '' },
    { root: 'x\0y' },
    { root: 'x'.repeat(4097) },
    { userSid: 'S-1-5-18' },
    { fingerprint: 'sha256:unknown' },
    { msiSha256: 'bad' },
    { msiSha256: ['c'.repeat(64)] },
    { workerSha256: 'bad' },
    { workerSha256: ['d'.repeat(64)] },
    ...[
      { username: 'existing-user' },
      { domain: 'OTHER' },
      { password: 'short' },
      { password: 'x'.repeat(129) },
      { password: 'x'.repeat(32) + '\n' },
      { extra: true },
    ].map((change) => ({ credentials: { ...value.credentials, ...change } })),
  ])
    assert.throws(
      () => windowsInstalledBootstrap({ ...value, ...change }, 'OWNED-CI'),
      refused,
    );
});

test('public MSI download bounds redirects and bytes, checks SHA256 and never replaces another file', async () => {
  const directory = await mkdtemp(
    join(await realpath(tmpdir()), 'bridge-msi-download-'),
  );
  const bytes = Buffer.from('owned-public-MSI-fixture');
  const descriptor = windowsInstalledRelease(
    {
      ...release,
      assets: [
        {
          ...asset,
          size: bytes.length,
          digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    },
    version,
  );
  const target = join(directory, descriptor.name);
  const reply = (body, length = bytes.length) =>
    new Response(body, {
      headers: { 'content-length': String(length) },
    });
  const redirect = (location) =>
    new Response('', { status: 302, headers: { location } });
  try {
    const calls = [];
    const output = await downloadWindowsInstalledMsi(
      descriptor,
      directory,
      async (url, options) => {
        calls.push(url);
        assert.equal(options.redirect, 'manual');
        assert.deepEqual(Object.keys(options.headers).sort(), [
          'accept',
          'accept-encoding',
        ]);
        return calls.length === 1
          ? redirect(
              'https://release-assets.githubusercontent.com/owned-fixture',
            )
          : reply(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes.subarray(0, 7));
                  controller.enqueue(bytes.subarray(7));
                  controller.close();
                },
              }),
            );
      },
    );
    assert.equal(output, target);
    assert.equal(calls.length, 2);
    assert.deepEqual(await readFile(output), bytes);
    await unlink(output);
    for (const fetcher of [
      async () => reply(Buffer.concat([bytes, Buffer.from('x')])),
      async () => reply(bytes.subarray(1)),
      async () => reply(Buffer.alloc(bytes.length, 0)),
      async () => reply(bytes, bytes.length + 1),
      async () => new Response('not-found', { status: 404 }),
      async () => redirect('https://example.invalid/other.msi'),
      async () =>
        redirect('http://release-assets.githubusercontent.com/fixture'),
      async () =>
        redirect(
          'https://user:password@release-assets.githubusercontent.com/fixture',
        ),
      async () => redirect('https://release-assets.githubusercontent.com/loop'),
    ]) {
      await assert.rejects(
        downloadWindowsInstalledMsi(descriptor, directory, fetcher),
        { message: 'OWNED_INSTALLED_DOWNLOAD_REFUSED' },
      );
      assert.deepEqual(await readdir(directory), []);
    }
    let contacts = 0;
    await assert.rejects(
      downloadWindowsInstalledMsi(
        { ...descriptor, name: '../other.msi' },
        directory,
        async () => {
          contacts++;
          return reply(bytes);
        },
      ),
      refused,
    );
    await assert.rejects(
      downloadWindowsInstalledMsi(
        descriptor,
        directory + sep + '.',
        async () => {
          contacts++;
          return reply(bytes);
        },
      ),
      { message: 'OWNED_INSTALLED_DOWNLOAD_REFUSED' },
    );
    assert.equal(contacts, 0);
    await writeFile(target, 'owned-existing', { flag: 'wx' });
    await assert.rejects(
      downloadWindowsInstalledMsi(descriptor, directory, async () =>
        reply(bytes),
      ),
      { code: 'EEXIST' },
    );
    assert.equal(await readFile(target, 'utf8'), 'owned-existing');
    await unlink(target);
  } finally {
    // Only this newly allocated directory and its one fixed test filename.
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.equal(entry.name, descriptor.name);
      assert.ok(entry.isFile());
      await unlink(join(directory, entry.name));
    }
    await rmdir(directory);
  }
});

test('LocalService diagnostic output refuses an ordinary source-tree invocation', () => {
  const result = spawnSync(
    process.execPath,
    [
      'tests/fixtures/standalone-startup-diagnostic.mjs',
      'C:\\unused-payload',
      'C:\\unused-config',
      'E:\\bridge-owned-full-' + 'a'.repeat(32) + '\\runtime',
      '--owned-localservice-result',
    ],
    { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 8192 },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test(
  'installed client refuses invalid invocation and empty bootstrap before installed-service actions',
  { timeout: 10000 },
  async () => {
    for (const argv of [[], ['--unexpected'], ['--owned-windows-msi-full']]) {
      const child = spawn(
        process.execPath,
        ['tests/fixtures/windows-installed-files-client.mjs', ...argv],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let output = '',
        diagnostic = '';
      child.stdout.on('data', (bytes) => {
        output += bytes.toString();
        if (output.length > 8192) child.kill();
      });
      child.stderr.on('data', (bytes) => {
        diagnostic += bytes.toString();
        if (diagnostic.length > 8192) child.kill();
      });
      const terminal = new Promise((done, reject) => {
        child.once('error', reject);
        child.once('close', done);
      });
      child.stdin.end('{}\n');
      assert.equal(await terminal, 1);
      assert.equal(diagnostic, '');
      const events = output
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(events.length, 2);
      assert.equal(events[0].event, 'failed');
      assert.equal(events[0].phase, 'admission');
      assert.deepEqual(events[1], { event: 'closed', clean: true });
    }
  },
);

test(
  'Windows public configuration admission rejects private key material, extra roots and scalar coercion',
  { skip: process.platform !== 'win32', timeout: 10000 },
  () => {
    const good = {
      schemaVersion: 1,
      listen: { host: '127.0.0.1', port: 8080 },
      allowedOrigins: ['http://127.0.0.1:47997'],
      targets: [{ host: '127.0.0.1', port: 3389 }],
      limits: { maxSessions: 1, maxPerPrincipal: 1 },
      files: {
        maxTotalBytes: 4194304,
        maxFileBytes: 2097152,
        maxEntries: 64,
        xrdpLegacyDelete: false,
      },
      auth: {
        issuer: 'https://owned-msi.example.test',
        audience: 'bridge',
        jwks: {
          keys: [
            {
              kty: 'RSA',
              alg: 'RS256',
              kid: 'owned',
              use: 'sig',
              e: 'AQAB',
              n: 'a'.repeat(342),
            },
          ],
        },
      },
    };
    const changes = [
      (value) => {
        value.password = 'PRIVATE-owned-fixture';
      },
      (value) => {
        value.listen.password = 'PRIVATE-owned-fixture';
      },
      (value) => {
        value.listen.host = '0.0.0.0';
      },
      (value) => {
        value.listen.host = ['127.0.0.1', 'PRIVATE-owned-fixture'];
      },
      (value) => {
        value.listen.port = '8080';
      },
      (value) => {
        value.schemaVersion = [1, 'PRIVATE-owned-fixture'];
      },
      (value) => {
        value.targets[0].host = '192.0.2.7';
      },
      (value) => {
        value.targets[0].password = 'PRIVATE-owned-fixture';
      },
      (value) => {
        value.files.xrdpLegacyDelete = true;
      },
      (value) => {
        value.files.maxEntries = '64';
      },
      (value) => {
        value.auth.jwks.keys[0].d = 'PRIVATE-owned-fixture';
      },
      (value) => {
        value.auth.jwks.keys[0].kty = ['RSA', 'PRIVATE-owned-fixture'];
      },
      (value) => {
        value.auth.jwks.keys[0].n = ['a'.repeat(342)];
      },
      (value) => {
        value.auth.jwks.password = 'PRIVATE-owned-fixture';
      },
    ];
    const cases = [
      good,
      ...changes.map((change) => {
        const value = structuredClone(good);
        change(value);
        return value;
      }),
    ];
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        'tests/fixtures/windows-installed-config-controls.ps1',
      ],
      {
        input: JSON.stringify(cases),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 8192,
      },
    );
    assert.deepEqual(JSON.parse(output), {
      accepted: 1,
      refused: changes.length,
      publicMarkerRoundtrip: true,
    });
  },
);

test(
  'Windows host helper refuses empty input only in the explicit isolated MSI job',
  {
    skip:
      process.platform !== 'win32' ||
      process.env.BRIDGE_WINDOWS_MSI_HOST_TEST !== '1',
    timeout: 10000,
  },
  async () => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        'tests/fixtures/windows-installed-full-host.ps1',
        '-Action',
        'mount',
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      diagnostic = '';
    child.stdout.on('data', (bytes) => {
      output += bytes.toString();
      if (output.length > 8192) child.kill();
    });
    child.stderr.on('data', (bytes) => {
      diagnostic += bytes.toString();
      if (diagnostic.length > 8192) child.kill();
    });
    const terminal = new Promise((done, reject) => {
      child.once('error', reject);
      child.once('close', done);
    });
    child.stdin.end('{}\n');
    assert.equal(await terminal, 1);
    assert.equal(diagnostic, '');
    const result = JSON.parse(output);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'OWNED_INSTALLED_HOST_REFUSED');
    assert.equal(result.action, 'mount');
    assert.ok(Array.isArray(result.lines) && result.lines.length <= 6);
  },
);

const coordinatorPython = ['python3', 'python'].find(
  (command) =>
    spawnSync(
      command,
      ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)'],
      {
        windowsHide: true,
        timeout: 3000,
        encoding: 'utf8',
      },
    ).status === 0,
);
test(
  'installed coordinator pure context, secret-free environment, verdict and bounded child-pipe controls',
  { skip: !coordinatorPython, timeout: 15000 },
  () => {
    execFileSync(
      coordinatorPython,
      ['-B', 'tests/packaging/windows-installed-full-controls.py'],
      { windowsHide: true, timeout: 12000, maxBuffer: 8192 },
    );
  },
);
