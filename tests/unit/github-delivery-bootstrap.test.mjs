import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapRelease,
  parseApiResponse,
  releaseAssets,
  requirePublic,
} from '../../scripts/github-delivery/bootstrap.mjs';

const response = (body, status = 200) =>
  'HTTP/2.0 ' +
  status +
  ' Response\r\nContent-Type: application/json\r\n\r\n' +
  JSON.stringify(body);
const item = () => ({
  repository: 'SensNyaha/freerdp-bridge-http',
  commit: 'a'.repeat(40),
  assets: '/accepted',
  manifest: { upstream: { tag: 'v0.2.4' } },
  files: [
    { name: 'http.tgz', bytes: 32, sha256: 'b'.repeat(64) },
    { name: 'delivery-manifest.json', bytes: 128, sha256: 'c'.repeat(64) },
  ],
});
const uploaded = (file) => ({
  name: file.name,
  size: file.bytes,
  state: 'uploaded',
  digest: 'sha256:' + file.sha256,
});
const release = (value, draft = true) => ({
  tag_name: 'v0.2.4',
  draft,
  prerelease: false,
  assets: value.files.map(uploaded),
});

test('Delivery bootstrap distinguishes a real HTTP 404 from account, transport, malformed and oversized responses', () => {
  assert.deepEqual(parseApiResponse(response({ ready: true })), {
    ready: true,
  });
  assert.equal(parseApiResponse(response({}, 404)), undefined);
  for (const input of [
    response({}, 401),
    response({}, 500),
    'not an HTTP response',
    response({}).slice(0, -1),
    'x'.repeat(1024 * 1024 + 1),
  ])
    assert.throws(
      () => parseApiResponse(input),
      (error) => /^DELIVERY_GH_/.test(error.code),
    );
});

test('Delivery bootstrap refuses existing changed assets and incomplete published releases without replacing anything', () => {
  const value = item();
  assert.deepEqual(releaseAssets(release(value, false), value), []);
  const missing = release(value);
  missing.assets.pop();
  assert.deepEqual(releaseAssets(missing, value, true), [value.files[1]]);
  assert.throws(() => releaseAssets({ ...missing, draft: false }, value, true));
  for (const change of [
    (value) => (value.assets[0].digest = 'sha256:changed'),
    (value) => value.assets[0].size++,
    (value) => (value.assets[0].state = 'new'),
    (value) => value.assets.push(value.assets[0]),
    (value) => (value.assets[0].name = 'unexpected.tgz'),
    (value) => (value.tag_name = 'v0.2.3'),
    (value) => (value.prerelease = true),
  ]) {
    const bad = release(value);
    change(bad);
    assert.throws(() => releaseAssets(bad, value, true));
  }
});

test('Delivery bootstrap requires exact public dependencies before downstream release submission', async () => {
  const packages = [
    { name: '@freerdp-bridge/http', version: '0.2.4', integrity: 'accepted' },
  ];
  await assert.rejects(
    requirePublic(packages, async () => undefined),
    (error) => error.code === 'DELIVERY_PUBLIC_DEPENDENCIES_PENDING',
  );
  await assert.rejects(
    requirePublic(packages, async () => ({
      name: packages[0].name,
      version: '0.2.4',
      dist: { integrity: 'changed' },
    })),
    (error) => error.code === 'DELIVERY_PUBLIC_BYTES_DIFFER',
  );
  await requirePublic(packages, async () => ({
    ...packages[0],
    dist: { integrity: 'accepted' },
  }));
});

test('core bootstrap preserves separately verified standalone assets while retaining exact core and unknown-asset refusal', () => {
  const value = item();
  value.manifest = {
    kind: 'core',
    version: '0.2.5',
    upstream: { tag: 'v0.2.5' },
  };
  const published = { ...release(value, false), tag_name: 'v0.2.5' };
  published.assets.push({
    name: 'freerdp-bridge-0.2.5-win32-x64.msi',
    size: 1,
    state: 'uploaded',
    digest: 'sha256:' + 'd'.repeat(64),
  });
  assert.deepEqual(releaseAssets(published, value), []);
  const changed = structuredClone(published);
  changed.assets[0].digest = 'sha256:changed';
  assert.throws(() => releaseAssets(changed, value));
  const unknown = structuredClone(published);
  unknown.assets.at(-1).name = 'unverified-extra.exe';
  assert.throws(() => releaseAssets(unknown, value));
});

