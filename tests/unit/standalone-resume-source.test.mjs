import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  standaloneResumePointer,
  verifyStandaloneResumeSource,
} from '../../scripts/standalone/resume-source.mjs';

const pointer = {
  schema: 1,
  version: '0.3.0',
  sourceCommit: 'a'.repeat(40),
  runId: 123,
};
function fixture() {
  return {
    run: {
      id: 123,
      head_sha: pointer.sourceCommit,
      status: 'completed',
      conclusion: 'success',
      path: '.github/workflows/standalone-release.yml',
      repository: { full_name: 'SensNyaha/freerdp-browser-bridge' },
      head_repository: { full_name: 'SensNyaha/freerdp-browser-bridge' },
      event: 'workflow_dispatch',
      head_branch: 'v0.3.0',
    },
    jobs: {
      total_count: 4,
      jobs: [
        'plan',
        'build (windows-2025)',
        'build (ubuntu-24.04)',
        'verify',
      ].map((name) => ({ name, status: 'completed', conclusion: 'success' })),
    },
    tag: { object: { type: 'commit', sha: pointer.sourceCommit } },
  };
}
function apiFor(value) {
  return async (path) => {
    if (path.includes('/git/ref/'))
      return { object: { type: 'tag', sha: 'b'.repeat(40) } };
    if (path.includes('/git/tags/')) return structuredClone(value.tag);
    if (path.endsWith('/jobs?per_page=20')) return structuredClone(value.jobs);
    if (path.endsWith('/actions/runs/123')) return structuredClone(value.run);
    assert.fail('Unexpected API target');
  };
}
test('standalone artifact resume requires a successful immutable-tag build and both installed OS acceptances', async () => {
  const value = fixture();
  assert.deepEqual(
    await verifyStandaloneResumeSource(pointer, apiFor(value)),
    pointer,
  );
  value.run.event = 'push';
  value.run.head_branch = 'main';
  assert.deepEqual(
    await verifyStandaloneResumeSource(pointer, apiFor(value)),
    pointer,
  );
});
test('standalone artifact resume refuses fork/source/workflow/tag/status/job drift before publication', async () => {
  for (const mutate of [
    (v) => (v.run.repository.full_name = 'Other/repo'),
    (v) => (v.run.head_repository.full_name = 'Other/repo'),
    (v) => (v.run.id = 124),
    (v) => (v.run.head_sha = 'c'.repeat(40)),
    (v) => (v.tag.object.sha = 'c'.repeat(40)),
    (v) => (v.tag.object.type = 'tag'),
    (v) => (v.run.status = 'in_progress'),
    (v) => (v.run.conclusion = 'failure'),
    (v) => (v.run.path = '.github/workflows/other.yml'),
    (v) => (v.run.head_branch = 'feature/test'),
    (v) => (v.run.event = 'pull_request'),
    (v) => v.jobs.jobs.pop(),
    (v) => (v.jobs.total_count = 21),
    (v) => (v.jobs.jobs[1].conclusion = 'skipped'),
    (v) => (v.jobs.jobs[2].status = 'queued'),
    (v) => {
      v.jobs.jobs.push(v.jobs.jobs[3]);
      v.jobs.total_count = 5;
    },
  ]) {
    const value = fixture();
    mutate(value);
    await assert.rejects(
      verifyStandaloneResumeSource(pointer, apiFor(value)),
      /STANDALONE_RESUME_SOURCE_REFUSED/,
    );
  }
});
test('standalone resume pointer admits only a bounded exact version/source/run identity', () => {
  assert.deepEqual(standaloneResumePointer(pointer, '0.3.0'), pointer);
  for (const value of [
    null,
    {},
    { ...pointer, extra: true },
    { ...pointer, runId: '123' },
    { ...pointer, runId: 0 },
    { ...pointer, runId: Number.MAX_SAFE_INTEGER + 1 },
    { ...pointer, sourceCommit: 'private-invalid' },
    { ...pointer, version: '0.2.5' },
  ])
    assert.throws(
      () => standaloneResumePointer(value, '0.3.0'),
      /STANDALONE_RESUME_SOURCE_REFUSED/,
    );
});

test('actual release plan resumes retained partial inputs only with a verified pointer and preserves fresh-build refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bridge-resume-plan-'));
  try {
    await mkdir(join(root, 'packaging/standalone'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ version: '0.3.0', private: true }),
    );
    const mock = join(root, 'network.mjs');
    const state = fixture();
    await writeFile(
      mock,
      `const state=${JSON.stringify(state)};
globalThis.fetch=async(input)=>{const url=new URL(input);let value;
if(url.hostname!=='api.github.com')throw Error('NO_EXTERNAL_NETWORK');
if(url.pathname.endsWith('/releases/tags/v0.3.0'))value={id:7,tag_name:'v0.3.0',draft:false,prerelease:false,assets:[{name:'freerdp-bridge-0.3.0-win32-x64.msi'}]};
else if(url.pathname.includes('/git/ref/'))value={object:{type:'tag',sha:'b'.repeat(40)}};
else if(url.pathname.includes('/git/tags/'))value=state.tag;
else if(url.pathname.endsWith('/jobs'))value=state.jobs;
else if(url.pathname.endsWith('/actions/runs/123'))value=state.run;
else throw Error('UNEXPECTED_API_TARGET');return new Response(JSON.stringify(value));};`,
    );
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(mock).href,
          resolve('scripts/standalone/release-plan.mjs'),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 65536,
          windowsHide: true,
          env: {
            ...Object.fromEntries(
              ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].flatMap((key) =>
                process.env[key] === undefined ? [] : [[key, process.env[key]]],
              ),
            ),
            GITHUB_ACTIONS: 'true',
            GITHUB_REPOSITORY: 'SensNyaha/freerdp-browser-bridge',
            GITHUB_REF: 'refs/heads/main',
            GITHUB_SHA: 'f'.repeat(40),
            STANDALONE_PUBLISH: 'true',
          },
        },
      );
    const refused = run();
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.stderr,
      /STANDALONE_RELEASE_PARTIAL_RETRY_ORIGINAL_PUBLISH_JOB/,
    );
    await writeFile(
      join(root, 'packaging/standalone/release-resume.json'),
      JSON.stringify(pointer),
    );
    const resumed = run();
    assert.equal(resumed.status, 0, resumed.stderr);
    const plan = JSON.parse(
      await readFile(join(root, 'build/standalone-release-plan.json'), 'utf8'),
    );
    assert.equal(plan.skip, false);
    assert.deepEqual(plan.resume, pointer);
    await writeFile(
      join(root, 'packaging/standalone/release-resume.json'),
      JSON.stringify({ ...pointer, sourceCommit: 'c'.repeat(40) }),
    );
    const changed = run();
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /STANDALONE_RESUME_SOURCE_REFUSED/);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^bridge-resume-plan-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true });
  }
});
