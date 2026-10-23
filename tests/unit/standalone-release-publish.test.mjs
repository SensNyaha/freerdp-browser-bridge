import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { publishStandaloneRelease } from '../../scripts/standalone/release-publish.mjs';
import { standaloneReleaseNames } from '../../scripts/standalone/release-artifacts.mjs';
import { standaloneReleasePreflight } from '../../scripts/standalone/release-preflight.mjs';
import { standaloneUpgradeSeed } from '../../scripts/standalone/release-plan.mjs';
import { standaloneGithubApi } from '../../scripts/standalone/release-api.mjs';
import { productVersion } from '../../scripts/product-version.mjs';

const environment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'SensNyaha/freerdp-browser-bridge',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
};
test('standalone publisher preserves core assets, publishes manifest last, skips exact bytes and refuses conflicts/uncertain writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-standalone-release-'));
  try {
    for (const platform of ['win32-x64', 'linux-x64-gnu']) {
      const files = [];
      for (const name of standaloneReleaseNames('0.2.5', platform)) {
        const bytes = Buffer.from('synthetic-public-' + name);
        await writeFile(join(root, name), bytes);
        files.push({
          name,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          integrity:
            'sha512-' + createHash('sha512').update(bytes).digest('base64'),
        });
      }
      await writeFile(
        join(root, 'standalone-' + platform + '.json'),
        JSON.stringify({
          schema: 1,
          version: '0.2.5',
          sourceCommit: environment.GITHUB_SHA,
          platform,
          files,
          acceptance: {
            portable: true,
            installed: true,
            realRdpDesktop: false,
            upgradeFrom: '0.2.4',
            os: platform === 'win32-x64' ? 'windows-2025' : 'ubuntu-24.04',
          },
        }),
      );
    }
    const original = {
      name: 'accepted-core.tgz',
      state: 'uploaded',
      size: 1,
      digest: 'sha256:' + 'c'.repeat(64),
    };
    const release = {
      id: 7,
      tag_name: 'v0.2.5',
      draft: false,
      prerelease: false,
      assets: [structuredClone(original)],
    };
    const writes = [];
    let uncertain = false;
    const api = async (path, options = {}) => {
      if (path.includes('/git/ref/'))
        return { object: { type: 'tag', sha: 'b'.repeat(40) } };
      if (path.includes('/git/tags/'))
        return { object: { type: 'commit', sha: environment.GITHUB_SHA } };
      if (options.method !== 'POST') return structuredClone(release);
      const chunks = [];
      for await (const chunk of options.body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks),
        name = new URL(path).searchParams.get('name');
      writes.push(name);
      if (uncertain) throw new Error('SYNTHETIC_UNCERTAIN_UPLOAD');
      assert.equal(bytes.length, options.bytes);
      const asset = {
        name,
        state: 'uploaded',
        size: bytes.length,
        digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      };
      release.assets.push(asset);
      return structuredClone(asset);
    };
    const options = { directory: root, environment, api };
    assert.equal((await publishStandaloneRelease(options)).uploaded, 9);
    assert.equal(writes.at(-1), 'standalone-manifest.json');
    assert.deepEqual(release.assets[0], original);
    assert.equal((await publishStandaloneRelease(options)).uploaded, 0);
    assert.equal(writes.length, 9);
    const download = async () =>
      new Response(await readFile(join(root, 'standalone-manifest.json')));
    assert.equal(
      (await standaloneReleasePreflight('0.2.5', { api, download }))
        .alreadyPublished,
      true,
    );
    release.assets[1].digest = 'sha256:' + 'd'.repeat(64);
    await assert.rejects(
      publishStandaloneRelease(options),
      /STANDALONE_RELEASE_ASSET_CONFLICT/,
    );
    assert.equal(writes.length, 9);
    await assert.rejects(
      standaloneReleasePreflight('0.2.5', { api, download }),
      /STANDALONE_RELEASE_ASSET_READBACK_INVALID/,
    );
    release.assets = [structuredClone(original)];
    uncertain = true;
    await assert.rejects(
      publishStandaloneRelease(options),
      /SYNTHETIC_UNCERTAIN_UPLOAD/,
    );
    assert.equal(writes.length, 10);
    await assert.rejects(
      publishStandaloneRelease({
        ...options,
        environment: { ...environment, GITHUB_REF: 'refs/heads/feature/test' },
      }),
      /STANDALONE_RELEASE_PUBLISH_CONTEXT_REFUSED/,
    );
    assert.equal(writes.length, 10);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^bridge-standalone-release-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true });
  }
});
test('standalone release seed and API refuse unsupported versions, foreign endpoints and unauthenticated writes', async () => {
  assert.deepEqual(standaloneUpgradeSeed('0.2.5'), {
    version: '0.2.4',
    ref: 'de46cea5776be19971716117b1c37dbf46012464',
  });
  assert.deepEqual(standaloneUpgradeSeed('0.2.6'), {
    version: '0.2.5',
    ref: 'v0.2.5',
  });
  assert.equal(standaloneUpgradeSeed('0.2.4'), undefined);
  assert.throws(
    () => standaloneUpgradeSeed('0.2.5-beta'),
    /STANDALONE_RELEASE_VERSION_INVALID/,
  );
  const api = standaloneGithubApi(undefined, () =>
    assert.fail('No network allowed'),
  );
  for (const path of [
    'https://example.test/repos/SensNyaha/freerdp-browser-bridge/releases',
    '/repos/Other/repo/releases',
  ])
    await assert.rejects(api(path), /STANDALONE_RELEASE_API_TARGET_REFUSED/);
  await assert.rejects(
    api('/repos/SensNyaha/freerdp-browser-bridge/releases', { method: 'POST' }),
    /STANDALONE_RELEASE_API_TARGET_REFUSED/,
  );
});

