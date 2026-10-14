import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLddReport,
  assertPrivateLddReport,
  assertPrivateElfSearchPaths,
} from '../../scripts/linux-runtime.mjs';

test('Linux ELF report: mapped paths with spaces, direct loader and virtual DSO are independent records', () => {
  assert.deepEqual(
    parseLddReport(
      '\tlinux-vdso.so.1 (0x00007fff)\n' +
        '\tlibudev.so.1 => /tmp/relocated application/lib/libudev.so.1 (0x1234)\n' +
        '\t/lib64/ld-linux-x86-64.so.2 (0xABCD)\n',
    ),
    [
      { name: 'linux-vdso.so.1', path: 'linux-vdso.so.1' },
      {
        name: 'libudev.so.1',
        path: '/tmp/relocated application/lib/libudev.so.1',
      },
      {
        name: 'ld-linux-x86-64.so.2',
        path: '/lib64/ld-linux-x86-64.so.2',
      },
    ],
  );
});

test('Linux ELF search paths: only private origin directories survive canonical path checks', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'bridge-elf-search-'));
  const root = join(temporary, 'application');
  const binary = join(root, 'bin', 'worker');
  try {
    await mkdir(join(root, 'bin'), { recursive: true });
    await mkdir(join(root, 'lib'));
    await writeFile(binary, 'dummy');
    const dataOnly =
      'Dynamic section at offset 0x100 contains 2 entries:\n' +
      '0x000e (SONAME) Library soname: [libicudata.so.78]\n' +
      '0x0000 (NULL) 0x0\n';
    assert.equal(
      assertPrivateLddReport('statically linked', root, dataOnly),
      0,
    );
    for (const report of [
      undefined,
      'There is no dynamic section in this file.',
      dataOnly.replace('(SONAME)', '(NULL)'),
      dataOnly + '0x0001 (NEEDED) Shared library: [libudev.so.1]\n',
      dataOnly + 'x'.repeat(65536),
    ])
      assert.throws(
        () => assertPrivateLddReport('statically linked', root, report),
        /Invalid/,
      );
    const record = (paths) => `0x001d (RUNPATH) Library runpath: [${paths}]`;
    assert.doesNotThrow(() =>
      assertPrivateElfSearchPaths(
        record('$ORIGIN/../lib:$ORIGIN'),
        root,
        binary,
      ),
    );
    assert.doesNotThrow(() =>
      assertPrivateElfSearchPaths(record('${ORIGIN}/../lib'), root, binary),
    );
    assert.doesNotThrow(() =>
      assertPrivateElfSearchPaths('0x0000 (NULL) 0x0', root, binary),
    );
    for (const paths of ['/usr/lib', '$ORIGIN:', '$ORIGIN/../../', '$LIB', '.'])
      assert.throws(
        () => assertPrivateElfSearchPaths(record(paths), root, binary),
        /external non-CRT/,
      );
    assert.throws(
      () => assertPrivateElfSearchPaths(record(''), root, binary),
      /Invalid/,
    );
    assert.throws(
      () => assertPrivateElfSearchPaths('x'.repeat(65537), root, binary),
      /Invalid/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Linux ELF report: missing, malformed, duplicated and excessive claims cannot imply closure', () => {
  for (const report of [
    '',
    null,
    'statically linked',
    'libudev.so.1 => not found',
    'libudev.so.1 => relative/libudev.so.1 (0x1234)',
    'libudev.so.1 => /lib/libudev.so.1',
    'bad/name => /lib/libudev.so.1 (0x1234)',
    'linux-vdso.so.1 (0x1234)\nlinux-vdso.so.1 (0x5678)',
    'x'.repeat(65537),
    Array.from(
      { length: 129 },
      (_, i) => `lib${i}.so => /lib/${i}.so (0x1)`,
    ).join('\n'),
  ])
    assert.throws(
      () => parseLddReport(report),
      /Invalid Linux runtime dependency report/,
    );
});

test('Linux ELF closure: exact private ownership rejects sibling prefixes and Linux escaping symlinks', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'bridge-elf-closure-'));
  const root = join(temporary, 'private application');
  const sibling = root + '-other';
  try {
    await mkdir(root);
    await mkdir(sibling);
    const owned = join(root, 'libudev.so.1');
    const foreign = join(sibling, 'libudev.so.1');
    await writeFile(owned, 'dummy');
    await writeFile(foreign, 'dummy');
    const record = (path) => `libudev.so.1 => ${path} (0x1234)`;
    assert.equal(assertPrivateLddReport(record(owned), root), 1);
    assert.equal(
      assertPrivateLddReport(
        record(owned) + '\nlibc.so.6 => /lib/libc.so.6 (0x5678)',
        root,
      ),
      2,
    );
    assert.throws(
      () => assertPrivateLddReport(record(foreign), root),
      /external non-CRT/,
    );
    assert.throws(
      () => assertPrivateLddReport(record(join(root, 'missing')), root),
      /Invalid/,
    );
    if (process.platform === 'linux') {
      const escape = join(root, 'escape.so');
      await symlink(foreign, escape);
      assert.throws(
        () => assertPrivateLddReport(record(escape), root),
        /external non-CRT/,
      );
      const alias = join(temporary, 'alias');
      await symlink(root, alias);
      assert.equal(assertPrivateLddReport(record(owned), alias), 1);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
