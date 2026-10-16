import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const lock = JSON.parse(readFileSync(resolve('native/dependencies.json')));
const suppliedPaths = process.argv.slice(2);
if (suppliedPaths.length !== 0 && suppliedPaths.length !== 3)
  throw new Error(
    'Supply cache, installed SDK and output report paths together',
  );
const [cachePath, installedPrefix, reportPath] = suppliedPaths.length
  ? suppliedPaths.map((value) => resolve(value))
  : [
      resolve('build/freerdp-local/CMakeCache.txt'),
      resolve('.deps/freerdp-install'),
      resolve('build/native-features.json'),
    ];
const entries = readFileSync(cachePath, 'utf8')
  .split('\n')
  .flatMap((line) => {
    const match = /^([^#/:]+):[^=]+=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim()]] : [];
  });
const cache = new Map(entries);
const installedConfig = readFileSync(
  resolve(installedPrefix, 'include/freerdp3/freerdp/config.h'),
  'utf8',
);
const gfxH264 = /^#define WITH_GFX_H264\b/m.test(installedConfig);
if (cache.get('WITH_OPENH264') === 'ON' && !gfxH264)
  throw new Error('Installed FreeRDP headers do not match the decoder build');
const enabledChannels = entries
  .filter(([key, value]) => /^CHANNEL_.+_CLIENT$/.test(key) && value === 'ON')
  .map(([key]) => key.slice(8, -7).toLowerCase())
  .sort();
const dependencies = {};
const triplet =
  process.platform === 'win32' ? 'x64-windows-bundled' : 'x64-linux-bundled';
const status = readFileSync(
  resolve('.deps/installed/vcpkg/status'),
  'utf8',
).replace(/\r\n/g, '\n');
for (const name of [
  'zlib',
  'openssl',
  'libusb',
  'libjpeg-turbo',
  'libspng',
  'openh264',
  'opus',
  ...(process.platform === 'linux'
    ? ['krb5', 'icu', 'cups', 'libfuse', 'numactl', 'eudev']
    : []),
]) {
  const block = status
    .split(/\r?\n\r?\n/)
    .find(
      (section) =>
        section.includes(`Package: ${name}\n`) &&
        section.includes(`Architecture: ${triplet}\n`) &&
        section.includes('Status: install ok installed'),
    );
  const version = block && /^Version: (.+)$/m.exec(block)?.[1].trim();
  if (!version)
    throw new Error(`Missing installed dependency receipt: ${name}`);
  dependencies[name] = version;
}
if (dependencies.opus !== lock.opus.version)
  throw new Error('Installed Opus receipt does not match the pinned version');
if (process.platform === 'linux' && dependencies.cups !== lock.cups.version)
  throw new Error('Installed CUPS receipt does not match the pinned version');
if (process.platform === 'linux' && dependencies.eudev !== lock.eudev.version)
  throw new Error('Installed eudev receipt does not match the pinned version');
const opusPort = readFileSync(
  resolve('native/vcpkg/ports/opus/portfile.cmake'),
  'utf8',
);
if (!opusPort.includes(`SHA512 ${lock.opus.sourceSha512}`))
  throw new Error('Opus port source hash does not match the dependency lock');
if (process.platform === 'linux') {
  const eudevPort = readFileSync(
    resolve('native/vcpkg/ports/eudev/portfile.cmake'),
    'utf8',
  );
  if (
    !eudevPort.includes(`REF ${lock.eudev.commit}`) ||
    !eudevPort.includes(`SHA512 ${lock.eudev.sourceSha512}`)
  )
    throw new Error('eudev port source does not match the dependency lock');
  const cupsPort = readFileSync(
    resolve('native/vcpkg/ports/cups/portfile.cmake'),
    'utf8',
  );
  if (
    !cupsPort.includes(`REF ${lock.cups.commit}`) ||
    !cupsPort.includes(`SHA512 ${lock.cups.sourceSha512}`)
  )
    throw new Error('CUPS port source does not match the dependency lock');
}
const report = {
  enabledChannels,
  codecProviders: ['libjpeg-turbo', 'openh264', 'libopus'],
  portOverlays: {
    ...(process.platform === 'linux'
      ? {
          eudev: {
            sourceCommit: lock.eudev.commit,
            portfileSha256: createHash('sha256')
              .update(
                readFileSync(
                  resolve('native/vcpkg/ports/eudev/portfile.cmake'),
                ),
              )
              .digest('hex'),
          },
          cups: {
            sourceCommit: lock.cups.commit,
            localQueuesPatchSha256: createHash('sha256')
              .update(
                readFileSync(
                  resolve(
                    'native/vcpkg/ports/cups/001-local-queues-without-dnssd.patch',
                  ),
                ),
              )
              .digest('hex'),
          },
        }
      : {}),
    libusb: {
      basePort: '1.0.30',
      portfileSha256: createHash('sha256')
        .update(
          readFileSync(resolve('native/vcpkg/ports/libusb/portfile.cmake')),
        )
        .digest('hex'),
    },
    opus: {
      basePort: '1.6.1',
      versionPatchSha256: createHash('sha256')
        .update(
          readFileSync(
            resolve('native/vcpkg/ports/opus/001-pinned-package-version.patch'),
          ),
        )
        .digest('hex'),
    },
    openh264: {
      basePort: '2.6.0#4',
      nasmPatchSha256: createHash('sha256')
        .update(
          readFileSync(
            resolve(
              'native/vcpkg/ports/openh264/002-relative-windows-nasm-includes.patch',
            ),
          ),
        )
        .digest('hex'),
      simdPatchSha256: createHash('sha256')
        .update(
          readFileSync(
            resolve(
              'native/vcpkg/ports/openh264/003-enable-windows-x86-simd.patch',
            ),
          ),
        )
        .digest('hex'),
    },
  },
  dependencies,
  freeRdpSourceCommit: lock.freerdp.commit,
  vcpkgCommit: lock.vcpkg.commit,
  diagnostics: {
    ffmpeg: cache.get('WITH_FFMPEG') === 'ON',
    openH264: cache.get('WITH_OPENH264') === 'ON',
    gfxH264,
    openH264DynamicLoading: cache.get('WITH_OPENH264_LOADING') === 'ON',
    absolutePluginPaths: cache.get('WITH_ABSOLUTE_PLUGIN_LOAD_PATHS') === 'ON',
  },
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
