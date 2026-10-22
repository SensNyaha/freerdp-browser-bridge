import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nativeSourcePlan,
  readNativeSourceFile,
  copyNativePackageSources,
} from '../../scripts/native-package-sources.mjs';

const checksum =
  '3251c9f41e900efa13caf981483f46886c8434bf4c30f3fd3073921b06be9977cebcf4a18f7bc46db86e33d7f19752296377be9050abfb8d887ffeb377864647';
const fixture = () => ({
  packages: [
    { SPDXID: 'SPDXRef-port', name: 'libusb', versionInfo: '1.0.30' },
    {
      SPDXID: 'SPDXRef-resource-0',
      name: 'libusb/libusb',
      downloadLocation: 'git+https://github.com/libusb/libusb@v1.0.30',
      checksums: [{ algorithm: 'SHA512', checksumValue: checksum }],
    },
  ],
  files: ['portfile.cmake', 'vcpkg.json'].map((name, index) => ({
    SPDXID: 'SPDXRef-port-file-' + index,
    fileName: './' + name,
    checksums: [{ algorithm: 'SHA256', checksumValue: 'a'.repeat(64) }],
  })),
});
const refusal = { message: 'NATIVE_SOURCE_COMPANION_INVALID' };

test('native source companions bind upstream archives and all build recipes to the dependency SBOM', () => {
  const sbom = fixture();
  sbom.files.push({
    SPDXID: 'SPDXRef-port-file-2',
    fileName: './fix.patch',
    checksums: [{ algorithm: 'SHA256', checksumValue: 'b'.repeat(64) }],
  });
  const plan = nativeSourcePlan('libusb', sbom);
  assert.equal(plan.sha512, checksum);
  assert.deepEqual(
    plan.recipes.map((item) => item.path),
    ['portfile.cmake', 'vcpkg.json', 'fix.patch'],
  );
  for (const mutate of [
    (value) => (value.packages[0].versionInfo = '1.0.29'),
    (value) => (value.packages[1].checksums[0].checksumValue = '0'.repeat(128)),
    (value) => (value.packages[1].downloadLocation += '-foreign'),
    (value) => value.packages.push(value.packages[1]),
    (value) => (value.files[0].fileName = './../outside.cmake'),
    (value) => (value.files[0].fileName = './a/../../outside.cmake'),
    (value) => (value.files[0].fileName = './C:/outside.cmake'),
    (value) => value.files.push(value.files[0]),
    (value) => (value.files[0].checksums[0].algorithm = 'MD5'),
    (value) => (value.files[0].checksums[0] = null),
    (value) => (value.packages[1].checksums[0] = null),
    (value) => (value.files[0].checksums[0].checksumValue = 'invalid'),
    (value) => (value.files[0].SPDXID = 'SPDXRef-binary-file-0'),
    (value) => (value.files = Array(4097).fill({})),
    (value) => (value.packages = Array(65).fill({})),
    (value) => value.files.push(null),
  ]) {
    const invalid = fixture();
    mutate(invalid);
    assert.throws(() => nativeSourcePlan('libusb', invalid), refusal);
  }
  assert.throws(() => nativeSourcePlan('foreign', fixture()), refusal);
  assert.throws(() => nativeSourcePlan('toString', fixture()), refusal);
});

test('native source reads reject escape, directories and oversized files before content allocation', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'rdp-source-bounds-'));
  try {
    const root = join(scratch, 'root');
    await mkdir(root);
    const inside = join(root, 'archive.tar.gz');
    const outside = join(scratch, 'outside');
    await writeFile(inside, 'bounded');
    await writeFile(outside, 'outside');
    assert.equal(
      (await readNativeSourceFile(root, inside, 7)).toString(),
      'bounded',
    );
    await assert.rejects(readNativeSourceFile(root, inside, 6), refusal);
    await assert.rejects(readNativeSourceFile(root, outside, 7), refusal);
    await assert.rejects(readNativeSourceFile(root, root, 7), refusal);
    await assert.rejects(readNativeSourceFile(root, inside, Infinity), refusal);
    if (process.platform !== 'win32') {
      await symlink('archive.tar.gz', join(root, 'link'));
      await assert.rejects(
        readNativeSourceFile(root, join(root, 'link'), 7),
        refusal,
      );
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('native source packaging refuses a corrupt cached archive without copying its contents', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'rdp-source-integrity-'));
  try {
    const stage = join(scratch, 'stage');
    const destination = join(scratch, 'package');
    const sbom = join(stage, 'share/freerdp-bridge/sbom/vcpkg');
    const cache = join(scratch, '.tools/vcpkg-downloads');
    await mkdir(sbom, { recursive: true });
    await mkdir(cache, { recursive: true });
    await mkdir(destination);
    await writeFile(join(sbom, 'libusb.spdx.json'), JSON.stringify(fixture()));
    await writeFile(
      join(cache, 'libusb-libusb-v1.0.30.tar.gz'),
      'corrupt archive',
    );
    await assert.rejects(
      copyNativePackageSources({
        project: scratch,
        stage,
        destination,
        platform: 'win32',
      }),
      refusal,
    );
    assert.deepEqual(
      await readdir(join(destination, 'corresponding-source')),
      [],
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
