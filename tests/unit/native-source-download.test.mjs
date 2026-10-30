import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchNativeSourceBytes,
  ensureNativeSourceArchive,
} from '../../scripts/native-source-download.mjs';
import { nativeSourceComponents } from '../../scripts/native-package-sources.mjs';

const body = Buffer.from('owned-public-source-fixture');
const checksum = createHash('sha512').update(body).digest('hex');
const url = 'https://github.com/libusb/libusb/archive/v1.0.30.tar.gz';
const refused = { message: 'NATIVE_SOURCE_FETCH_REFUSED' };
test('source transport bounds redirects and bytes, verifies SHA512 and never sends auth', async () => {
  let calls = 0;
  const result = await fetchNativeSourceBytes(
    url,
    checksum,
    async (address, options) => {
      assert.equal(options.redirect, 'manual');
      assert.deepEqual(Object.keys(options.headers).sort(), [
        'accept',
        'accept-encoding',
      ]);
      calls++;
      if (calls === 1)
        return new Response('', {
          status: 302,
          headers: {
            location:
              'https://codeload.github.com/libusb/libusb/tar.gz/v1.0.30',
          },
        });
      assert.match(address, /^https:\/\/codeload.github.com\//);
      return new Response(body, {
        headers: { 'content-length': String(body.length) },
      });
    },
  );
  assert.deepEqual(result, body);
  assert.equal(calls, 2);
});
test('source transport refuses foreign, oversized, truncated, compressed and wrong-digest responses with fixed diagnostics', async () => {
  for (const fetcher of [
    async () => new Response('PRIVATE-owned', { status: 404 }),
    async () =>
      new Response(body, { headers: { 'content-length': '8388609' } }),
    async () =>
      new Response(body, {
        headers: { 'content-length': String(body.length + 1) },
      }),
    async () => new Response(body, { headers: { 'content-encoding': 'gzip' } }),
    async () => new Response('PRIVATE-owned'),
    async () =>
      new Response('', {
        status: 302,
        headers: { location: 'https://example.invalid/PRIVATE-owned' },
      }),
    async () =>
      new Response('', {
        status: 302,
        headers: { location: 'http://codeload.github.com/libusb' },
      }),
    async () => new Response('', { status: 302, headers: { location: url } }),
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(8388608));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }),
      ),
  ])
    await assert.rejects(
      fetchNativeSourceBytes(url, checksum, fetcher),
      refused,
    );
  for (const address of [
    'http://github.com/libusb',
    'https://user:PRIVATE-owned@github.com/libusb',
    'https://github.com:8443/libusb',
  ])
    await assert.rejects(
      fetchNativeSourceBytes(address, checksum, () =>
        assert.fail('No network'),
      ),
      refused,
    );
});
test('binary-cache-only build fetches missing source once, validates warm cache offline and never replaces corrupt or foreign files', async () => {
  const project = await mkdtemp(
    join(tmpdir(), 'bridge-source-cache-controls-'),
  );
  const plan = {
    archive: 'owned.tar.gz',
    name: 'libusb/libusb',
    ref: 'v1.0.30',
    sha512: checksum,
  };
  const cache = join(project, '.tools/vcpkg-downloads'),
    output = join(cache, plan.archive);
  try {
    const result = await ensureNativeSourceArchive(
      project,
      plan,
      async () => new Response(body),
    );
    assert.equal(result.downloaded, true);
    assert.deepEqual(await readFile(output), body);
    assert.equal(
      (
        await ensureNativeSourceArchive(project, plan, () =>
          assert.fail('Warm cache must stay offline'),
        )
      ).downloaded,
      false,
    );
    await writeFile(output, 'PRIVATE-owned-corruption');
    await assert.rejects(
      ensureNativeSourceArchive(project, plan, () =>
        assert.fail('Do not replace corrupt cache'),
      ),
      refused,
    );
    assert.equal(await readFile(output, 'utf8'), 'PRIVATE-owned-corruption');
    await assert.rejects(
      ensureNativeSourceArchive(
        project,
        { ...plan, archive: '../outside.tar.gz' },
        () => assert.fail(),
      ),
      refused,
    );
  } finally {
    await unlink(output);
    await rmdir(cache);
    await rmdir(join(project, '.tools'));
    await rmdir(project);
  }
});
test('corresponding-source selection retains all four Linux components and Windows libusb', () => {
  assert.deepEqual(nativeSourceComponents('win32'), ['libusb']);
  assert.deepEqual(nativeSourceComponents('linux'), [
    'libusb',
    'eudev',
    'libfuse',
    'numactl',
  ]);
  assert.throws(() => nativeSourceComponents('darwin'));
});
