import { spawnSync } from 'node:child_process';
import {
  owner,
  adapters,
  repositoryFor,
  fail,
  isReleaseVersion,
} from './manifest.mjs';

/** Import a new accepted tree as a child of the existing public main. No push. */
export function continueDeliveryHistory(
  root,
  repository,
  version,
  {
    run = (args) => {
      const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 65536,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      if (result.error || result.status !== 0)
        fail('DELIVERY_HISTORY_READ_FAILED');
      return result.stdout.trim();
    },
  } = {},
) {
  const allowed = new Set([
    owner + '/freerdp-browser-bridge',
    ...adapters.map(repositoryFor),
  ]);
  if (!allowed.has(repository) || !isReleaseVersion(version))
    fail('DELIVERY_HISTORY_TARGET_INVALID');
  run(['init', '--quiet']);
  run(['symbolic-ref', 'HEAD', 'refs/heads/main']);
  run(['remote', 'add', 'origin', 'https://github.com/' + repository + '.git']);
  if (run(['ls-remote', '--refs', 'origin', 'refs/tags/v' + version]))
    fail('DELIVERY_HISTORY_TAG_ALREADY_EXISTS');
  run([
    'fetch',
    '--quiet',
    '--no-tags',
    'origin',
    'refs/heads/main:refs/remotes/origin/main',
  ]);
  const parent = run(['rev-parse', 'refs/remotes/origin/main']);
  if (!/^[a-f0-9]{40}$/.test(parent)) fail('DELIVERY_HISTORY_PARENT_INVALID');
  run(['update-ref', 'refs/heads/main', parent]);
  // Populate only HEAD/index. The newly exported files remain on disk; add -A
  // will also stage removals of files no longer present in the accepted tree.
  run(['reset', '--mixed', '--quiet', parent]);
  return parent;
}
