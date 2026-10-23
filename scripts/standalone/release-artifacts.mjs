import { hashFile, readJson } from '../github-delivery/manifest.mjs';
import { isDeepStrictEqual } from 'node:util';

const invalid = () => {
  throw new Error('STANDALONE_RELEASE_MANIFEST_INVALID');
};
export function standaloneReleaseNames(version, platform) {
  if (
    !/^0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(version ?? '') ||
    !['win32-x64', 'linux-x64-gnu'].includes(platform)
  )
    invalid();
  const prefix = 'freerdp-bridge-' + version;
  return platform === 'win32-x64'
    ? [
        prefix + '-win32-x64.msi',
        prefix + '-win32-x64.zip',
        prefix + '-corresponding-source-win32-x64.tar.gz',
      ]
    : [
        prefix + '-linux-x64-gnu.tar.gz',
        'freerdp-bridge_' + version + '_amd64.deb',
        prefix + '-1.x86_64.rpm',
        prefix + '-corresponding-source-linux-x64-gnu.tar.gz',
      ];
}
export function standaloneReleaseManifest(receipts) {
  if (
    !Array.isArray(receipts) ||
    receipts.length !== 2 ||
    receipts.some((receipt) => !receipt || typeof receipt !== 'object')
  )
    invalid();
  const { version, sourceCommit } = receipts[0];
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) invalid();
  const platforms = new Set(['win32-x64', 'linux-x64-gnu']);
  const files = [];
  const acceptance = [];
  for (const receipt of receipts) {
    if (
      receipt.schema !== 1 ||
      receipt.version !== version ||
      receipt.sourceCommit !== sourceCommit ||
      !platforms.delete(receipt.platform)
    )
      invalid();
    const names = new Set(standaloneReleaseNames(version, receipt.platform));
    if (!Array.isArray(receipt.files) || receipt.files.length !== names.size)
      invalid();
    for (const file of receipt.files) {
      if (
        !file ||
        !names.delete(file.name) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 1 ||
        file.bytes > 536870912 ||
        !/^[a-f0-9]{64}$/.test(file.sha256 ?? '') ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(file.integrity ?? '')
      )
        invalid();
      files.push({
        name: file.name,
        bytes: file.bytes,
        sha256: file.sha256,
        integrity: file.integrity,
      });
    }
    const accepted = receipt.acceptance;
    const patch = Number(version.split('.')[2]);
    if (
      !accepted ||
      Object.keys(accepted).sort().join(',') !==
        'installed,os,portable,realRdpDesktop,upgradeFrom' ||
      accepted.portable !== true ||
      accepted.installed !== true ||
      accepted.realRdpDesktop !== false ||
      accepted.os !==
        (receipt.platform === 'win32-x64' ? 'windows-2025' : 'ubuntu-24.04') ||
      accepted.upgradeFrom !== (patch >= 5 ? '0.2.' + (patch - 1) : null)
    )
      invalid();
    acceptance.push({ platform: receipt.platform, ...accepted });
  }
  if (platforms.size) invalid();
  return {
    schema: 1,
    version,
    sourceCommit,
    files: files.sort((a, b) => a.name.localeCompare(b.name, 'en')),
    acceptance: acceptance.sort((a, b) =>
      a.platform.localeCompare(b.platform, 'en'),
    ),
  };
}
export function parseStandaloneReleaseManifest(value) {
  if (
    !value ||
    value.schema !== 1 ||
    !Array.isArray(value.files) ||
    value.files.length !== 7 ||
    !Array.isArray(value.acceptance) ||
    value.acceptance.length !== 2
  )
    invalid();
  const receipts = ['win32-x64', 'linux-x64-gnu'].map((platform) => ({
    schema: 1,
    version: value.version,
    sourceCommit: value.sourceCommit,
    platform,
    files: value.files.filter((file) =>
      standaloneReleaseNames(value.version, platform).includes(file?.name),
    ),
    acceptance: Object.fromEntries(
      Object.entries(
        value.acceptance.find((item) => item?.platform === platform) ?? {},
      ).filter(([key]) => key !== 'platform'),
    ),
  }));
  const parsed = standaloneReleaseManifest(receipts);
  if (!isDeepStrictEqual(value, parsed)) invalid();
  return parsed;
}
export async function verifyStandaloneReleaseFiles(root, manifest) {
  for (const file of manifest.files) {
    const actual = await hashFile(root, file.name, 536870912);
    if (
      actual.bytes !== file.bytes ||
      actual.sha256 !== file.sha256 ||
      actual.integrity !== file.integrity
    )
      invalid();
  }
}
export async function readStandaloneReleaseReceipts(root) {
  const receipts = [];
  for (const platform of ['win32-x64', 'linux-x64-gnu'])
    receipts.push(
      await readJson(root, 'standalone-' + platform + '.json', 65536),
    );
  const manifest = standaloneReleaseManifest(receipts);
  await verifyStandaloneReleaseFiles(root, manifest);
  return manifest;
}
