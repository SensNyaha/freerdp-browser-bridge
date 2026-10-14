import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

const systemRuntime = new Set([
  'linux-vdso.so.1',
  'ld-linux-x86-64.so.2',
  'libc.so.6',
  'libm.so.6',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libresolv.so.2',
  'libstdc++.so.6',
  'libgcc_s.so.1',
]);
const invalidReport = () =>
  new Error('Invalid Linux runtime dependency report');
const outsideBundle = () =>
  new Error('Linux runtime has an external non-CRT dependency');

export function parseLddReport(report) {
  if (typeof report !== 'string' || Buffer.byteLength(report) > 65536)
    throw invalidReport();
  const lines = report.trim().split(/\r?\n/);
  if (lines.length > 128) throw invalidReport();
  const names = new Set();
  return lines.map((line) => {
    const value = line.trim();
    const mapped = /^(\S+)\s+=>\s+(.+?)\s+\(0x[0-9a-fA-F]+\)$/.exec(value);
    const direct = /^(.+?)\s+\(0x[0-9a-fA-F]+\)$/.exec(value);
    const name = mapped?.[1] ?? (direct && basename(direct[1]));
    const path = mapped?.[2] ?? direct?.[1];
    if (
      !name ||
      !/^[A-Za-z0-9_.+-]{1,128}$/.test(name) ||
      names.has(name) ||
      !path ||
      (name !== 'linux-vdso.so.1' && !isAbsolute(path))
    )
      throw invalidReport();
    names.add(name);
    return { name, path };
  });
}

function inside(root, path) {
  const part = relative(root, path);
  return (
    part !== '' &&
    !isAbsolute(part) &&
    part !== '..' &&
    !part.startsWith('..' + sep)
  );
}

export function assertPrivateLddReport(report, directory, dynamicReport) {
  const root = realpathSync(directory);
  // glibc ldd calls ICU's data-only DSO "statically linked". Accept that case
  // only with a matching dynamic/SONAME report proving there are no imports.
  if (typeof report === 'string' && report.trim() === 'statically linked') {
    if (
      typeof dynamicReport === 'string' &&
      Buffer.byteLength(dynamicReport) <= 65536 &&
      dynamicReport.split(/\r?\n/).length <= 128 &&
      /^Dynamic section .+ contains [0-9]+ entries:/m.test(dynamicReport) &&
      /\(SONAME\)\s+Library soname: \[lib[A-Za-z0-9_.+-]+\.so(?:\.[A-Za-z0-9_.+-]+)?\]/.test(
        dynamicReport,
      ) &&
      !/\(NEEDED\)/.test(dynamicReport)
    )
      return 0;
    throw invalidReport();
  }
  const entries = parseLddReport(report);
  for (const entry of entries) {
    if (systemRuntime.has(entry.name)) continue;
    let target;
    try {
      target = realpathSync(entry.path);
    } catch {
      throw invalidReport();
    }
    if (!inside(root, target)) throw outsideBundle();
  }
  return entries.length;
}

export function assertPrivateElfSearchPaths(report, directory, file) {
  if (typeof report !== 'string' || Buffer.byteLength(report) > 65536)
    throw invalidReport();
  const root = realpathSync(directory);
  const origin = dirname(realpathSync(file));
  const lines = report.split(/\r?\n/);
  if (lines.length > 128) throw invalidReport();
  for (const line of lines) {
    if (!/\((?:RPATH|RUNPATH)\)/.test(line)) continue;
    const match = /Library (?:rpath|runpath): \[([^\]]+)\]\s*$/.exec(line);
    if (!match) throw invalidReport();
    const paths = match[1].split(':');
    if (paths.length > 32) throw invalidReport();
    for (const path of paths) {
      const suffix = /^(?:\$ORIGIN|\$\{ORIGIN\})(\/[^$]*)?$/.exec(path);
      if (!suffix) throw outsideBundle();
      let target;
      try {
        target = realpathSync(join(origin, suffix[1] ?? ''));
      } catch {
        throw invalidReport();
      }
      if (target !== root && !inside(root, target)) throw outsideBundle();
    }
  }
}

export async function verifyLinuxRuntime(directory) {
  if (process.platform !== 'linux')
    throw new Error('Linux runtime verification requires Linux');
  const root = realpathSync(directory);
  const files = [
    join(root, 'bin', 'rdp-worker'),
    join(root, 'bin', 'rdp-runtime-check'),
  ];
  const libraries = readdirSync(join(root, 'lib'));
  if (libraries.length > 128) throw invalidReport();
  for (const name of libraries)
    if (/^lib.+\.so(?:\..+)?$/.test(name)) files.push(join(root, 'lib', name));
  const unique = new Set();
  for (const file of files) {
    const target = realpathSync(file);
    if (!inside(root, target) || !statSync(target).isFile())
      throw outsideBundle();
    unique.add(target);
  }
  let dependencies = 0;
  for (const file of unique) {
    let report;
    let dynamic;
    try {
      dynamic = await promisify(execFile)(
        'readelf',
        ['--wide', '--dynamic', file],
        {
          encoding: 'utf8',
          timeout: 5000,
          maxBuffer: 65536,
          env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
        },
      );
      report = await promisify(execFile)('ldd', [file], {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 65536,
        env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      });
    } catch {
      throw invalidReport();
    }
    if (report.stderr.trim() || dynamic.stderr.trim()) throw invalidReport();
    assertPrivateElfSearchPaths(dynamic.stdout, root, file);
    dependencies += assertPrivateLddReport(report.stdout, root, dynamic.stdout);
  }
  return { files: unique.size, dependencies };
}
