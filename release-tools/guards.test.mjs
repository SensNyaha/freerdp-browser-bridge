import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  safePath,
  parseManifest,
  readJson,
  hashFile,
  verifyArchives,
  verifySources,
} from './manifest.mjs';
import {
  assertOidcContext,
  publishAccepted,
  publishTag,
  publicMetadata,
} from './publish.mjs';
import { assetDirectory, fetchAssets } from './fetch.mjs';

const sample = () => ({
  schema: 1,
  kind: 'express',
  version: '0.2.4',
  repository: 'SensNyaha/freerdp-bridge-express',
  upstream: {
    tag: 'v0.2.4',
    commit: 'a'.repeat(40),
    acceptance: 'docs/ITERATION_438.md',
  },
  packages: [
    {
      name: '@freerdp-bridge/express',
      version: '0.2.4',
      archive: 'freerdp-bridge-express-0.2.4.tgz',
      bytes: 1,
      sha256: 'b'.repeat(64),
      integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64'),
    },
  ],
  sources: [{ path: 'source.mjs', bytes: 1, sha256: 'c'.repeat(64) }],
});
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, 'Fixture tool failed');
};
const commitFixture = (root) =>
  run(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=.delivery-no-hooks',
      '-c',
      'user.name=Delivery fixture',
      '-c',
      'user.email=fixture@invalid.example',
      'commit',
      '--quiet',
      '-m',
      'Fixture acceptance',
    ],
    root,
  );
const withRoot = async (run) => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-delivery-test-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test('GitHub delivery rejects changed publisher binding, versions, package set and allocation bounds', () => {
  assert.equal(
    parseManifest(sample()).repository,
    'SensNyaha/freerdp-bridge-express',
  );
  for (const change of [
    (value) => (value.repository = 'freerdp-bridge/freerdp-bridge-express'),
    (value) => (value.upstream.tag = 'v0.2.3'),
    (value) => (value.version = '0.2.4;echo unsafe'),
    (value) => value.packages.push(value.packages[0]),
    (value) => (value.packages[0].bytes = 128 * 1024 * 1024 + 1),
    (value) => (value.packages[0].integrity = 'sha512-incorrect'),
    (value) => (value.sources[0].bytes = 4 * 1024 * 1024 + 1),
    (value) => (value.sources = Array(4097).fill(value.sources[0])),
    (value) => value.sources.push({ ...value.sources[0], path: 'SOURCE.mjs' }),
    (value) => (value.sources[0].path = '.delivery/release.json'),
  ]) {
    const value = sample();
    change(value);
    assert.throws(
      () => parseManifest(value),
      (error) => /^DELIVERY_/.test(error.code),
    );
  }
  for (const path of [
    '/absolute',
    '../parent',
    'a/../b',
    'a//b',
    'C:/file',
    'a\\b',
    '.npmrc',
    '.local-tests/test.json',
    'node_modules/x',
    '.git/config',
    '.env',
    'a\0b',
  ])
    assert.throws(
      () => safePath(path),
      (error) => error.code === 'DELIVERY_PATH_INVALID',
    );
  assert.equal(safePath('docs/пример.md'), 'docs/пример.md');
  assert.equal(safePath('.env.example'), '.env.example');
});

