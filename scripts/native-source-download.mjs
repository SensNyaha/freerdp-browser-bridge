import { createHash } from 'node:crypto';
import { mkdir, lstat, realpath, open, unlink } from 'node:fs/promises';
import { join, sep } from 'node:path';
import {
  nativeSourceComponents,
  nativeSourcePlan,
  readNativeSourceFile,
} from './native-package-sources.mjs';

const maximum = 8388608;
const refuse = () => new Error('NATIVE_SOURCE_FETCH_REFUSED');
function sourceUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !['github.com', 'codeload.github.com'].includes(url.hostname) ||
    url.href.length > 2048
  )
    throw refuse();
  return url.href;
}

/** Bounded public-source transport; callers bind the digest to a validated SBOM. */
export async function fetchNativeSourceBytes(url, checksum, fetcher = fetch) {
  let response;
  const chunks = [];
  try {
    url = sourceUrl(url);
    const signal = AbortSignal.timeout(180000);
    if (typeof checksum !== 'string' || !/^[a-f0-9]{128}$/.test(checksum))
      throw refuse();
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetcher(url, {
        redirect: 'manual',
        headers: {
          accept: 'application/octet-stream',
          'accept-encoding': 'identity',
        },
        signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const next = response.headers.get('location');
      await response.body?.cancel();
      if (redirects === 3 || !next) throw refuse();
      url = sourceUrl(new URL(next, url).href);
    }
    const length = response.headers.get('content-length');
    const encoding = response.headers.get('content-encoding');
    if (
      response.status !== 200 ||
      !response.body ||
      (encoding !== null && encoding !== 'identity') ||
      (length !== null &&
        (!/^[0-9]{1,8}$/.test(length) ||
          Number(length) < 1 ||
          Number(length) > maximum))
    )
      throw refuse();
    let count = 0;
    for await (const chunk of response.body) {
      if (!(chunk instanceof Uint8Array) || count + chunk.byteLength > maximum)
        throw refuse();
      count += chunk.byteLength;
      chunks.push(Buffer.from(chunk));
    }
    if (!count || (length !== null && Number(length) !== count)) throw refuse();
    const bytes = Buffer.concat(chunks, count);
    if (createHash('sha512').update(bytes).digest('hex') !== checksum) {
      bytes.fill(0);
      throw refuse();
    }
    return bytes;
  } catch {
    throw refuse();
  } finally {
    await response?.body?.cancel().catch(() => {});
    for (const chunk of chunks) chunk.fill(0);
  }
}

/** Cache write only; plan must come from nativeSourcePlan at the build boundary. */
export async function ensureNativeSourceArchive(
  project,
  plan,
  fetcher = fetch,
) {
  if (
    !plan ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.tar\.gz$/.test(plan.archive) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(
      plan.name,
    ) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(plan.ref) ||
    !/^[a-f0-9]{128}$/.test(plan.sha512)
  )
    throw refuse();
  project = await realpath(project);
  const cache = join(project, '.tools/vcpkg-downloads');
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const info = await lstat(cache);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    !(await realpath(cache)).startsWith(project + sep)
  )
    throw refuse();
  const output = join(cache, plan.archive);
  let exists = false;
  try {
    await lstat(output);
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw refuse();
  }
  if (exists) {
    const bytes = await readNativeSourceFile(cache, output, maximum);
    try {
      if (createHash('sha512').update(bytes).digest('hex') !== plan.sha512)
        throw refuse();
      return { component: plan.name, bytes: bytes.length, downloaded: false };
    } finally {
      bytes.fill(0);
    }
  }
  const bytes = await fetchNativeSourceBytes(
    'https://github.com/' + plan.name + '/archive/' + plan.ref + '.tar.gz',
    plan.sha512,
    fetcher,
  );
  let file,
    complete = false;
  try {
    file = await open(output, 'wx', 0o600);
    await file.writeFile(bytes);
    await file.sync();
    complete = true;
    return { component: plan.name, bytes: bytes.length, downloaded: true };
  } finally {
    bytes.fill(0);
    if (file) {
      await file.close();
      if (!complete) await unlink(output);
    }
  }
}

export async function prepareNativePackageSources({
  project,
  stage,
  platform,
  fetcher = fetch,
}) {
  const result = [];
  for (const component of nativeSourceComponents(platform)) {
    const bytes = await readNativeSourceFile(
      stage,
      join(stage, 'share/freerdp-bridge/sbom/vcpkg', component + '.spdx.json'),
      1048576,
    );
    const plan = nativeSourcePlan(
      component,
      JSON.parse(bytes.toString('utf8')),
    );
    result.push(await ensureNativeSourceArchive(project, plan, fetcher));
  }
  return result;
}
