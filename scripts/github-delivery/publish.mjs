import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  fail,
  parseManifest,
  verifyArchives,
  verifySources,
} from './manifest.mjs';

const registry = 'https://registry.npmjs.org/';
export async function publicMetadata(name, version, fetcher = fetch) {
  const response = await fetcher(
    registry +
      name.replace('/', '%2F') +
      '/' +
      version +
      '?delivery=' +
      Date.now(),
    {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    await response.body?.cancel();
    fail('DELIVERY_REGISTRY_READ_FAILED');
  }
  let size = 0;
  const chunks = [];
  for await (const bytes of response.body) {
    if ((size += bytes.length) > 1024 * 1024)
      fail('DELIVERY_REGISTRY_READ_LIMIT');
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('DELIVERY_REGISTRY_JSON_INVALID');
  }
}
function exact(metadata, item) {
  if (!metadata) return false;
  if (
    metadata.name !== item.name ||
    metadata.version !== item.version ||
    metadata.dist?.integrity !== item.integrity
  )
    fail('DELIVERY_PUBLIC_BYTES_DIFFER');
  return true;
}
const versionParts = (value) => {
  if (
    !/^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/.test(
      value ?? '',
    )
  )
    fail('DELIVERY_LATEST_VERSION_UNSUPPORTED');
  return value.split('.').map(Number);
};
export function publishTag(candidate, current) {
  const target = versionParts(candidate);
  if (!current) return 'latest';
  // npm creates this documented placeholder when staging a new package name.
  if (current.version === '0.0.0-stage') return 'latest';
  const previous = versionParts(current.version);
  for (let index = 0; index < 3; index++) {
    if (target[index] > previous[index]) return 'latest';
    if (target[index] < previous[index]) return 'release-' + candidate;
  }
  return 'latest';
}
export function assertOidcContext(manifest, environment = process.env) {
  parseManifest(manifest);
  if (
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.GITHUB_REPOSITORY !== manifest.repository ||
    environment.DELIVERY_TAG !== manifest.upstream.tag ||
    !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
    environment.NPM_TOKEN ||
    environment.NODE_AUTH_TOKEN ||
    !environment.ACTIONS_ID_TOKEN_REQUEST_URL?.startsWith('https://')
  )
    fail('DELIVERY_OIDC_CONTEXT_REQUIRED');
}
const npmCli = () =>
  resolve(
    dirname(process.execPath),
    process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : '../lib/node_modules/npm/bin/npm-cli.js',
  );
export async function publishAccepted({
  root,
  archives,
  manifest,
  environment = process.env,
  metadata = publicMetadata,
  run = spawnSync,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  report = (value) => process.stdout.write(JSON.stringify(value) + '\n'),
}) {
  assertOidcContext(manifest, environment);
  await verifySources(root, manifest);
  await verifyArchives(archives, manifest);
  const results = [];
  for (const item of manifest.packages) {
    if (exact(await metadata(item.name, item.version), item)) {
      results.push({
        name: item.name,
        version: item.version,
        alreadyPublic: true,
        publicExact: true,
      });
      report(results.at(-1));
      continue;
    }
    const latest = await metadata(item.name, 'latest');
    if (latest && latest.name !== item.name)
      fail('DELIVERY_REGISTRY_NAME_INVALID');
    // Historical missing versions never move an already newer latest tag back.
    const tag = publishTag(item.version, latest);
    // Recheck the complete immutable input immediately before each write.
    await verifySources(root, manifest);
    await verifyArchives(archives, manifest);
    const result = run(
      process.execPath,
      [
        '--use-system-ca',
        npmCli(),
        'publish',
        resolve(archives, item.archive),
        '--access=public',
        '--provenance',
        '--ignore-scripts',
        '--tag=' + tag,
        '--registry=' + registry,
        '--@freerdp-bridge:registry=' + registry,
        '--logs-max=0',
        '--loglevel=error',
        '--json',
        '--fetch-timeout=60000',
        '--fetch-retries=0',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        timeout: 90000,
        maxBuffer: 1024 * 1024,
      },
    );
    if (result.error || result.status !== 0) {
      // Never replay an uncertain upload in the same run. A later run performs
      // the public integrity read first. CLI credentials/diagnostics are not logged.
      if (exact(await metadata(item.name, item.version), item)) {
        const record = {
          name: item.name,
          version: item.version,
          publicExact: true,
          commandUnconfirmed: true,
        };
        results.push(record);
        report(record);
        continue;
      }
      fail('DELIVERY_NPM_PUBLISH_UNCONFIRMED');
    }
    let verified = false;
    // The real registry can accept an OIDC upload several minutes before the
    // version endpoint exposes it. Poll reads only; never repeat the write.
    for (let attempt = 0; attempt < 60; attempt++) {
      if (exact(await metadata(item.name, item.version), item)) {
        verified = true;
        break;
      }
      await pause(5000);
    }
    const record = {
      name: item.name,
      version: item.version,
      tag,
      publishAccepted: true,
      publicExact: verified,
    };
    results.push(record);
    report(record);
    if (!verified) fail('DELIVERY_PUBLIC_VERSION_UNCONFIRMED');
  }
  return results;
}