test('GitHub delivery JSON and file access refuse oversize data and escaped/reparsed paths', async () => {
  await withRoot(async (root) => {
    await writeFile(join(root, 'input.json'), '{}'.padEnd(1025));
    await assert.rejects(
      readJson(root, 'input.json', 1024),
      (error) => error.code === 'DELIVERY_FILE_INVALID',
    );
    await writeFile(join(root, 'input.json'), '{"accepted":true}');
    assert.deepEqual(await readJson(root, 'input.json', 1024), {
      accepted: true,
    });
    const outside = join(root, 'outside'),
      workspace = join(root, 'workspace');
    await mkdir(outside);
    await mkdir(workspace);
    await writeFile(join(outside, 'source'), 'outside');
    await symlink(
      outside,
      join(workspace, 'escape'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(
      hashFile(workspace, 'escape/source', 1024),
      (error) => error.code === 'DELIVERY_FILE_INVALID',
    );
  });
});

test('GitHub delivery validates real tar bytes before trusting package owner/version metadata', async () => {
  await withRoot(async (root) => {
    const content = join(root, 'content');
    await mkdir(join(content, 'package'), { recursive: true });
    const manifest = sample(),
      item = manifest.packages[0];
    const metadata = {
      name: item.name,
      version: item.version,
      repository: {
        type: 'git',
        url: 'git+https://github.com/' + manifest.repository + '.git',
      },
    };
    const pack = async () => {
      await writeFile(
        join(content, 'package/package.json'),
        JSON.stringify(metadata),
      );
      run(
        'tar',
        ['-czf', join(root, item.archive), '-C', content, 'package'],
        root,
      );
      const hash = await hashFile(root, item.archive, 128 * 1024 * 1024);
      Object.assign(item, {
        bytes: hash.bytes,
        sha256: hash.sha256,
        integrity: hash.integrity,
      });
    };
    await pack();
    await verifyArchives(root, manifest);
    const bytes = await readFile(join(root, item.archive));
    bytes[bytes.length - 1] ^= 1;
    await writeFile(join(root, item.archive), bytes);
    await assert.rejects(
      verifyArchives(root, manifest),
      (error) => error.code === 'DELIVERY_ARCHIVE_CHANGED',
    );
    metadata.repository.url = 'git+https://github.com/another/repository.git';
    await pack();
    await assert.rejects(
      verifyArchives(root, manifest),
      (error) => error.code === 'DELIVERY_ARCHIVE_METADATA_INVALID',
    );
  });
});

test('GitHub delivery source inventory refuses drift and extra tracked files while allowing empty source files', async () => {
  await withRoot(async (root) => {
    run('git', ['init', '--quiet'], root);
    await mkdir(join(root, '.delivery'));
    await writeFile(join(root, 'source.mjs'), 'export const value = 1;\n');
    await writeFile(join(root, 'empty.txt'), '');
    const manifest = sample();
    manifest.sources = [];
    for (const path of ['source.mjs', 'empty.txt']) {
      const hash = await hashFile(root, path, 4 * 1024 * 1024);
      manifest.sources.push({ path, bytes: hash.bytes, sha256: hash.sha256 });
    }
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(manifest),
    );
    run('git', ['add', '.'], root);
    commitFixture(root);
    await verifySources(root, manifest);
    const changed = { ...manifest, extra: 'uncommitted metadata' };
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(changed),
    );
    await assert.rejects(
      verifySources(root, changed),
      (error) => error.code === 'DELIVERY_MANIFEST_CHANGED',
    );
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(manifest) + ' ',
    );
    await assert.rejects(
      verifySources(root, manifest),
      (error) => error.code === 'DELIVERY_GIT_DIRTY',
    );
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(manifest),
    );
    await writeFile(join(root, 'extra.mjs'), 'unexpected');
    run('git', ['add', 'extra.mjs'], root);
    await assert.rejects(
      verifySources(root, manifest),
      (error) => error.code === 'DELIVERY_SOURCE_SET_CHANGED',
    );
    run('git', ['reset', '--quiet', '--', 'extra.mjs'], root);
    await writeFile(join(root, 'source.mjs'), 'changed');
    await assert.rejects(
      verifySources(root, manifest),
      (error) => error.code === 'DELIVERY_SOURCE_CHANGED',
    );
  });
});

test('GitHub delivery OIDC gate refuses local/token fallback and historical publishing never downgrades latest', () => {
  const context = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'SensNyaha/freerdp-bridge-express',
    DELIVERY_TAG: 'v0.2.4',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example.invalid/oidc',
  };
  assert.doesNotThrow(() => assertOidcContext(sample(), context));
  for (const override of [
    { GITHUB_ACTIONS: undefined },
    { GITHUB_REPOSITORY: 'other/repo' },
    { DELIVERY_TAG: 'v0.2.3' },
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: undefined },
    { NPM_TOKEN: 'synthetic-fallback' },
    { NODE_AUTH_TOKEN: 'synthetic-fallback' },
  ])
    assert.throws(
      () => assertOidcContext(sample(), { ...context, ...override }),
      (error) => error.code === 'DELIVERY_OIDC_CONTEXT_REQUIRED',
    );
  assert.equal(publishTag('0.2.4', undefined), 'latest');
  assert.equal(publishTag('0.2.4', { version: '0.0.0-stage' }), 'latest');
  assert.equal(publishTag('0.2.4', { version: '0.2.3' }), 'latest');
  assert.equal(publishTag('0.2.4', { version: '0.2.5' }), 'release-0.2.4');
  assert.throws(
    () => publishTag('0.2.4', { version: '1.0.0-beta' }),
    (error) => error.code === 'DELIVERY_LATEST_VERSION_UNSUPPORTED',
  );
});

