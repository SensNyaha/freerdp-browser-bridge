import { resolve } from 'node:path';
import {
  readJson,
  parseManifest,
  verifySources,
  verifyArchives,
  fail,
} from './manifest.mjs';
import { assetDirectory, fetchAssets } from './fetch.mjs';
import { publishAccepted } from './publish.mjs';

try {
  const [mode, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !['fetch', 'verify', 'publish'].includes(mode) ||
    process.versions.node.split('.')[0] !== '24'
  )
    fail('DELIVERY_COMMAND_INVALID');
  const root = resolve('.');
  const manifest = parseManifest(
    await readJson(root, '.delivery/release.json'),
  );
  if (
    (process.env.DELIVERY_TAG !== undefined &&
      process.env.DELIVERY_TAG !== manifest.upstream.tag) ||
    (process.env.GITHUB_REPOSITORY !== undefined &&
      process.env.GITHUB_REPOSITORY !== manifest.repository)
  )
    fail('DELIVERY_CONTEXT_MISMATCH');
  await verifySources(root, manifest);
  if (mode === 'fetch') {
    await fetchAssets(root, manifest);
    console.log(
      JSON.stringify({
        version: manifest.version,
        packages: manifest.packages.length,
        fetchedExactAssets: true,
        published: false,
      }),
    );
  } else {
    const archives = await assetDirectory(root);
    await verifyArchives(archives, manifest);
    if (mode === 'publish') await publishAccepted({ root, archives, manifest });
    else
      console.log(
        JSON.stringify({
          version: manifest.version,
          packages: manifest.packages.length,
          verifiedExactInputs: true,
          published: false,
        }),
      );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code ?? '')
        ? error.code
        : 'DELIVERY_COMMAND_FAILED',
    }),
  );
  process.exitCode = 1;
}
