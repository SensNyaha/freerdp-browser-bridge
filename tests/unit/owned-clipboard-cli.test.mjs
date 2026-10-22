import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

test('viewer and Clipboard CLI reject selection before requiring built runtime modules', async () => {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(resolve('build/viewer-cli-bootstrap-'));
  try {
    await mkdir(join(root, 'scripts'));
    for (const name of [
      'test-xrdp-viewer.mjs',
      'test-windows-browser-clipboard.mjs',
      'viewer-worker-options.mjs',
      'viewer-lab-files.mjs',
      'viewer-media-options.mjs',
      'resource-lab-profile.mjs',
    ])
      await copyFile(join('scripts', name), join(root, 'scripts', name));
    const fingerprint = 'sha256:' + 'a'.repeat(64);
    const receipt = 'build/native-clean-unavailable/receipt.json';
    for (const [script, args, profile, refusal] of [
      [
        'test-xrdp-viewer.mjs',
        [fingerprint, 'jpeg', '--owned-pointer-test', receipt],
        'owned-unicode-container',
        /LAB_OWNED_TARGET_REFUSED/,
      ],
      [
        'test-xrdp-viewer.mjs',
        [fingerprint, 'jpeg', '--resize-test', receipt],
        'owned-container',
        /LAB_NATIVE_PROFILE_INVALID|LAB_NATIVE_PROFILE_UNSUPPORTED/,
      ],
      [
        'test-windows-browser-clipboard.mjs',
        [fingerprint, receipt, '--owned-clipboard-roundtrip'],
        'owned-container',
        /Use the approved fingerprint and linked native receipt/,
      ],
      [
        'test-windows-browser-clipboard.mjs',
        [fingerprint, receipt, '--focus-editor', '--owned-clipboard-roundtrip'],
        'owned-unicode-container',
        /Use the approved fingerprint and linked native receipt|LAB_NATIVE_PROFILE_INVALID/,
      ],
    ]) {
      const result = spawnSync(
        process.execPath,
        [join('scripts', script), ...args],
        {
          cwd: root,
          env: { ...process.env, BRIDGE_LAB_PROFILE: profile },
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 65536,
          windowsHide: true,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, refusal);
      assert.doesNotMatch(
        result.stderr,
        /ERR_MODULE_NOT_FOUND|Server listening/,
      );
      assert.deepEqual(await readdir(root), ['scripts']);
    }
  } finally {
    assert.equal(dirname(root), resolve('build'));
    await rm(root, { recursive: true, force: true });
  }
});

function invoke(flags, owned) {
  const env = { ...process.env };
  delete env.BRIDGE_LAB_PROFILE;
  if (owned)
    env.BRIDGE_LAB_PROFILE =
      typeof owned === 'string' ? owned : 'owned-container';
  const result = spawnSync(
    process.execPath,
    [
      resolve('scripts/test-windows-browser-clipboard.mjs'),
      'sha256:' + 'a'.repeat(64),
      'build/native-clean-unavailable/receipt.json',
      ...flags,
    ],
    { env, encoding: 'utf8', timeout: 5000, windowsHide: true },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  return result.stderr;
}

test('owned setup refuses arbitrary arguments before file checks or Docker access', () => {
  for (const args of [
    ['--unicode-server', 'extra'],
    ['--port', '3392'],
    ['--host=example.invalid'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/start-owned-xrdp-lab.mjs'), ...args],
      {
        env: { ...process.env, PATH: '' },
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'OWNED_LAB_ARGUMENTS_REFUSED');
  }
});

test(
  'Unicode viewer refuses legacy-container X11 observers before native receipt or target access',
  { skip: process.platform !== 'win32' },
  () => {
    for (const flag of [
      '--owned-pointer-test',
      '--owned-held-loss-test',
      '--owned-recovery-test',
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          resolve('scripts/test-xrdp-viewer.mjs'),
          'sha256:' + 'a'.repeat(64),
          'jpeg',
          flag,
          'build/native-clean-unavailable/receipt.json',
        ],
        {
          env: {
            ...process.env,
            BRIDGE_LAB_PROFILE: 'owned-unicode-container',
          },
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /LAB_OWNED_TARGET_REFUSED/);
    }
  },
);

test(
  'owned Clipboard roundtrip refuses the external profile and a missing prepared-editor selection before native/credential access',
  { skip: process.platform !== 'win32' },
  () => {
    for (const [flags, owned] of [
      [['--focus-editor', '--owned-clipboard-roundtrip'], false],
      [['--owned-clipboard-roundtrip'], true],
    ]) {
      assert.match(
        invoke(flags, owned),
        /Use the approved fingerprint and linked native receipt/,
      );
    }
  },
);

test(
  'Unicode owned Clipboard roundtrip uses its own explicit profile before receipt/credential access',
  { skip: process.platform !== 'win32' },
  () => {
    assert.match(
      invoke(
        ['--focus-editor', '--owned-clipboard-roundtrip'],
        'owned-unicode-container',
      ),
      /LAB_NATIVE_PROFILE_INVALID/,
    );
  },
);

test(
  'owned Clipboard roundtrip refuses conflicting lab scenarios before selecting the native receipt',
  { skip: process.platform !== 'win32' },
  () => {
    for (const flag of [
      '--pointer-smoke',
      '--owned-clipboard-read',
      '--keyboard-smoke',
      '--mvp-soak',
    ]) {
      assert.match(
        invoke(['--focus-editor', '--owned-clipboard-roundtrip', flag], true),
        /Use the approved fingerprint and linked native receipt/,
      );
    }
  },
);

test(
  'valid owned Clipboard roundtrip reaches receipt validation without reading credentials or acquiring a listener',
  { skip: process.platform !== 'win32' },
  () => {
    assert.match(
      invoke(['--focus-editor', '--owned-clipboard-roundtrip'], true),
      /LAB_NATIVE_PROFILE_INVALID/,
    );
  },
);
