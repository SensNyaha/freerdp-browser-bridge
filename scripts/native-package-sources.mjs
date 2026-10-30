import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';

// These are corresponding-source inputs, not consumer installation commands.
const sources = {
  libusb: {
    version: '1.0.30',
    name: 'libusb/libusb',
    ref: 'v1.0.30',
    archive: 'libusb-libusb-v1.0.30.tar.gz',
    sha512:
      '3251c9f41e900efa13caf981483f46886c8434bf4c30f3fd3073921b06be9977cebcf4a18f7bc46db86e33d7f19752296377be9050abfb8d887ffeb377864647',
  },
  eudev: {
    version: '3.2.14',
    name: 'eudev-project/eudev',
    ref: '9e7c4e744b9e7813af9acee64b5e8549ea1fbaa3',
    archive:
      'eudev-project-eudev-9e7c4e744b9e7813af9acee64b5e8549ea1fbaa3.tar.gz',
    sha512:
      '343b29a8db9ce2e1d136fe3049f2ad492ebd96804eca149e0fadc88a2e92b7fa0dd57c1ce4cb13d9d184d76cee06bcaa69f064b0c90d0cf99a322941944a7678',
  },
  libfuse: {
    version: '3.18.3',
    portVersion: '3.18.3#1',
    name: 'libfuse/libfuse',
    ref: 'fuse-3.18.3',
    archive: 'libfuse-libfuse-fuse-3.18.3.tar.gz',
    sha512:
      '48b4d1c68d9e82377d2e854cfc3be1b437fe72acd09a4970b5692ac1d5808162db77524f495924d2e369243446aa496bdc9d2a87246fa677c15bf115434e6540',
  },
  numactl: {
    version: '2.0.19',
    portVersion: '2.0.19#3',
    name: 'numactl/numactl',
    ref: 'v2.0.19',
    archive: 'numactl-numactl-v2.0.19.tar.gz',
    sha512:
      'a9aa93bdc6333b620c10ff3573d6ff645ab54beece75e67be8cdddb27d062cc56cea34db342005a171877f85f05eb1d24e43f8466be907ba3b7c8b1f897cd954',
  },
};
const fail = () => {
  throw new Error('NATIVE_SOURCE_COMPANION_INVALID');
};
const hash = (bytes, algorithm) =>
  createHash(algorithm).update(bytes).digest('hex');
const inside = (root, file) => {
  const part = relative(root, file);
  return (
    part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part)
  );
};

export function nativeSourcePlan(component, sbom) {
  if (typeof component !== 'string' || !Object.hasOwn(sources, component))
    fail();
  const source = sources[component];
  if (
    !source ||
    !Array.isArray(sbom?.packages) ||
    sbom.packages.length > 64 ||
    !Array.isArray(sbom.files) ||
    sbom.files.length > 4096 ||
    [...sbom.packages, ...sbom.files].some(
      (item) => !item || typeof item !== 'object' || Array.isArray(item),
    )
  )
    fail();
  const port = sbom.packages.filter((item) => item.SPDXID === 'SPDXRef-port');
  const resource = sbom.packages.filter(
    (item) => item.name === source.name && item.SPDXID === 'SPDXRef-resource-0',
  );
  if (
    port.length !== 1 ||
    port[0].versionInfo !== (source.portVersion ?? source.version) ||
    resource.length !== 1 ||
    resource[0].downloadLocation !==
      'git+https://github.com/' + source.name + '@' + source.ref ||
    !Array.isArray(resource[0].checksums) ||
    resource[0].checksums.length !== 1 ||
    resource[0].checksums[0]?.algorithm !== 'SHA512' ||
    resource[0].checksums[0]?.checksumValue !== source.sha512
  )
    fail();
  const recipes = sbom.files.filter((item) =>
    /^SPDXRef-port-file-[0-9]+$/.test(item.SPDXID ?? ''),
  );
  if (recipes.length < 2 || recipes.length > 64) fail();
  const seen = new Set();
  const files = recipes.map((item) => {
    if (
      typeof item.fileName !== 'string' ||
      !/^\.\/(?:[A-Za-z0-9_+-][A-Za-z0-9_.+-]*\/){0,7}[A-Za-z0-9_+-][A-Za-z0-9_.+-]*$/.test(
        item.fileName,
      ) ||
      !Array.isArray(item.checksums) ||
      item.checksums.length !== 1 ||
      item.checksums[0]?.algorithm !== 'SHA256' ||
      !/^[a-f0-9]{64}$/.test(item.checksums[0]?.checksumValue)
    )
      fail();
    const path = item.fileName.slice(2);
    if (seen.has(path)) fail();
    seen.add(path);
    return { path, sha256: item.checksums[0].checksumValue };
  });
  if (!seen.has('portfile.cmake') || !seen.has('vcpkg.json')) fail();
  return { component, ...source, recipes: files };
}

export function nativeSourceComponents(platform) {
  if (!['linux', 'win32'].includes(platform)) fail();
  return platform === 'linux' ? Object.keys(sources) : ['libusb'];
}