function remoteFixture(value, initial) {
  const workflow = Buffer.from('accepted workflow\n');
  const state = {
    release: initial,
    commands: [],
    checks: 0,
    wrongCommit: false,
    wrongWorkflow: false,
  };
  return {
    state,
    options: {
      notes: '/notes.md',
      workflow: async () => workflow,
      checkLocal: async () => {
        state.checks++;
      },
      apiCommand: async (args) => {
        const endpoint = args[2];
        let body;
        if (endpoint === 'user') body = { login: 'SensNyaha' };
        else if (endpoint.endsWith('/git/ref/tags/v0.2.4'))
          body = { object: { type: 'tag', sha: 'd'.repeat(40) } };
        else if (endpoint.includes('/git/tags/'))
          body = {
            object: {
              type: 'commit',
              sha: state.wrongCommit ? 'e'.repeat(40) : value.commit,
            },
          };
        else if (endpoint.includes('/contents/'))
          body = {
            type: 'file',
            encoding: 'base64',
            content: (state.wrongWorkflow
              ? Buffer.from('changed')
              : workflow
            ).toString('base64'),
          };
        else if (endpoint.endsWith('/releases/tags/v0.2.4'))
          return state.release ? response(state.release) : response({}, 404);
        else if (endpoint.includes('/releases?'))
          return response(state.release ? [state.release] : []);
        else
          body = {
            full_name: value.repository,
            private: false,
            archived: false,
            permissions: { push: true },
          };
        return response(body);
      },
      command: async (args) => {
        state.commands.push(args);
        if (args[1] === 'create')
          state.release = { ...release(value), assets: [] };
        else if (args[1] === 'upload')
          state.release.assets = value.files.map(uploaded);
        else if (args[1] === 'edit') state.release.draft = false;
        else assert.fail('Unexpected mutation');
        return '';
      },
    },
  };
}

test('Delivery bootstrap publishes only after pushed source/tag and all server archive digests match; repeats are read-only', async () => {
  const value = item(),
    { state, options } = remoteFixture(value);
  const result = await bootstrapRelease(value, options);
  assert.equal(result.releasePublished, true);
  assert.equal(result.npmPublicationVerified, false);
  assert.deepEqual(
    state.commands.map((args) => args[1]),
    ['create', 'upload', 'edit'],
  );
  assert.ok(state.commands[0].includes('--verify-tag'));
  assert.ok(state.commands[0].includes('--draft'));
  assert.ok(state.commands.every((args) => !args.includes('--clobber')));
  assert.ok(
    state.commands.every(
      (args) =>
        args[args.indexOf('--repo') + 1] === 'github.com/' + value.repository,
    ),
  );
  assert.equal(state.checks, 3);
  state.commands = [];
  assert.equal(
    (await bootstrapRelease(value, options)).releaseAlreadyPublished,
    true,
  );
  assert.equal(state.commands.length, 0);
});

test('Delivery bootstrap resumes missing draft assets without replacing existing bytes and refuses upstream drift before mutation', async () => {
  const value = item(),
    initial = release(value);
  initial.assets.pop();
  const { state, options } = remoteFixture(value, initial);
  await bootstrapRelease(value, options);
  assert.deepEqual(
    state.commands.map((args) => args[1]),
    ['upload', 'edit'],
  );
  assert.equal(
    state.commands[0].some((arg) => arg.endsWith('http.tgz')),
    false,
  );
  assert.equal(
    state.commands[0].some((arg) => arg.endsWith('delivery-manifest.json')),
    true,
  );
  for (const field of ['wrongCommit', 'wrongWorkflow']) {
    const fixture = remoteFixture(value);
    fixture.state[field] = true;
    await assert.rejects(bootstrapRelease(value, fixture.options));
    assert.equal(fixture.state.commands.length, 0);
  }
});

test('Delivery bootstrap finds authenticated drafts omitted by the by-tag endpoint and refuses duplicate draft tags', async () => {
  const value = item(),
    fixture = remoteFixture(value, { ...release(value), assets: [] });
  const read = fixture.options.apiCommand;
  fixture.options.apiCommand = async (args) => {
    if (
      args[2].endsWith('/releases/tags/v0.2.4') &&
      fixture.state.release.draft
    )
      return response({}, 404);
    return read(args);
  };
  await bootstrapRelease(value, fixture.options);
  assert.deepEqual(
    fixture.state.commands.map((args) => args[1]),
    ['upload', 'edit'],
  );
  const duplicate = remoteFixture(value);
  // Keep all other endpoints valid while forcing only release discovery missing.
  const original = remoteFixture(value).options.apiCommand;
  duplicate.options.apiCommand = async (args) =>
    args[2].includes('/releases?')
      ? response([release(value), release(value)])
      : original(args);
  await assert.rejects(
    bootstrapRelease(value, duplicate.options),
    (error) => error.code === 'DELIVERY_GH_RELEASE_DUPLICATE',
  );
  assert.equal(duplicate.state.commands.length, 0);
});

test('Delivery bootstrap does not retry uncertain uploads or publish the draft after failed digest verification', async () => {
  const value = item(),
    fixture = remoteFixture(value);
  const original = fixture.options.command;
  fixture.options.command = async (args) => {
    if (args[1] === 'upload') {
      fixture.state.commands.push(args);
      throw Object.assign(Error('private diagnostic'), {
        code: 'DELIVERY_GH_COMMAND_FAILED',
      });
    }
    return original(args);
  };
  await assert.rejects(
    bootstrapRelease(value, fixture.options),
    (error) => error.code === 'DELIVERY_GH_COMMAND_FAILED',
  );
  assert.deepEqual(
    fixture.state.commands.map((args) => args[1]),
    ['create', 'upload'],
  );
  const changed = remoteFixture(value, release(value));
  changed.state.release.assets[0].digest = 'sha256:changed';
  await assert.rejects(bootstrapRelease(value, changed.options));
  assert.equal(changed.state.commands.length, 0);
});
