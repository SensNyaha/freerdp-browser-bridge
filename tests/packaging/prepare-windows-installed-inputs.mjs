// Public inputs only. No installer execution, credentials or privileged action.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, lstat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { standaloneGithubApi } from '../../scripts/standalone/release-api.mjs';
import {
  windowsInstalledRelease,
  windowsInstalledVersion,
} from '../fixtures/windows-installed-full-inputs.mjs';
import { downloadWindowsInstalledMsi } from '../fixtures/windows-installed-full-download.mjs';

try {
  assert.equal(process.argv.length, 4);
  assert.equal(process.argv[2], '--published-version');
  const version = windowsInstalledVersion(process.argv[3]);
  const build = await realpath(resolve('build'));
  const pointer = join(build, 'windows-installed-inputs.json');
  await assert.rejects(lstat(pointer), { code: 'ENOENT' });
  const api = standaloneGithubApi(undefined);
  const release = windowsInstalledRelease(
    await api(
      '/repos/SensNyaha/freerdp-browser-bridge/releases/tags/v' + version,
    ),
    version,
  );
  const ref = await api(
    '/repos/SensNyaha/freerdp-browser-bridge/git/ref/tags/v' + version,
  );
  assert.equal(ref?.object?.type, 'tag');
  assert.match(ref.object.sha, /^[0-9a-f]{40}$/);
  const tag = await api(
    '/repos/SensNyaha/freerdp-browser-bridge/git/tags/' + ref.object.sha,
  );
  assert.equal(tag?.tag, 'v' + version);
  assert.equal(tag?.object?.type, 'commit');
  assert.match(tag.object.sha, /^[0-9a-f]{40}$/);
  const directory = await mkdtemp(join(build, 'windows-installed-inputs-'));
  const output = await downloadWindowsInstalledMsi(release, directory);
  await writeFile(
    pointer,
    JSON.stringify(
      {
        schema: 1,
        ...release,
        output,
        tagObject: ref.object.sha,
        sourceCommit: tag.object.sha,
        publicStableRelease: true,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: 'public-windows-msi-input-verified',
      version,
      bytes: release.bytes,
      sha256: release.sha256,
      sourceCommit: tag.object.sha,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      event: 'public-windows-msi-input-refused',
      code: /^OWNED_INSTALLED_[A-Z_]+$/.test(error?.message ?? '')
        ? error.message
        : 'OWNED_INSTALLED_PREPARE_FAILED',
    }),
  );
  process.exitCode = 1;
}