export async function readNativeSourceFile(root, file, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 8388608)
    fail();
  const canonicalRoot = await realpath(root);
  const canonical = await realpath(file);
  if (!inside(canonicalRoot, canonical) || (await lstat(file)).isSymbolicLink())
    fail();
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maximum) fail();
    const bytes = Buffer.alloc(before.size + 1);
    const result = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (
      result.bytesRead !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      fail();
    return bytes.subarray(0, before.size);
  } finally {
    await handle.close();
  }
}

export async function copyNativePackageSources({
  project,
  stage,
  destination,
  platform,
}) {
  const selected = nativeSourceComponents(platform);
  const output = join(destination, 'corresponding-source');
  await mkdir(output); // A fresh package only: never overwrite previous sources.
  const report = [];
  const buildFiles = [];
  let total = 0;
  for (const component of selected) {
    const sbom = JSON.parse(
      (
        await readNativeSourceFile(
          stage,
          join(
            stage,
            'share/freerdp-bridge/sbom/vcpkg',
            component + '.spdx.json',
          ),
          1048576,
        )
      ).toString('utf8'),
    );
    const plan = nativeSourcePlan(component, sbom);
    const cache = join(project, '.tools/vcpkg-downloads');
    const archive = await readNativeSourceFile(
      cache,
      join(cache, plan.archive),
      8388608,
    );
    if (hash(archive, 'sha512') !== plan.sha512) fail();
    if ((total += archive.length) > 16777216) fail();
    await writeFile(join(output, plan.archive), archive, { flag: 'wx' });
    for (const recipe of plan.recipes) {
      let bytes;
      for (const candidate of [
        join(stage, 'share/freerdp-bridge/ports', component),
        join(project, 'native/vcpkg/ports', component),
        join(project, '.deps/vcpkg/ports', component),
      ]) {
        let data;
        try {
          data = await readNativeSourceFile(
            candidate,
            join(candidate, recipe.path),
            1048576,
          );
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        // Windows checkout conversion is accepted only if the resulting bytes
        // exactly match the recipe recorded by the actual dependency build.
        if (hash(data, 'sha256') !== recipe.sha256)
          data = Buffer.from(data.toString('utf8').replaceAll('\r\n', '\n'));
        if (hash(data, 'sha256') === recipe.sha256) {
          bytes = data;
          break;
        }
      }
      if (!bytes || (total += bytes.length) > 16777216) fail();
      const file = join(output, component, recipe.path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, bytes, { flag: 'wx' });
    }
    report.push(plan);
  }
  for (const name of platform === 'linux'
    ? ['x64-linux-bundled.cmake']
    : ['x64-windows-bundled.cmake', 'bridge-msvc-env.cmake']) {
    const root = join(project, 'native/vcpkg/triplets');
    const bytes = await readNativeSourceFile(root, join(root, name), 1048576);
    if ((total += bytes.length) > 16777216) fail();
    await mkdir(join(output, 'triplets'), { recursive: true });
    await writeFile(join(output, 'triplets', name), bytes, { flag: 'wx' });
    buildFiles.push({
      path: 'triplets/' + name,
      sha256: hash(bytes, 'sha256'),
    });
  }
  await writeFile(
    join(output, 'manifest.json'),
    JSON.stringify({ schema: 1, components: report, buildFiles }, null, 2) +
      '\n',
    { flag: 'wx' },
  );
  await writeFile(
    join(output, 'README.md'),
    '# Corresponding source for bundled LGPL libraries\n\n' +
      'This directory accompanies the native binaries in the same npm tarball. ' +
      'It contains the complete upstream source archives and the exact port ' +
      'recipes/patches recorded by their dependency build SBOMs. Sources retain ' +
      'their upstream licenses; they are not relicensed under the bridge MIT license. ' +
      'manifest.json identifies source revisions, SHA-512 archives and SHA-256 recipes.\n\n' +
      'Extract an archive, read its licensing/build instructions, and apply the ' +
      'patches in the corresponding portfile.cmake in their listed order. The ' +
      'recipes use vcpkg commit 2750401336fb7c95f6619657a46a7e798661341c ' +
      '(https://github.com/microsoft/vcpkg/tree/2750401336fb7c95f6619657a46a7e798661341c). ' +
      'Use the provided triplets/ with --overlay-triplets and component recipe ' +
      'directories with --overlay-ports. The Linux libusb build enables its udev ' +
      'feature and uses the provided private eudev recipe. Generic vcpkg, compiler, ' +
      'CMake, Make, Meson, Ninja and autotools remain external build tools. ' +
      'Build tools are only needed to rebuild/modify sources, never to install the ' +
      'ready runtime. The packaged libraries are dynamically linked.\n\n' +
      'To use a modified compatible library, prepare your own private native stage ' +
      'with the same ABI and helpers. Configure the bridge workerPath/runtimeRoot ' +
      'explicitly, or regenerate runtime-manifest.json hashes for your own complete ' +
      'runtime package. Do not disable certificate verification or IPC pairing. ' +
      'The integrity inventory is editable deployment metadata, not a restriction ' +
      'on modifying or debugging LGPL libraries. No installation script extracts ' +
      'or executes these source archives.\n',
    { flag: 'wx' },
  );
  return { sourceComponents: report.length, sourceBytes: total };
}
