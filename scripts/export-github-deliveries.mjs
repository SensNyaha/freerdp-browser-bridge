import {
  mkdir,
  mkdtemp,
  copyFile,
  writeFile,
  readFile,
  lstat,
  realpath,
} from 'node:fs/promises';
import { resolve, join, dirname, basename, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { format } from 'prettier';
import {
  owner,
  adapters,
  shared,
  repositoryFor,
  safePath,
  hashFile,
  localFile,
  readJson,
  tarManifest,
  parseManifest,
  verifyArchives,
  verifySources,
  fail,
} from './github-delivery/manifest.mjs';
import { formattedNpmWorkflow } from './github-delivery/templates.mjs';
import { adapterKit } from './github-delivery/adapter-kit.mjs';
import { publicLock } from './github-delivery/lock.mjs';
import { continueDeliveryHistory } from './github-delivery/history.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
let bundle;
try {
  const args = process.argv.slice(2),
    options = new Map();
  const continueHistory = args.at(-1) === '--continue-history';
  if (continueHistory) args.pop();
  if (
    args.length !== 6 ||
    process.versions.node.split('.')[0] !== '24' ||
    (await realpath('.')) !== (await realpath(project))
  )
    fail('DELIVERY_EXPORT_USAGE');
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--tag', '--archives', '--acceptance'].includes(args[index]) ||
      options.has(args[index])
    )
      fail('DELIVERY_EXPORT_USAGE');
    options.set(args[index], args[index + 1]);
  }
  const tag = options.get('--tag');
  if (!/^v0\.2\.(?:0|[1-9][0-9]{0,5})$/.test(tag))
    fail('DELIVERY_EXPORT_TAG_INVALID');
  const version = tag.slice(1),
    acceptance = safePath(options.get('--acceptance'));
  const execute = (
    command,
    commandArgs,
    cwd = project,
    maximum = 4 * 1024 * 1024,
    timeout = 300000,
  ) => {
    const result = spawnSync(command, commandArgs, {
      cwd,
      windowsHide: true,
      timeout,
      maxBuffer: maximum,
    });
    if (result.error || result.status !== 0)
      fail('DELIVERY_EXPORT_COMMAND_FAILED');
    return result.stdout;
  };
  const git = (commandArgs) =>
    execute('git', commandArgs).toString('utf8').trim();
  if (git(['cat-file', '-t', tag]) !== 'tag')
    fail('DELIVERY_ANNOTATED_TAG_REQUIRED');
  const commit = git(['rev-parse', tag + '^{commit}']);
  const sourceManifest = JSON.parse(
    execute('git', ['show', tag + ':package.json']).toString('utf8'),
  );
  if (sourceManifest.version !== version || !sourceManifest.private)
    fail('DELIVERY_EXPORT_VERSION_MISMATCH');
  const report = execute('git', ['show', tag + ':' + acceptance]).toString(
    'utf8',
  );
  const expected = new Map();
  for (const match of report.matchAll(
    /^\| `(@freerdp-bridge\/[a-z0-9-]+)@([^`]+)` \| ([0-9]+) \| `([a-f0-9]{64})` \|$/gm,
  )) {
    if (match[2] !== version || expected.has(match[1]))
      fail('DELIVERY_ACCEPTANCE_REPORT_INVALID');
    expected.set(match[1], { bytes: Number(match[3]), sha256: match[4] });
  }
  const names = [...shared, ...adapters];
  if (
    expected.size !== names.length ||
    names.some((name) => !expected.has('@freerdp-bridge/' + name))
  )
    fail('DELIVERY_ACCEPTANCE_REPORT_INVALID');
  await mkdir('build', { recursive: true });
  const buildInfo = await lstat('build');
  if (!buildInfo.isDirectory() || buildInfo.isSymbolicLink())
    fail('DELIVERY_BUILD_ROOT_INVALID');
  const build = await realpath('build'),
    archives = await realpath(resolve(options.get('--archives')));
  if (
    !archives.startsWith(build + sep) ||
    (await lstat(resolve(options.get('--archives')))).isSymbolicLink() ||
    !/^release-[0-9]{1,6}-archives$/.test(basename(archives))
  )
    fail('DELIVERY_ARCHIVE_ROOT_INVALID');
  const prefix = basename(archives).replace(/-archives$/, '');
  const audit = await readJson(
    dirname(archives),
    prefix + '-artifact-audit.json',
    65536,
  );
  const dry = await readJson(
    dirname(archives),
    prefix + '-npm-dry-run.json',
    65536,
  );
  if (
    audit.packages?.length !== names.length ||
    !Array.isArray(dry) ||
    dry.length !== names.length
  )
    fail('DELIVERY_ACCEPTANCE_AUDIT_INVALID');
  const records = new Map();
  for (const suffix of names) {
    const name = '@freerdp-bridge/' + suffix,
      item = audit.packages.find((item) => item.name === name);
    const archive = 'freerdp-bridge-' + suffix + '-' + version + '.tgz';
    if (
      !item ||
      item.version !== version ||
      item.archive !== archive ||
      !item.readme ||
      item.bytes !== expected.get(name).bytes ||
      item.sha256 !== expected.get(name).sha256 ||
      !dry.some(
        (entry) =>
          entry.name === name &&
          entry.version === version &&
          entry.integrity === 'sha512-' + item.sha512,
      )
    )
      fail('DELIVERY_ACCEPTANCE_AUDIT_INVALID');
    const hash = await hashFile(archives, archive, 128 * 1024 * 1024);
    if (
      hash.bytes !== item.bytes ||
      hash.sha256 !== item.sha256 ||
      hash.integrity !== 'sha512-' + item.sha512
    )
      fail('DELIVERY_ACCEPTED_BYTES_CHANGED');
    const metadata = tarManifest(join(archives, archive));
    if (
      metadata.name !== name ||
      metadata.version !== version ||
      metadata.repository?.type !== 'git' ||
      metadata.repository.url !==
        'git+https://github.com/' + repositoryFor(suffix) + '.git'
    )
      fail('DELIVERY_ACCEPTED_REPOSITORY_CHANGED');
    records.set(name, { name, version, archive, ...hash });
  }
  const tree = execute('git', ['ls-tree', '-rz', '--full-tree', tag])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (tree.length > 4096) fail('DELIVERY_SOURCE_TREE_LIMIT');
  const executables = [];
  for (const row of tree) {
    const match = row.match(/^(100644|100755) blob [a-f0-9]{40}\t(.+)$/);
    if (!match) fail('DELIVERY_SOURCE_TREE_MODE_INVALID');
    safePath(match[2]);
    if (match[1] === '100755') executables.push(match[2]);
  }
  bundle = await mkdtemp(join(build, 'github-delivery-' + version + '-'));
  await mkdir(join(bundle, 'repositories'));
  await mkdir(join(bundle, 'release-assets'));
  await mkdir(join(bundle, 'logs'));
  await mkdir(join(bundle, '.no-hooks'));
  const emptyConfig = join(bundle, 'empty-npm-user-config');
  await writeFile(emptyConfig, '');
  const emptyGlobal = join(bundle, 'empty-npm-global-config');
  await writeFile(emptyGlobal, '');
  const core = join(bundle, 'repositories/freerdp-browser-bridge');
  await mkdir(core);
  const tar = join(bundle, 'source.tar');
  execute('git', ['archive', '--format=tar', '--output=' + tar, tag]);
  execute('tar', ['-xf', tar, '-C', core]);
  const read = async (path) => {
    const file = await localFile(core, path, 4 * 1024 * 1024);
    return readFile(file.path);
  };
  const identity = [];
  for (const key of ['user.name', 'user.email']) {
    const value = git(['config', '--get', key]);
    if (!value || value.length > 256 || /[\r\n\0]/.test(value))
      fail('DELIVERY_GIT_IDENTITY_REQUIRED');
    identity.push('-c', key + '=' + value);
  }
  const localGit = (root, commandArgs) =>
    execute(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgSign=false',
        '-c',
        'core.hooksPath=' + join(bundle, '.no-hooks'),
        ...identity,
        ...commandArgs,
      ],
      root,
    )
      .toString('utf8')
      .trim();
  const runLogged = async (
    label,
    command,
    commandArgs,
    cwd,
    timeout = 300000,
  ) => {
    const taskEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => name.toLowerCase() !== 'path',
      ),
    );
    taskEnvironment.PATH = [
      dirname(process.execPath),
      ...(process.platform === 'win32'
        ? [join(project, '.tools/node_modules/.bin')]
        : []),
      process.env.PATH ?? process.env.Path ?? '',
    ].join(delimiter);
    const result = spawnSync(command, commandArgs, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...taskEnvironment,
        NPM_CONFIG_USERCONFIG: emptyConfig,
        NPM_CONFIG_GLOBALCONFIG: emptyGlobal,
        CI: 'true',
      },
    });
    await writeFile(
      join(bundle, 'logs/' + label + '.log'),
      (result.stdout ?? '') + (result.stderr ?? ''),
    );
    if (result.error || result.status !== 0) fail('DELIVERY_VALIDATION_FAILED');
    console.log(JSON.stringify({ checked: label, passed: true }));
  };
  const npm = resolve(
    dirname(process.execPath),
    process.platform === 'win32'
      ? 'node_modules/npm/bin/npm-cli.js'
      : '../lib/node_modules/npm/bin/npm-cli.js',
  );
  const npmFlags = [
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--logs-max=0',
    '--fetch-timeout=30000',
    '--fetch-retries=1',
    '--registry=https://registry.npmjs.org/',
    '--@freerdp-bridge:registry=https://registry.npmjs.org/',
  ];
  const exported = [];
  for (const kind of ['core', ...adapters]) {
    const repository =
      kind === 'core' ? owner + '/freerdp-browser-bridge' : repositoryFor(kind);
    const short = repository.split('/')[1],
      root = kind === 'core' ? core : join(bundle, 'repositories', short);
    if (kind !== 'core') await mkdir(root);
    const write = async (path, bytes) => {
      safePath(path);
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), bytes);
    };
    const selected = (kind === 'core' ? shared : [kind]).map((suffix) =>
      records.get('@freerdp-bridge/' + suffix),
    );
    let privateManifest;
    if (kind !== 'core') {
      const archive = join(archives, selected[0].archive);
      privateManifest = await adapterKit({
        kind,
        version,
        core,
        read,
        write,
        archiveFile: (path) =>
          execute('tar', ['-xOf', archive, path], project, 1024 * 1024, 30000),
      });
    }
    let attributes = '';
    try {
      attributes = (await readFile(join(root, '.gitattributes'))).toString(
        'utf8',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await write(
      '.gitattributes',
      attributes +
        '\n# Preserve the accepted source bytes on every checkout platform.\n* -text\n',
    );
    for (const file of [
      'manifest.mjs',
      'publish.mjs',
      'fetch.mjs',
      'run.mjs',
      'compare-compiled.mjs',
      'native-smoke.mjs',
    ])
      await write(
        'release-tools/' + file,
        await readFile(join(project, 'scripts/github-delivery', file)),
      );
    const guard = (
      await readFile('tests/unit/github-delivery.test.mjs', 'utf8')
    ).replaceAll('../../scripts/github-delivery/', './');
    await write(
      'release-tools/guards.test.mjs',
      await format(guard, {
        parser: 'babel',
        singleQuote: true,
        trailingComma: 'all',
      }),
    );
    await write(
      '.github/workflows/npm-publish.yml',
      await formattedNpmWorkflow(kind),
    );
    await write(
      'DELIVERY.md',
      `# Accepted ${version} delivery\n\nUpstream: ${tag}, ${commit}. GitHub: ${repository}.\n\nPush main and the annotated ${tag} tag with an ordinary fast-forward push. Preserve existing public history and immutable tags.\n\nThe exact accepted archives stay in the sibling release-assets folder, outside Git. After the repository/workflow exists, configure npm Trusted Publishing with owner SensNyaha, this repository and npm-publish.yml, allowing direct npm publish. Then upload the checked assets through the bootstrap release helper. No manual per-package publishing token is used by CI.\n\nCore must be public before adapter workflows install their exact core dependencies. HTTP precedes Express. New Express-name bootstrap and the seven old 0.2.3 stages remain separate owner interactions; do not start manual approval loops automatically.\n\nWorkflow validation is distinct from the original native/compiler and actual desktop/device acceptance. A local export does not prove hosted OIDC or public availability.\n`,
    );
    if (kind !== 'core') {
      const temporary = structuredClone(privateManifest),
        overrides = {};
      const self = '@freerdp-bridge/' + kind;
      for (const [name, item] of records)
        if (name !== self)
          overrides[name] =
            'file:' + join(archives, item.archive).replaceAll('\\', '/');
      for (const field of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
      ])
        for (const name of Object.keys(temporary[field] ?? {}))
          if (overrides[name]) temporary[field][name] = overrides[name];
      temporary.overrides = overrides;
      try {
        await write('package.json', JSON.stringify(temporary, null, 2) + '\n');
        await runLogged(
          kind + '-bootstrap-install',
          process.execPath,
          ['--use-system-ca', npm, 'install', ...npmFlags],
          root,
        );
      } finally {
        await write(
          'package.json',
          JSON.stringify(privateManifest, null, 2) + '\n',
        );
      }
      const lock = publicLock(
        await readJson(root, 'package-lock.json'),
        privateManifest,
        records,
        self,
      );
      await write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
    }
    const parent = continueHistory
      ? continueDeliveryHistory(root, repository, version, {
          run: (args) => localGit(root, args),
        })
      : undefined;
    if (!continueHistory) {
      localGit(root, ['init', '--quiet']);
      localGit(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    }
    localGit(root, ['add', '--all', '.']);
    if (kind === 'core')
      for (const path of executables)
        localGit(root, ['update-index', '--chmod=+x', path]);
    const paths = execute('git', ['ls-files', '-z'], root)
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .sort();
    if (!paths.length || paths.length > 4096)
      fail('DELIVERY_EXPORT_SOURCE_LIMIT');
    const sources = [];
    for (const path of paths) {
      const hash = await hashFile(root, path, 4 * 1024 * 1024);
      sources.push({ path, bytes: hash.bytes, sha256: hash.sha256 });
    }
    const manifest = parseManifest({
      schema: 1,
      kind,
      version,
      repository,
      upstream: { tag, commit, acceptance },
      packages: selected,
      sources,
    });
    await write(
      '.delivery/release.json',
      JSON.stringify(manifest, null, 2) + '\n',
    );
    localGit(root, ['add', '.delivery/release.json']);
    localGit(root, [
      'commit',
      '--quiet',
      '-m',
      'Import accepted ' + version + ' source and exact release inputs',
    ]);
    if (!continueHistory)
      localGit(root, [
        'remote',
        'add',
        'origin',
        'https://github.com/' + repository + '.git',
      ]);
    await verifySources(root, manifest);
    const payload = join(bundle, 'release-assets', short, tag);
    await mkdir(payload, { recursive: true });
    const localAssets = join(root, 'build/delivery-assets');
    await mkdir(localAssets, { recursive: true });
    for (const item of selected) {
      await copyFile(join(archives, item.archive), join(payload, item.archive));
      await copyFile(
        join(archives, item.archive),
        join(localAssets, item.archive),
      );
    }
    await copyFile(
      join(root, '.delivery/release.json'),
      join(payload, 'delivery-manifest.json'),
    );
    await copyFile(
      join(root, '.delivery/release.json'),
      join(localAssets, 'delivery-manifest.json'),
    );
    await verifyArchives(payload, manifest);
    await runLogged(
      kind + '-guards',
      process.execPath,
      ['--test', 'release-tools/guards.test.mjs'],
      root,
    );
    if (kind === 'core') {
      const pnpm =
        process.platform === 'win32'
          ? [
              process.execPath,
              [join(project, '.tools/node_modules/pnpm/bin/pnpm.cjs')],
            ]
          : ['pnpm', []];
      await runLogged(
        'core-install',
        pnpm[0],
        [
          ...pnpm[1],
          'install',
          '--offline',
          '--frozen-lockfile',
          '--ignore-scripts',
        ],
        root,
      );
      await runLogged('core-build', pnpm[0], [...pnpm[1], 'build'], root);
      await runLogged(
        'core-native-smoke',
        process.execPath,
        ['release-tools/native-smoke.mjs'],
        root,
      );
    } else {
      await runLogged(
        kind + '-public-lock-offline',
        process.execPath,
        ['--use-system-ca', npm, 'ci', '--offline', ...npmFlags],
        root,
      );
      for (const script of ['build', 'check:types', 'test'])
        await runLogged(
          kind + '-' + script.replace(':', '-'),
          process.execPath,
          [npm, 'run', script],
          root,
        );
      await runLogged(
        kind + '-compiled',
        process.execPath,
        ['release-tools/compare-compiled.mjs'],
        root,
      );
    }
    await verifySources(root, manifest);
    localGit(root, [
      'tag',
      '-a',
      tag,
      '-m',
      'Accepted ' +
        version +
        ' delivery source; public publication is separate',
    ]);
    exported.push({
      kind,
      repository,
      ...(parent ? { parent } : {}),
      directory: 'repositories/' + short,
      assets: 'release-assets/' + short + '/' + tag,
      commit: localGit(root, ['rev-parse', 'HEAD']),
      packages: selected.map((item) => item.name),
      locallyVerified: true,
    });
    await writeFile(
      join(bundle, 'delivery-bundle.json'),
      JSON.stringify(
        {
          schema: 1,
          version,
          upstream: commit,
          completed: exported.length === 5,
          remotePublished: false,
          repositories: exported,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      JSON.stringify({
        repository,
        locallyVerified: true,
        remotePublished: false,
      }),
    );
  }
  console.log(
    JSON.stringify({
      directory: bundle,
      repositories: exported.length,
      exactAcceptedArchives: records.size,
      locallyVerified: true,
      remotePublished: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      code: /^[A-Z][A-Z0-9_]{1,63}$/.test(error?.code ?? '')
        ? error.code
        : 'DELIVERY_EXPORT_FAILED',
      ...(bundle ? { partialDirectory: bundle } : {}),
    }),
  );
  process.exitCode = 1;
}
