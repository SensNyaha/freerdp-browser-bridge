import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { standaloneReleasePreflight } from './release-preflight.mjs';
import { readStandaloneCandidatePointer } from './candidate-release.mjs';
import { standaloneUpgradeSeed } from './upgrade-seed.mjs';
import {
  readStandaloneResumePointer,
  verifyStandaloneResumeSource,
} from './resume-source.mjs';
import { standaloneGithubApi } from './release-api.mjs';
export { standaloneUpgradeSeed } from './upgrade-seed.mjs';
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const metadata = JSON.parse(await readFile('package.json', 'utf8'));
  const seed = standaloneUpgradeSeed(metadata.version);
  const publish = process.env.STANDALONE_PUBLISH === 'true';
  const candidate = await readStandaloneCandidatePointer(
    resolve('.'),
    metadata.version,
  );
  if (publish && candidate)
    throw new Error('STANDALONE_CANDIDATE_PUBLICATION_REFUSED');
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
  const resume = await readStandaloneResumePointer(
    resolve('.'),
    metadata.version,
  );
  if (publish && seed) {
    try {
      plan.skip = (
        await standaloneReleasePreflight(metadata.version, {
          api: standaloneGithubApi(process.env.GITHUB_TOKEN),
        })
      ).alreadyPublished;
    } catch (error) {
      // Only the verified retained build can resume a partial upload; fresh
      // builds keep the existing refusal. Source proof below precedes output.
      if (
        !resume ||
        error?.message !==
          'STANDALONE_RELEASE_PARTIAL_RETRY_ORIGINAL_PUBLISH_JOB'
      )
        throw error;
    }
  }
  if (resume && !plan.skip) {
    if (!publish || candidate)
      throw new Error('STANDALONE_RESUME_CONTEXT_REFUSED');
    await verifyStandaloneResumeSource(
      resume,
      standaloneGithubApi(process.env.GITHUB_TOKEN),
    );
    plan.resume = resume;
  }
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
        '\nresume-run=' +
        (plan.resume?.runId ?? '') +
        '\nresume-source=' +
        (plan.resume?.sourceCommit ?? '') +
        '\n',
    );
  console.log(JSON.stringify(plan));
}