test('GitHub delivery registry reads are public, bounded and refuse malformed data', async () => {
  let seen;
  const fetcher = async (url, options) => {
    seen = { url, options };
    return new Response('{"name":"@freerdp-bridge/express"}');
  };
  assert.equal(
    (await publicMetadata('@freerdp-bridge/express', '0.2.4', fetcher)).name,
    '@freerdp-bridge/express',
  );
  assert.ok(
    seen.url.startsWith(
      'https://registry.npmjs.org/@freerdp-bridge%2Fexpress/0.2.4?',
    ),
  );
  assert.deepEqual(Object.keys(seen.options.headers), ['cache-control']);
  assert.equal(
    await publicMetadata(
      'test',
      '0.2.4',
      async () => new Response('', { status: 404 }),
    ),
    undefined,
  );
  await assert.rejects(
    publicMetadata(
      'test',
      '0.2.4',
      async () => new Response('x'.repeat(1024 * 1024 + 1)),
    ),
    (error) => error.code === 'DELIVERY_REGISTRY_READ_LIMIT',
  );
  await assert.rejects(
    publicMetadata('test', '0.2.4', async () => new Response('malformed')),
    (error) => error.code === 'DELIVERY_REGISTRY_JSON_INVALID',
  );
});

test('GitHub delivery publisher skips identical bytes, refuses conflicting bytes and never retries an uncertain upload', async () => {
  await withRoot(async (root) => {
    run('git', ['init', '--quiet'], root);
    const archives = join(root, 'archives');
    await mkdir(archives);
    const content = join(root, 'content');
    await mkdir(join(content, 'package'), { recursive: true });
    const manifest = sample(),
      item = manifest.packages[0];
    await writeFile(
      join(content, 'package/package.json'),
      JSON.stringify({
        name: item.name,
        version: item.version,
        repository: {
          type: 'git',
          url: 'git+https://github.com/' + manifest.repository + '.git',
        },
      }),
    );
    run(
      'tar',
      ['-czf', join(archives, item.archive), '-C', content, 'package'],
      root,
    );
    const hash = await hashFile(archives, item.archive, 128 * 1024 * 1024);
    Object.assign(item, {
      bytes: hash.bytes,
      sha256: hash.sha256,
      integrity: hash.integrity,
    });
    // Only the declared source is tracked; neither payloads nor work directories enter Git.
    await mkdir(join(root, '.delivery'));
    await writeFile(join(root, 'source.mjs'), 'source');
    const source = await hashFile(root, 'source.mjs', 1024);
    manifest.sources = [
      { path: 'source.mjs', bytes: source.bytes, sha256: source.sha256 },
    ];
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(manifest),
    );
    run('git', ['add', 'source.mjs', '.delivery/release.json'], root);
    commitFixture(root);
    const environment = {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: manifest.repository,
      DELIVERY_TAG: manifest.upstream.tag,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-oidc',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example.invalid/oidc',
    };
    const publicVersion = {
      name: item.name,
      version: item.version,
      dist: { integrity: item.integrity },
    };
    let commands = 0;
    const options = {
      root,
      archives,
      manifest,
      environment,
      run: () => {
        commands++;
        throw Error('Unexpected publication');
      },
      report: () => {},
    };
    const skipped = await publishAccepted({
      ...options,
      metadata: async () => publicVersion,
    });
    assert.equal(skipped[0].alreadyPublic, true);
    assert.equal(commands, 0);
    await assert.rejects(
      publishAccepted({
        ...options,
        metadata: async () => ({
          ...publicVersion,
          dist: { integrity: 'sha512-different' },
        }),
      }),
      (error) => error.code === 'DELIVERY_PUBLIC_BYTES_DIFFER',
    );
    assert.equal(commands, 0);
    const uncertain = await publishAccepted({
      ...options,
      metadata: async (_name, version) =>
        version === 'latest'
          ? { name: item.name, version: '0.2.5' }
          : commands
            ? publicVersion
            : undefined,
      run: (_command, args, settings) => {
        commands++;
        assert.ok(args.includes('--tag=release-0.2.4'));
        assert.ok(args.includes('--provenance'));
        assert.deepEqual(settings.stdio, ['ignore', 'pipe', 'pipe']);
        return { status: 1, stderr: 'synthetic private CLI diagnostic' };
      },
    });
    assert.equal(commands, 1);
    assert.equal(uncertain[0].commandUnconfirmed, true);
    commands = 0;
    await assert.rejects(
      publishAccepted({
        ...options,
        metadata: async () => undefined,
        run: () => {
          commands++;
          return { status: 1 };
        },
      }),
      (error) => error.code === 'DELIVERY_NPM_PUBLISH_UNCONFIRMED',
    );
    assert.equal(commands, 1);
    commands = 0;
    let readsAfterUpload = 0,
      waited = 0;
    const delayed = await publishAccepted({
      ...options,
      metadata: async (_name, version) =>
        version === 'latest' || !commands
          ? undefined
          : ++readsAfterUpload > 16
            ? publicVersion
            : undefined,
      run: () => {
        commands++;
        return { status: 0 };
      },
      pause: async (milliseconds) => {
        waited += milliseconds;
      },
    });
    assert.equal(commands, 1);
    assert.equal(readsAfterUpload, 17);
    assert.equal(waited, 80000);
    assert.equal(delayed[0].publicExact, true);
  });
});

