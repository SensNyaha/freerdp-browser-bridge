import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lock = JSON.parse(readFileSync(resolve('native/dependencies.json')));
const entries = readFileSync(
  resolve('build/freerdp-local/CMakeCache.txt'),
  'utf8',
)
  .split('\n')
  .flatMap((line) => {
    const match = /^([^#/:]+):[^=]+=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim()]] : [];
  });
const cache = new Map(entries);
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
for (const name of ['zlib', 'openssl', 'libusb', 'libjpeg-turbo', 'libspng']) {
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
const report = {
  enabledChannels,
  codecProviders: ['libjpeg-turbo'],
  dependencies,
  freeRdpSourceCommit: lock.freerdp.commit,
  vcpkgCommit: lock.vcpkg.commit,
  diagnostics: {
    ffmpeg: cache.get('WITH_FFMPEG') === 'ON',
    openH264: cache.get('WITH_OPENH264') === 'ON',
    absolutePluginPaths: cache.get('WITH_ABSOLUTE_PLUGIN_LOAD_PATHS') === 'ON',
  },
};
writeFileSync(
  resolve('build/native-features.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
