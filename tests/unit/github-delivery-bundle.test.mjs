import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadBundle } from '../../scripts/github-delivery/bundle.mjs';
import {
  adapters,
  shared,
  repositoryFor,
  hashFile,
} from '../../scripts/github-delivery/manifest.mjs';

test('Delivery bundle anchors all ten archives to the original annotated acceptance tag and refuses catalog, asset and upstream drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'delivery-bundle-'));
  const git = (cwd, args) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgSign=false',
        '-c',
        'core.hooksPath=.no-hooks',
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@invalid.example',
        ...args,
      ],
      {
        cwd,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 65536,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, 'Fixture git operation');
    return result.stdout.trim();
  };
  const version = '0.2.99',
    tag = 'v' + version,
    records = new Map(),
    authority = join(root, 'authority');
  const json = async (path, value) =>
    writeFile(path, JSON.stringify(value, null, 2) + '\n');
  try {
    const scratch = join(root, 'tar-source');
    await mkdir(join(scratch, 'package'), { recursive: true });
    for (const kind of ['core', ...adapters]) {
      const suffixes = kind === 'core' ? shared : [kind],
        short =
          kind === 'core' ? 'freerdp-browser-bridge' : 'freerdp-bridge-' + kind;
      const assets = join(root, 'release-assets', short, tag);
      await mkdir(assets, { recursive: true });
      for (const suffix of suffixes) {
        const name = '@freerdp-bridge/' + suffix,
          archive = 'freerdp-bridge-' + suffix + '-' + version + '.tgz';
        await json(join(scratch, 'package/package.json'), {
          name,
          version,
          repository: {
            type: 'git',
            url: 'git+https://github.com/' + repositoryFor(suffix) + '.git',
          },
        });
        const packed = spawnSync(
          'tar',
          ['-czf', join(assets, archive), '-C', scratch, 'package'],
          { windowsHide: true, timeout: 15000, maxBuffer: 65536 },
        );
        assert.equal(packed.status, 0);
        records.set(suffix, {
          name,
          version,
          archive,
          ...(await hashFile(assets, archive, 65536)),
        });
      }
    }
    await mkdir(join(authority, 'docs'), { recursive: true });
    const acceptance = 'docs/ACCEPTANCE.md';
    await writeFile(
      join(authority, acceptance),
      [...records.values()]
        .map(
          (item) =>
            `| \`${item.name}@${version}\` | ${item.bytes} | \`${item.sha256}\` |`,
        )
        .join('\n') + '\n',
    );
    git(authority, ['init', '--quiet']);
    git(authority, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(authority, ['add', '.']);
    git(authority, ['commit', '--quiet', '-m', 'Synthetic authority']);
    git(authority, ['tag', '-a', tag, '-m', 'Synthetic acceptance']);
    const upstream = git(authority, ['rev-parse', 'HEAD']);
    const catalog = {
      schema: 1,
      version,
      upstream,
      completed: true,
      remotePublished: false,
      repositories: [],
    };
    for (const kind of ['core', ...adapters]) {
      const short =
          kind === 'core' ? 'freerdp-browser-bridge' : 'freerdp-bridge-' + kind,
        repository = 'SensNyaha/' + short;
      const source = join(root, 'repositories', short);
      await mkdir(join(source, '.delivery'), { recursive: true });
      await writeFile(join(source, 'source.mjs'), '// synthetic source\n');
      const hash = await hashFile(source, 'source.mjs', 65536);
      const manifest = {
        schema: 1,
        kind,
        version,
        repository,
        upstream: { tag, commit: upstream, acceptance },
        packages: (kind === 'core' ? shared : [kind]).map((suffix) =>
          records.get(suffix),
        ),
        sources: [
          { path: 'source.mjs', bytes: hash.bytes, sha256: hash.sha256 },
        ],
      };
      await json(join(source, '.delivery/release.json'), manifest);
      git(source, ['init', '--quiet']);
      git(source, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      git(source, ['add', '.']);
      git(source, ['commit', '--quiet', '-m', 'Synthetic source']);
      git(source, ['tag', '-a', tag, '-m', 'Synthetic delivery']);
      git(source, [
        'remote',
        'add',
        'origin',
        'https://github.com/' + repository + '.git',
      ]);
      const assets = 'release-assets/' + short + '/' + tag;
      await copyFile(
        join(source, '.delivery/release.json'),
        join(root, assets, 'delivery-manifest.json'),
      );
      catalog.repositories.push({
        kind,
        repository,
        directory: 'repositories/' + short,
        assets,
        commit: git(source, ['rev-parse', 'HEAD']),
        packages: manifest.packages.map((item) => item.name),
        locallyVerified: true,
      });
    }
    const path = join(root, 'delivery-bundle.json');
    await json(path, catalog);
    assert.equal((await loadBundle(root, authority)).repositories.length, 5);
    for (const change of [
      (value) => (value.completed = false),
      (value) => (value.upstream = 'f'.repeat(40)),
      (value) => (value.repositories[0].directory = '../escape'),
      (value) => (value.repositories[1].repository = 'Another/repo'),
      (value) => (value.repositories[0].commit = 'e'.repeat(40)),
    ]) {
      const bad = structuredClone(catalog);
      change(bad);
      await json(path, bad);
      await assert.rejects(loadBundle(root, authority), (error) =>
        /^DELIVERY_BUNDLE_/.test(error.code),
      );
    }
    await json(path, catalog);
    const copied = join(
        root,
        catalog.repositories[0].assets,
        'delivery-manifest.json',
      ),
      original = await readFile(copied);
    await writeFile(copied, Buffer.concat([original, Buffer.from('\n')]));
    await assert.rejects(
      loadBundle(root, authority),
      (error) => error.code === 'DELIVERY_BUNDLE_MANIFEST_CHANGED',
    );
    await writeFile(copied, original);
    const different = structuredClone(catalog);
    different.repositories[0].packages.pop();
    await json(path, different);
    await assert.rejects(
      loadBundle(root, authority),
      (error) => error.code === 'DELIVERY_BUNDLE_COMMIT_INVALID',
    );
  } finally {
    const base = await realpath(tmpdir()),
      target = await realpath(root);
    assert.ok(
      target.startsWith(base + sep) &&
        target.split(sep).at(-1).startsWith('delivery-bundle-'),
    );
    await rm(target, { recursive: true, force: true });
  }
});
