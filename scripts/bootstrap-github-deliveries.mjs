import { resolve } from 'node:path';
import { loadBundle } from './github-delivery/bundle.mjs';
import {
  bootstrapRelease,
  releaseNotes,
  requirePublic,
} from './github-delivery/bootstrap.mjs';
import { adapters, fail } from './github-delivery/manifest.mjs';

try {
  const args = process.argv.slice(2);
  if (
    ![4, 5].includes(args.length) ||
    args[0] !== '--bundle' ||
    args[2] !== '--kind' ||
    !['all', 'core', ...adapters].includes(args[3]) ||
    (args.length === 5 && args[4] !== '--execute') ||
    process.versions.node.split('.')[0] !== '24'
  )
    fail('DELIVERY_BOOTSTRAP_USAGE');
  const bundle = await loadBundle(resolve(args[1])),
    execute = args.length === 5;
  const completed = [];
  for (const item of bundle.repositories) {
    if (args[3] !== 'all' && item.kind !== args[3]) continue;
    if (!execute) {
      console.log(
        JSON.stringify({
          repository: item.repository,
          commit: item.commit,
          tag: item.manifest.upstream.tag,
          files: item.files.map((file) => file.name),
          dryRun: true,
          remoteContacted: false,
        }),
      );
      continue;
    }
    if (item.kind !== 'core') {
      const predecessors = bundle.repositories.filter(
        (other) =>
          other.kind === 'core' ||
          (item.kind === 'express' && other.kind === 'http'),
      );
      await requirePublic(
        predecessors.flatMap((other) => other.manifest.packages),
      );
    }
    console.log(
      JSON.stringify(
        await bootstrapRelease(item, {
          notes: await releaseNotes(bundle, item),
        }),
      ),
    );
    completed.push(item.kind);
    // GitHub starts asynchronous CI. A subsequent invocation is read-first and
    // idempotent; never upload dependent releases before exact npm bytes exist.
  }
  console.log(
    JSON.stringify({
      dryRun: !execute,
      submitted: completed,
      npmPublicationVerified: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code ?? '')
        ? error.code
        : 'DELIVERY_BOOTSTRAP_FAILED',
    }),
  );
  process.exitCode = 1;
}