test('GitHub release downloads enforce exact bytes, keep assets outside Git and do not replace corrupt existing files', async () => {
  await withRoot(async (root) => {
    run('git', ['init', '--quiet'], root);
    const content = join(root, 'content');
    await mkdir(join(content, 'package'), { recursive: true });
    const manifest = sample(),
      item = manifest.packages[0];
    await writeFile(
      join(content, 'package/package.json'),
      JSON.stringify({
        name: item.name,
        version: item.version,
        repository: {
          type: 'git',
          url: 'git+https://github.com/' + manifest.repository + '.git',
        },
      }),
    );
    run(
      'tar',
      ['-czf', join(root, item.archive), '-C', content, 'package'],
      root,
    );
    const hash = await hashFile(root, item.archive, 1024 * 1024);
    Object.assign(item, {
      bytes: hash.bytes,
      sha256: hash.sha256,
      integrity: hash.integrity,
    });
    await writeFile(join(root, 'source.mjs'), 'source');
    const source = await hashFile(root, 'source.mjs', 1024);
    manifest.sources = [
      { path: 'source.mjs', bytes: source.bytes, sha256: source.sha256 },
    ];
    await mkdir(join(root, '.delivery'));
    await writeFile(
      join(root, '.delivery/release.json'),
      JSON.stringify(manifest),
    );
    run('git', ['add', 'source.mjs', '.delivery/release.json'], root);
    commitFixture(root);
    const sourceBytes = await readFile(join(root, '.delivery/release.json'));
    const archiveBytes = await readFile(join(root, item.archive));
    let oversized = true,
      calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      assert.ok(
        url.startsWith(
          'https://github.com/SensNyaha/freerdp-bridge-express/releases/download/v0.2.4/',
        ),
      );
      assert.equal(options.headers, undefined);
      return new Response(
        url.endsWith('delivery-manifest.json')
          ? sourceBytes
          : oversized
            ? Buffer.concat([archiveBytes, Buffer.from('extra')])
            : archiveBytes,
      );
    };
    await assert.rejects(
      fetchAssets(root, manifest, fetcher),
      (error) => error.code === 'DELIVERY_ASSET_SIZE_CHANGED',
    );
    const assets = await assetDirectory(root);
    await assert.rejects(
      readFile(join(assets, item.archive)),
      (error) => error.code === 'ENOENT',
    );
    oversized = false;
    await fetchAssets(root, manifest, fetcher);
    const downloaded = calls;
    await fetchAssets(root, manifest, fetcher);
    assert.equal(calls, downloaded);
    await verifySources(root, manifest);
    await writeFile(join(assets, item.archive), Buffer.alloc(item.bytes, 0));
    await assert.rejects(
      fetchAssets(root, manifest, fetcher),
      (error) => error.code === 'DELIVERY_EXISTING_ASSET_CHANGED',
    );
    assert.deepEqual(
      await readFile(join(assets, item.archive)),
      Buffer.alloc(item.bytes, 0),
    );
    await copyFile(join(root, item.archive), join(assets, item.archive));
    const entry = fileURLToPath(new URL('./run.mjs', import.meta.url));
    const environment = Object.fromEntries(
      ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG'].flatMap(
        (name) =>
          process.env[name] === undefined ? [] : [[name, process.env[name]]],
      ),
    );
    const verified = spawnSync(process.execPath, [entry, 'verify'], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert.equal(verified.status, 0);
    assert.equal(JSON.parse(verified.stdout).published, false);
    const refused = spawnSync(process.execPath, [entry, 'publish'], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert.equal(refused.status, 1);
    assert.equal(
      JSON.parse(refused.stderr).code,
      'DELIVERY_OIDC_CONTEXT_REQUIRED',
    );
  });
});