test('standalone preflight requires every public lock-identical core dependency and refuses a partial previous upload', async () => {
  const release = {
    id: 7,
    tag_name: 'v' + productVersion,
    draft: false,
    prerelease: false,
    assets: [],
  };
  const expected = new Map();
  for (const platform of ['win32-x64', 'linux-x64-gnu']) {
    const lock = JSON.parse(
      await readFile(
        'packaging/standalone/locks/' + platform + '.json',
        'utf8',
      ),
    );
    for (const [path, value] of Object.entries(lock.packages))
      if (path.startsWith('node_modules/@freerdp-bridge/'))
        expected.set(path.slice('node_modules/'.length), value.integrity);
  }
  const api = async () => structuredClone(release);
  const calls = [];
  const metadata = async (name, version) => {
    calls.push(name);
    return { name, version, dist: { integrity: expected.get(name) } };
  };
  assert.equal(
    (await standaloneReleasePreflight(productVersion, { api, metadata }))
      .alreadyPublished,
    false,
  );
  assert.equal(new Set(calls).size, 6);
  await assert.rejects(
    standaloneReleasePreflight(productVersion, {
      api,
      metadata: async () => undefined,
    }),
    /STANDALONE_RELEASE_PUBLIC_DEPENDENCIES_REQUIRED/,
  );
  release.assets = [
    { name: standaloneReleaseNames(productVersion, 'win32-x64')[0] },
  ];
  await assert.rejects(
    standaloneReleasePreflight(productVersion, {
      api,
      metadata: () => assert.fail('Partial uploads cannot start a new build'),
    }),
    /STANDALONE_RELEASE_PARTIAL_RETRY_ORIGINAL_PUBLISH_JOB/,
  );
  const missing = standaloneGithubApi(
    undefined,
    async () => new Response('', { status: 404 }),
  );
  assert.equal(
    await missing(
      '/repos/SensNyaha/freerdp-browser-bridge/releases/tags/v0.2.5',
    ),
    undefined,
  );
  const denied = standaloneGithubApi(
    undefined,
    async () =>
      new Response('private response must not be echoed', { status: 401 }),
  );
  await assert.rejects(
    denied('/repos/SensNyaha/freerdp-browser-bridge/releases'),
    /STANDALONE_RELEASE_API_REQUEST_UNCONFIRMED/,
  );
  const oversized = standaloneGithubApi(
    undefined,
    async () => new Response('x'.repeat(2097153)),
  );
  await assert.rejects(
    oversized('/repos/SensNyaha/freerdp-browser-bridge/releases'),
    /STANDALONE_RELEASE_API_RESPONSE_LIMIT/,
  );
});
