import { createHash } from 'node:crypto';
import { open, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { windowsInstalledRelease } from './windows-installed-full-inputs.mjs';

const refused = () => new Error('OWNED_INSTALLED_DOWNLOAD_REFUSED');

/** Download only a validated public MSI, without credentials on redirects. */
export async function downloadWindowsInstalledMsi(
  record,
  directory,
  fetcher = fetch,
) {
  // Revalidate the normalized descriptor at this filesystem/network boundary.
  if (typeof record?.sha256 !== 'string') throw refused();
  const asset = windowsInstalledRelease(
    {
      id: record?.releaseId,
      tag_name: 'v' + record?.version,
      draft: false,
      prerelease: false,
      assets: [
        {
          id: record?.assetId,
          name: record?.name,
          state: 'uploaded',
          size: record?.bytes,
          digest: 'sha256:' + record?.sha256,
          browser_download_url: record?.url,
        },
      ],
    },
    record?.version,
  );
  if (directory !== (await realpath(directory))) throw refused();
  const output = join(directory, asset.name);
  let url = asset.url,
    response,
    file,
    complete = false;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetcher(url, {
        redirect: 'manual',
        headers: {
          accept: 'application/octet-stream',
          'accept-encoding': 'identity',
        },
        signal: AbortSignal.timeout(180000),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (redirects === 3 || !location) throw refused();
      const next = new URL(location, url);
      if (
        next.protocol !== 'https:' ||
        next.username ||
        next.password ||
        next.port ||
        next.hash ||
        ![
          'release-assets.githubusercontent.com',
          'objects.githubusercontent.com',
        ].includes(next.hostname)
      )
        throw refused();
      url = next.href;
    }
    const length = response.headers.get('content-length');
    if (
      response.status !== 200 ||
      !response.body ||
      (length !== null &&
        (!/^[0-9]{1,10}$/.test(length) || Number(length) !== asset.bytes))
    )
      throw refused();
    file = await open(output, 'wx', 0o600);
    const hash = createHash('sha256');
    let count = 0;
    for await (const chunk of response.body) {
      if (count + chunk.byteLength > asset.bytes) throw refused();
      count += chunk.byteLength;
      hash.update(chunk);
      await file.writeFile(chunk);
    }
    if (count !== asset.bytes || hash.digest('hex') !== asset.sha256)
      throw refused();
    await file.sync();
    complete = true;
    return output;
  } finally {
    if (!complete) await response?.body?.cancel().catch(() => {});
    if (file) {
      await file.close();
      if (!complete) await unlink(output);
    }
  }
}
