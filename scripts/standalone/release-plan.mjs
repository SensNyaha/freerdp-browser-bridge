import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { standaloneReleasePreflight } from './release-preflight.mjs';

export function standaloneUpgradeSeed(version) {
  if (!/^0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(version ?? ''))
    throw new Error('STANDALONE_RELEASE_VERSION_INVALID');
  const patch = Number(version.split('.')[2]);
  return patch >= 5
    ? {
        version: '0.2.' + (patch - 1),
        ref:
          patch === 5
            ? 'de46cea5776be19971716117b1c37dbf46012464'
            : 'v0.2.' + (patch - 1),
      }
    : undefined;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const metadata = JSON.parse(await readFile('package.json', 'utf8'));
  const seed = standaloneUpgradeSeed(metadata.version);
  const publish = process.env.STANDALONE_PUBLISH === 'true';
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'SensNyaha/freerdp-browser-bridge' ||
    (publish &&
      !['refs/heads/main', 'refs/heads/master'].includes(
        process.env.GITHUB_REF,
      ))
  )
    throw new Error('STANDALONE_RELEASE_CONTEXT_REFUSED');
  const plan = {
    version: metadata.version,
    publish,
    skip: publish && !seed,
    seed,
  };
  if (publish && seed)
    plan.skip = (
      await standaloneReleasePreflight(metadata.version)
    ).alreadyPublished;
  await mkdir('build', { recursive: true });
  await writeFile(
    'build/standalone-release-plan.json',
    JSON.stringify(plan, null, 2) + '\n',
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      'version=' +
        plan.version +
        '\nskip=' +
        plan.skip +
        '\nseed-ref=' +
        (seed?.ref ?? '') +
        '\n',
    );
  console.log(JSON.stringify(plan));
}
