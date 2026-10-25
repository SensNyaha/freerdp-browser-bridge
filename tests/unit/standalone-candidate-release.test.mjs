import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import {
  standaloneCandidatePointer,
  readStandaloneCandidatePointer,
  fetchStandaloneCandidates,
  downloadCandidateAsset,
} from '../../scripts/standalone/candidate-release.mjs';
const pointer = () => ({
  schema: 1,
  version: '0.2.5',
  sourceCommit: 'a'.repeat(40),
  tag: 'standalone-candidate-0.2.5-' + 'a'.repeat(12),
});
const hashes = (bytes) => ({
  size: bytes.length,
  digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
});
async function retire(root) {
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.match(basename(root), /^bridge-candidate-release-[A-Za-z0-9]+$/);
  await rm(root, { recursive: true, force: true });
}
test('candidate archive transport accepts exact 0.3.0 names and refuses noncanonical minor/patch forms before fetch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-candidate-release-'));
  try {
    const bytes = Buffer.from('synthetic-0.3.0-archive');
    const entry = {
      id: 1,
      name: 'freerdp-bridge-node-0.3.0.tgz',
      ...hashes(bytes),
    };
    await downloadCandidateAsset(
      entry,
      root,
      undefined,
      async () =>
        new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        }),
    );
    assert.deepEqual(await readFile(join(root, entry.name)), bytes);
    for (const name of [
      'freerdp-bridge-node-0.03.0.tgz',
      'freerdp-bridge-node-0.3.00.tgz',
      'freerdp-bridge-node-0.3.0-beta.tgz',
      '../freerdp-bridge-node-0.3.0.tgz',
    ])
      await assert.rejects(
        downloadCandidateAsset({ ...entry, name }, root, undefined, () =>
          assert.fail('Invalid name must not reach fetch'),
        ),
        /STANDALONE_CANDIDATE_RELEASE_INVALID/,
      );
    assert.deepEqual(await readdir(root), [entry.name]);
  } finally {
    await retire(root);
  }
});

