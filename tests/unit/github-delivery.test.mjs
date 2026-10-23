import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  safePath,
  parseManifest,
  readJson,
  hashFile,
  verifyArchives,
  verifySources,
} from '../../scripts/github-delivery/manifest.mjs';

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
    await verifySources(root, manifest);
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
