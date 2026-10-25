import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { verifiedStandaloneCandidateArchives } from '../../scripts/standalone/candidate-archives.mjs';

for (const platform of ['win32-x64', 'linux-x64-gnu'])
  test(`candidate ${platform} inputs require all five lock-identical archives and matching dependency/platform metadata`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'bridge-candidate-archives-'));
    try {
      const lock = JSON.parse(
        await readFile(
          resolve('packaging/standalone/locks', platform + '.json'),
          'utf8',
        ),
      );
      const metadata = new Map();
      let last;
      for (const [path, entry] of Object.entries(lock.packages)) {
        if (!path.startsWith('node_modules/@freerdp-bridge/')) continue;
        const suffix = path.slice('node_modules/@freerdp-bridge/'.length);
        const archive =
          'freerdp-bridge-' + suffix + '-' + lock.version + '.tgz';
        const bytes = Buffer.from('synthetic-archive-fixture-' + suffix);
        entry.integrity =
          'sha512-' + createHash('sha512').update(bytes).digest('base64');
        const value = {
          ...structuredClone(entry),
          name: '@freerdp-bridge/' + suffix,
        };
        delete value.resolved;
        delete value.integrity;
        metadata.set(archive, value);
        await writeFile(join(root, archive), bytes);
        last = archive;
      }
      const before = structuredClone(lock);
      const options = {
        readManifest: (path) => structuredClone(metadata.get(basename(path))),
      };
      const verified = await verifiedStandaloneCandidateArchives(
        lock,
        lock.version,
        platform,
        root,
        options,
      );
      assert.equal(verified.length, 5);
      assert.deepEqual(lock, before);
      const apiName = 'freerdp-bridge-api-' + lock.version + '.tgz';
      const api = metadata.get(apiName);
      for (const change of [
        (value) => {
          value.version = '0.0.0';
        },
        (value) => {
          value.name = '@freerdp-bridge/other';
        },
        (value) => {
          value.dependencies.fastify = '0.0.0';
        },
        (value) => {
          value.engines.node = '*';
        },
        (value) => {
          value.cpu = ['other'];
        },
        (value) => {
          value.bin = { unexpected: 'runtime/bin/other' };
        },
      ]) {
        const changed = structuredClone(api);
        change(changed);
        metadata.set(apiName, changed);
        await assert.rejects(
          verifiedStandaloneCandidateArchives(
            lock,
            lock.version,
            platform,
            root,
            options,
          ),
          /STANDALONE_CANDIDATE_ARCHIVE_INVALID/,
        );
      }
      metadata.set(apiName, api);
      await writeFile(join(root, last), 'changed synthetic bytes');
      await assert.rejects(
        verifiedStandaloneCandidateArchives(
          lock,
          lock.version,
          platform,
          root,
          options,
        ),
        /STANDALONE_CANDIDATE_ARCHIVE_INVALID/,
      );
      await writeFile(
        join(root, last),
        'synthetic-archive-fixture-' + metadata.get(last).name.split('/')[1],
      );
      const missing = structuredClone(lock);
      delete missing.packages['node_modules/@freerdp-bridge/protocol'];
      await assert.rejects(
        verifiedStandaloneCandidateArchives(
          missing,
          lock.version,
          platform,
          root,
          options,
        ),
      );
    } finally {
      assert.equal(dirname(root), resolve(tmpdir()));
      assert.match(basename(root), /^bridge-candidate-archives-[A-Za-z0-9]+$/);
      await rm(root, { recursive: true, force: true });
    }
  });