test('candidate transport binds a prerelease and annotated source tag, requires all five lock hashes and never forwards auth to storage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-candidate-release-'));
  try {
    await mkdir(join(root, 'packaging/standalone/locks'), { recursive: true });
    assert.equal(
      await readStandaloneCandidatePointer(root, '0.2.5'),
      undefined,
    );
    await writeFile(
      join(root, 'packaging/standalone/candidate-release.json'),
      JSON.stringify(pointer()),
    );
    const lock = JSON.parse(
      await readFile('packaging/standalone/locks/win32-x64.json', 'utf8'),
    );
    lock.version = lock.packages[''].version = '0.2.5';
    for (const name of Object.keys(lock.packages[''].dependencies))
      if (name.startsWith('@freerdp-bridge/'))
        lock.packages[''].dependencies[name] = '0.2.5';
    const bytesById = new Map(),
      assets = [];
    for (const [path, value] of Object.entries(lock.packages))
      if (path.startsWith('node_modules/@freerdp-bridge/')) {
        const suffix = path.slice('node_modules/@freerdp-bridge/'.length),
          id = assets.length + 1;
        const bytes = Buffer.from('synthetic archive transport ' + suffix),
          entry = hashes(bytes);
        value.version = '0.2.5';
        for (const field of [
          'dependencies',
          'optionalDependencies',
          'peerDependencies',
        ])
          for (const name of Object.keys(value[field] ?? {}))
            if (name.startsWith('@freerdp-bridge/'))
              value[field][name] = '0.2.5';
        value.integrity = entry.integrity;
        value.resolved =
          'https://registry.npmjs.org/@freerdp-bridge/' +
          suffix +
          '/-/' +
          suffix +
          '-0.2.5.tgz';
        bytesById.set(id, bytes);
        assets.push({
          id,
          name: 'freerdp-bridge-' + suffix + '-0.2.5.tgz',
          state: 'uploaded',
          size: entry.size,
          digest: entry.digest,
        });
      }
    await writeFile(
      join(root, 'packaging/standalone/locks/win32-x64.json'),
      JSON.stringify(lock),
    );
    const release = {
      ...pointer(),
      tag_name: pointer().tag,
      draft: false,
      prerelease: true,
      assets,
    };
    const api = async (path) =>
      path.includes('/git/ref/')
        ? { object: { type: 'tag', sha: 'b'.repeat(40) } }
        : path.includes('/git/tags/')
          ? { object: { type: 'commit', sha: pointer().sourceCommit } }
          : [structuredClone(release)];
    const requests = [];
    const fetcher = async (url, options) => {
      url = new URL(url);
      requests.push(url.hostname);
      if (url.hostname === 'api.github.com') {
        assert.equal(options.headers.authorization, 'Bearer synthetic-only');
        assert.equal(options.redirect, 'manual');
        return new Response(null, {
          status: 302,
          headers: {
            location:
              'https://release-assets.githubusercontent.com/' +
              url.pathname.split('/').at(-1),
          },
        });
      }
      assert.equal(url.hostname, 'release-assets.githubusercontent.com');
      assert.equal(options.headers, undefined);
      assert.equal(options.redirect, 'error');
      return new Response(bytesById.get(Number(url.pathname.slice(1))));
    };
    let verified = 0;
    const options = {
      repository: root,
      version: '0.2.5',
      platform: 'win32-x64',
      token: 'synthetic-only',
      environment: {
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'SensNyaha/freerdp-browser-bridge',
      },
      api,
      fetcher,
      verify: async (actual, version, platform, directory) => {
        assert.deepEqual(actual, lock);
        assert.equal(version, '0.2.5');
        assert.equal(platform, 'win32-x64');
        for (const asset of assets)
          assert.deepEqual(
            await readFile(join(directory, asset.name)),
            bytesById.get(asset.id),
          );
        verified++;
      },
    };
    const result = await fetchStandaloneCandidates(options);
    assert.equal(result.candidateOnly, true);
    assert.equal(result.archives, 5);
    assert.equal(verified, 1);
    assert.equal(requests.length, 10);
    await assert.rejects(
      fetchStandaloneCandidates({
        ...options,
        api: async (path) => (path.includes('/releases?') ? [] : api(path)),
      }),
      /STANDALONE_CANDIDATE_DRAFT_NOT_VISIBLE/,
    );
    await assert.rejects(
      fetchStandaloneCandidates({
        ...options,
        environment: { ...options.environment, STANDALONE_PUBLISH: 'true' },
      }),
      /STANDALONE_CANDIDATE_RELEASE_INVALID/,
    );
    release.prerelease = false;
    await assert.rejects(
      fetchStandaloneCandidates({
        ...options,
        fetcher: () =>
          assert.fail('Stable releases cannot be candidate inputs'),
      }),
      /STANDALONE_CANDIDATE_RELEASE_INVALID/,
    );
    assert.equal(verified, 1);
  } finally {
    await retire(root);
  }
});
test('candidate streams refuse excess bytes/hash drift/foreign redirects and remove only their incomplete file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-candidate-release-'));
  try {
    const bytes = Buffer.from('abc'),
      asset = { id: 1, name: 'freerdp-bridge-api-0.2.5.tgz', ...hashes(bytes) };
    await downloadCandidateAsset(
      asset,
      root,
      undefined,
      async (_url, options) => {
        assert.equal(options.headers.authorization, undefined);
        return new Response(bytes);
      },
    );
    assert.deepEqual(await readFile(join(root, asset.name)), bytes);
    await rm(join(root, asset.name));
    for (const body of ['abcd', 'bad']) {
      await assert.rejects(
        downloadCandidateAsset(
          asset,
          root,
          'synthetic-only',
          async () => new Response(body),
        ),
        /STANDALONE_CANDIDATE_RELEASE_INVALID/,
      );
      assert.deepEqual(await readdir(root), []);
    }
    let calls = 0;
    await assert.rejects(
      downloadCandidateAsset(asset, root, 'synthetic-only', async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.test/untrusted' },
        });
      }),
      /STANDALONE_CANDIDATE_RELEASE_INVALID/,
    );
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(
      downloadCandidateAsset(
        { ...asset, size: 134217729 },
        root,
        'synthetic-only',
        () => assert.fail('Bound before request'),
      ),
      /STANDALONE_CANDIDATE_RELEASE_INVALID/,
    );
  } finally {
    await retire(root);
  }
});
test('candidate pointers reject unknown fields, other versions, foreign tags and malformed source IDs', () => {
  assert.deepEqual(standaloneCandidatePointer(pointer(), '0.2.5'), pointer());
  for (const change of [
    (v) => (v.token = 'synthetic-forbidden'),
    (v) => (v.version = '0.2.4'),
    (v) => (v.tag = 'v0.2.5'),
    (v) => (v.sourceCommit = 'not-a-commit'),
    (v) => (v.schema = 2),
  ]) {
    const value = pointer();
    change(value);
    assert.throws(
      () => standaloneCandidatePointer(value, '0.2.5'),
      /STANDALONE_CANDIDATE_RELEASE_INVALID/,
    );
  }
});
