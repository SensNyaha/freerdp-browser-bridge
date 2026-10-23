import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { continueDeliveryHistory } from '../../scripts/github-delivery/history.mjs';

const git = (root, args) => {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgSign=false',
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    },
  );
  assert.equal(result.status, 0, 'Local Git fixture failed');
  return result.stdout.trim();
};
test('continued delivery keeps public ancestry and old tags while staging the exact new tree including deletions', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'bridge-delivery-history-'));
  try {
    const origin = join(scratch, 'public'),
      destination = join(scratch, 'new');
    await mkdir(origin);
    await mkdir(destination);
    git(origin, ['init', '--quiet']);
    git(origin, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await writeFile(join(origin, 'README.md'), 'old source');
    await writeFile(join(origin, 'removed.md'), 'obsolete source');
    git(origin, ['add', '.']);
    git(origin, ['commit', '--quiet', '-m', 'public accepted 0.2.4']);
    git(origin, ['tag', '-a', 'v0.2.4', '-m', 'immutable old release']);
    const original = git(origin, ['rev-parse', 'HEAD']);
    const oldTag = git(origin, ['rev-parse', 'v0.2.4']);
    await writeFile(join(destination, 'README.md'), 'new accepted source');
    await writeFile(join(destination, 'new.md'), 'added source');
    const run = (args) => {
      if (args[0] === 'remote' && args[1] === 'add') {
        assert.equal(
          args[3],
          'https://github.com/SensNyaha/freerdp-browser-bridge.git',
        );
        args = [...args.slice(0, 3), origin];
      }
      return git(destination, args);
    };
    assert.equal(
      continueDeliveryHistory(
        destination,
        'SensNyaha/freerdp-browser-bridge',
        '0.2.5',
        { run },
      ),
      original,
    );
    assert.equal(
      await readFile(join(destination, 'README.md'), 'utf8'),
      'new accepted source',
    );
    git(destination, ['add', '--all', '.']);
    assert.deepEqual(git(destination, ['ls-files']).split(/\r?\n/), [
      'README.md',
      'new.md',
    ]);
    git(destination, ['commit', '--quiet', '-m', 'accepted 0.2.5']);
    assert.equal(git(destination, ['rev-parse', 'HEAD^']), original);
    assert.equal(git(origin, ['rev-parse', 'HEAD']), original);
    assert.equal(git(origin, ['rev-parse', 'v0.2.4']), oldTag);
    git(origin, [
      'tag',
      '-a',
      'v0.2.5',
      '-m',
      'existing release cannot be overwritten',
    ]);
    const blocked = join(scratch, 'blocked');
    await mkdir(blocked);
    await writeFile(join(blocked, 'source.md'), 'unchanged on refusal');
    assert.throws(
      () =>
        continueDeliveryHistory(
          blocked,
          'SensNyaha/freerdp-browser-bridge',
          '0.2.5',
          {
            run: (args) =>
              git(
                blocked,
                args[0] === 'remote' ? [...args.slice(0, 3), origin] : args,
              ),
          },
        ),
      /DELIVERY_HISTORY_TAG_ALREADY_EXISTS/,
    );
    assert.equal(
      await readFile(join(blocked, 'source.md'), 'utf8'),
      'unchanged on refusal',
    );
  } finally {
    assert.equal(dirname(scratch), resolve(tmpdir()));
    assert.match(basename(scratch), /^bridge-delivery-history-[A-Za-z0-9]+$/);
    await rm(scratch, { recursive: true, force: true });
  }
});
test('continued delivery refuses other owners/repositories and unsupported versions before touching Git', () => {
  for (const [repository, version] of [
    ['Other/freerdp-browser-bridge', '0.2.5'],
    ['SensNyaha/other', '0.2.5'],
    ['SensNyaha/freerdp-browser-bridge', '0.2.5-beta'],
  ])
    assert.throws(
      () =>
        continueDeliveryHistory('unused', repository, version, {
          run: () => assert.fail('Git must not run'),
        }),
      /DELIVERY_HISTORY_TARGET_INVALID/,
    );
});
