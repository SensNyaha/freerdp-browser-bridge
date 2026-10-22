import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const maximumReadmeBytes = 65536;
const requiredSections = [
  'Purpose',
  'Installation',
  'Requirements',
  'Usage',
  'Limitations',
  'License',
];
const refuse = () => {
  throw new Error('NPM_README_INVALID');
};

export function validateNpmReadme(readme, name) {
  if (
    typeof name !== 'string' ||
    !name ||
    typeof readme !== 'string' ||
    Buffer.byteLength(readme, 'utf8') > maximumReadmeBytes ||
    !readme.startsWith('# ') ||
    !readme.includes(name) ||
    !readme.includes('```') ||
    requiredSections.some(
      (section) => !new RegExp('^## ' + section + '\\r?$', 'm').test(readme),
    )
  )
    refuse();
  return { name, readmeBytes: Buffer.byteLength(readme, 'utf8') };
}

export async function readNpmDocumentation(file) {
  if ((await lstat(file)).isSymbolicLink()) refuse();
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > maximumReadmeBytes)
      refuse();
    const buffer = Buffer.alloc(maximumReadmeBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== info.size) refuse();
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

export async function checkNpmDirectoryReadme(directory) {
  const manifest = JSON.parse(
    await readNpmDocumentation(join(directory, 'package.json')),
  );
  return validateNpmReadme(
    await readNpmDocumentation(join(directory, 'README.md')),
    manifest.name,
  );
}

// Check the shipped root README, not only a source file or a nested notice.
export async function checkNpmArchiveReadme(archive) {
  const info = await lstat(archive);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size < 1 ||
    info.size > 128 * 1024 * 1024
  )
    refuse();
  const extract = (member) => {
    const result = spawnSync('tar', ['-xOf', archive, 'package/' + member], {
      encoding: 'utf8',
      maxBuffer: maximumReadmeBytes,
      timeout: 10000,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) refuse();
    return result.stdout;
  };
  const manifest = JSON.parse(extract('package.json'));
  return validateNpmReadme(extract('README.md'), manifest.name);
}
