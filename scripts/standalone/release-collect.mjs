import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
  realpath,
  appendFile,
} from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, basename } from 'node:path';
import { hashFile } from '../github-delivery/manifest.mjs';
import { standaloneReleaseNames } from './release-artifacts.mjs';
import { standaloneUpgradeSeed } from './release-plan.mjs';

if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('STANDALONE_RELEASE_COLLECT_CONTEXT_REFUSED');
const report = JSON.parse(await readFile('build/standalone-ci.json', 'utf8'));
const accepted = JSON.parse(
  await readFile('build/standalone-installed.json', 'utf8'),
);
const platform = process.platform === 'win32' ? 'win32-x64' : 'linux-x64-gnu';
const seed = standaloneUpgradeSeed(report.version);
if (
  report.platform !== platform ||
  report.sourceCommit !== process.env.GITHUB_SHA ||
  accepted.version !== report.version ||
  accepted.acceptanceEnvironment !== 'github-hosted' ||
  accepted.nativeTls !== true ||
  accepted.nonRootService !== true ||
  accepted.crashRecovery !== true ||
  accepted.reinstallPreservesConfig !== true ||
  accepted.uninstall !== true ||
  accepted.retainedPublicConfig !== true ||
  accepted.upgradeToNewVersion !== Boolean(seed) ||
  (seed && accepted.previousVersion !== seed.version)
)
  throw new Error('STANDALONE_RELEASE_ACCEPTANCE_MISSING');
const build = await realpath('build');
const destination = resolve('build/standalone-release-assets');
await mkdir(destination);
const names = new Set(standaloneReleaseNames(report.version, platform));
const files = [];
for (const path of [
  report.output,
  report.portableArchive,
  report.sourceCompanion,
  ...(report.rpm ? [report.rpm] : []),
]) {
  const source = await realpath(path),
    part = relative(build, source),
    name = basename(source);
  if (
    !part ||
    part === '..' ||
    part.startsWith('..' + sep) ||
    isAbsolute(part) ||
    !names.delete(name)
  )
    throw new Error('STANDALONE_RELEASE_COLLECT_PATH_INVALID');
  await copyFile(source, resolve(destination, name), constants.COPYFILE_EXCL);
  files.push({ name, ...(await hashFile(destination, name, 536870912)) });
}
if (names.size) throw new Error('STANDALONE_RELEASE_COLLECT_SET_INVALID');
const receipt = {
  schema: 1,
  version: report.version,
  sourceCommit: report.sourceCommit,
  platform,
  files,
  acceptance: {
    portable: true,
    installed: true,
    realRdpDesktop: false,
    os: platform === 'win32-x64' ? 'windows-2025' : 'ubuntu-24.04',
    upgradeFrom: seed?.version ?? null,
  },
};
await writeFile(
  resolve(destination, 'standalone-' + platform + '.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    'directory=' + destination + '\n',
  );
console.log(
  JSON.stringify({
    version: report.version,
    platform,
    files: files.length,
    upgradeFrom: seed?.version ?? null,
  }),
);
