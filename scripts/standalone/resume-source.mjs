import { join } from 'node:path';
import { isReleaseVersion } from '../github-delivery/manifest.mjs';
import { readStandalonePayloadFile } from './payload.mjs';
import { standaloneGithubApi } from './release-api.mjs';

const prefix = '/repos/SensNyaha/freerdp-browser-bridge';
const refused = () => new Error('STANDALONE_RESUME_SOURCE_REFUSED');
export function standaloneResumePointer(value, version) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'runId,schema,sourceCommit,version' ||
    value.schema !== 1 ||
    value.version !== version ||
    !isReleaseVersion(version) ||
    !Number.isSafeInteger(value.runId) ||
    value.runId < 1 ||
    !/^[a-f0-9]{40}$/.test(value.sourceCommit ?? '')
  )
    throw refused();
  return {
    schema: 1,
    version,
    sourceCommit: value.sourceCommit,
    runId: value.runId,
  };
}
export async function readStandaloneResumePointer(root, version) {
  let bytes;
  try {
    bytes = await readStandalonePayloadFile(
      join(root, 'packaging/standalone/release-resume.json'),
      4096,
    );
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw refused();
  }
  try {
    return standaloneResumePointer(JSON.parse(bytes.toString('utf8')), version);
  } catch {
    throw refused();
  }
}
/** A trusted publisher revision may ship the exact retained artifacts of the
 * immutable release tag, only after the original hosted acceptance succeeded. */
export async function verifyStandaloneResumeSource(
  pointer,
  api = standaloneGithubApi(),
) {
  const value = standaloneResumePointer(pointer, pointer?.version);
  const ref = await api(prefix + '/git/ref/tags/v' + value.version);
  if (
    ref?.object?.type !== 'tag' ||
    !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')
  )
    throw refused();
  const tag = await api(prefix + '/git/tags/' + ref.object.sha);
  if (tag?.object?.type !== 'commit' || tag.object.sha !== value.sourceCommit)
    throw refused();
  const run = await api(prefix + '/actions/runs/' + value.runId);
  if (
    run?.id !== value.runId ||
    run.head_sha !== value.sourceCommit ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.path !== '.github/workflows/standalone-release.yml' ||
    run.repository?.full_name !== 'SensNyaha/freerdp-browser-bridge' ||
    run.head_repository?.full_name !== 'SensNyaha/freerdp-browser-bridge' ||
    !(
      (run.event === 'workflow_dispatch' &&
        run.head_branch === 'v' + value.version) ||
      (run.event === 'push' && ['main', 'master'].includes(run.head_branch))
    )
  )
    throw refused();
  const jobs = await api(
    prefix + '/actions/runs/' + value.runId + '/jobs?per_page=20',
  );
  if (
    !Array.isArray(jobs?.jobs) ||
    jobs.jobs.length > 20 ||
    jobs.total_count !== jobs.jobs.length
  )
    throw refused();
  for (const name of [
    'plan',
    'build (windows-2025)',
    'build (ubuntu-24.04)',
    'verify',
  ]) {
    const selected = jobs.jobs.filter((job) => job.name === name);
    if (
      selected.length !== 1 ||
      selected[0].status !== 'completed' ||
      selected[0].conclusion !== 'success'
    )
      throw refused();
  }
  return value;
}
