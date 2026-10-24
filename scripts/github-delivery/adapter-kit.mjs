import { opendir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { adapters, fail } from './manifest.mjs';

export async function adapterKit({
  kind,
  version,
  core,
  read,
  write,
  archiveFile,
}) {
  if (!adapters.includes(kind)) fail('DELIVERY_KIND_INVALID');
  const name = '@freerdp-bridge/' + kind;
  for (const file of ['package.json', 'README.md', 'LICENSE'])
    await write('package/' + file, archiveFile('package/' + file));
  let count = 0;
  async function copySource(relative, depth = 0) {
    if (depth > 8) fail('DELIVERY_ADAPTER_SOURCE_LIMIT');
    for await (const entry of await opendir(
      join(core, 'packages', kind, relative),
    )) {
      if (++count > 128 || entry.isSymbolicLink())
        fail('DELIVERY_ADAPTER_SOURCE_LIMIT');
      const path = relative + '/' + entry.name;
      if (entry.isDirectory()) await copySource(path, depth + 1);
      else if (entry.isFile())
        await write(
          'package/' + path,
          await read('packages/' + kind + '/' + path),
        );
      else fail('DELIVERY_ADAPTER_SOURCE_INVALID');
    }
  }
  await copySource('src');
  const config = JSON.parse(
    (await read('packages/' + kind + '/tsconfig.json')).toString('utf8'),
  );
  config.extends = '../tsconfig.base.json';
  delete config.references;
  await write('package/tsconfig.json', JSON.stringify(config, null, 2) + '\n');
  await write('tsconfig.base.json', await read('tsconfig.base.json'));
  await write('LICENSE', archiveFile('package/LICENSE'));
  const host =
    kind === 'nestjs'
      ? {
          '@nestjs/common': '12.2.0',
          '@nestjs/core': '12.2.0',
          '@nestjs/platform-express': '12.2.0',
          '@nestjs/platform-fastify': '12.2.0',
          'reflect-metadata': '0.2.2',
          rxjs: '7.8.2',
        }
      : kind === 'fastify'
        ? { fastify: '5.12.5', '@freerdp-bridge/protocol': version }
        : kind === 'express'
          ? { express: '5.3.0' }
          : {};
  const manifest = {
    name: 'freerdp-bridge-' + kind + '-delivery',
    version,
    private: true,
    type: 'module',
    license: 'MIT',
    engines: { node: '>=24 <25' },
    workspaces: ['package'],
    scripts: {
      build: 'npm run build --workspace ' + name,
      'check:types': 'tsc -p tests/tsconfig.json',
      test:
        kind === 'fastify'
          ? 'node tests/consumer.mjs --package-runtime'
          : 'node --test tests/consumer.test.mjs',
    },
    dependencies: { [name]: 'file:./package' },
    devDependencies: {
      ...host,
      ws: '8.22.0',
      typescript: '5.9.3',
      '@types/node': '24.10.0',
    },
    optionalDependencies: {
      '@freerdp-bridge/runtime-win32-x64': version,
      '@freerdp-bridge/runtime-linux-x64-gnu': version,
    },
  };
  await write('package.json', JSON.stringify(manifest, null, 2) + '\n');
  await write(
    '.gitignore',
    'node_modules/\ndist/\nbuild/\n.tools/\n*.tsbuildinfo\n*.log\n.env\n.env.*\n',
  );
  await write(
    'tests/tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    ) + '\n',
  );
  const fixture =
    kind === 'fastify' ? 'fastify' : kind === 'nestjs' ? 'nestjs' : kind;
  await write(
    'tests/consumer.ts',
    await read('tests/fixtures/' + fixture + '-package-consumer.ts'),
  );
  await write(
    'tests/tls-fixture.mjs',
    await read('tests/fixtures/rdp-tls.mjs'),
  );
  await write(
    'tests/browser-port.mjs',
    await read('tests/fixtures/browser-port.mjs'),
  );
  if (kind === 'fastify')
    await write(
      'tests/consumer.mjs',
      await read('tests/fixtures/fastify-package-consumer.mjs'),
    );
  else {
    const path =
      kind === 'nestjs'
        ? 'tests/integration/nestjs-module.test.mjs'
        : 'tests/integration/' + kind + '-adapter.test.mjs';
    let fixture = (await read(path)).toString('utf8');
    fixture = fixture
      .replace('../../packages/' + kind + '/dist/index.js', name)
      .replace('../fixtures/session-worker.mjs', './session-worker.mjs')
      .replace('../fixtures/rdp-tls.mjs', './tls-fixture.mjs')
      .replace('../fixtures/browser-port.mjs', './browser-port.mjs')
      .replace(
        /new URL\(\s*'\.\.\/\.\.\/apps\/bridge-api\/package.json',\s*import.meta.url,?\s*\)/,
        "import.meta.resolve('@freerdp-bridge/api/fastify')",
      );
    const start = fixture.indexOf('const workerPath = resolve('),
      end = fixture.indexOf('const linked =', start);
    if (start < 0 || end <= start || end - start > 1024)
      fail('DELIVERY_ADAPTER_FIXTURE_INVALID');
    fixture =
      "import { resolveNativeRuntime } from '" +
      name +
      "';\n" +
      fixture.slice(0, start) +
      "const workerPath = (await resolveNativeRuntime({ runtimeRoot: resolve('build/unused-resolver-root') })).workerPath;\n" +
      fixture.slice(end);
    fixture = fixture.replace(
      "const origin = 'https://app.example.test';",
      "if (!linked) throw Error('DELIVERY_LINKED_NATIVE_REQUIRED');\nconst origin = 'https://app.example.test';",
    );
    fixture += `\ntest('Delivery browser assets resolve from installed core without checkout paths', async () => {
  const { referenceBrowserDirectory } = await import('${name}/browser');
  const { readFile, realpath } = await import('node:fs/promises');
  const directory = await realpath(referenceBrowserDirectory);
  assert.ok(directory.startsWith(await realpath('node_modules')));
  for (const file of ['index.html', 'viewer.js']) {
    const bytes = await readFile(join(directory, file));
    assert.ok(bytes.length > 0 && bytes.length <= 131072);
  }
});\n`;
    if (
      /from ['"]\.\.\//.test(fixture) ||
      fixture.includes('../../apps/bridge-api')
    )
      fail('DELIVERY_ADAPTER_CHECKOUT_IMPORT');
    await write('tests/consumer.test.mjs', fixture);
    await write(
      'tests/session-worker.mjs',
      await read('tests/fixtures/session-worker.mjs'),
    );
  }
  const target = kind === 'http' ? 'NODE_HTTP' : kind.toUpperCase();
  const docs = new Set([
    'docs/' + target + '_PLUGIN.md',
    'docs/' + target + '_USAGE.md',
    'docs/HOST_AUTHENTICATION.md',
    'docs/NATIVE_NPM_RUNTIME.md',
    'docs/NPM_PUBLISHING.md',
    'docs/NPM_TRUSTED_PUBLISHING.md',
    'docs/FRAMEWORK_SELECTION.md',
    'docs/ITERATION_438.md',
  ]);
  for (const path of docs) {
    let text = (await read(path)).toString('utf8');
    text = text.replace(/\]\(([^)]+)\)/g, (match, target) => {
      if (/^(?:[a-z]+:|#|\/)/i.test(target)) return match;
      const [file, ...fragments] = target.split('#');
      const normalized = posix.normalize(posix.join(posix.dirname(path), file));
      if (normalized.startsWith('../') || docs.has(normalized)) return match;
      return (
        '](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v' +
        version +
        '/' +
        encodeURI(normalized) +
        (fragments.length ? '#' + fragments.join('#') : '') +
        ')'
      );
    });
    await write(path, text);
  }
  const fence = String.fromCharCode(96).repeat(3);
  const hostInstall =
    kind === 'fastify'
      ? 'fastify@5.12.5 '
      : kind === 'express'
        ? 'express@5.3.0 '
        : kind === 'nestjs'
          ? '@nestjs/common@12.2.0 @nestjs/core@12.2.0 @nestjs/platform-express@12.2.0 reflect-metadata@0.2.2 rxjs@7.8.2 '
          : '';
  await write(
    'README.md',
    `# ${name}\n\nThis repository contains the ${version} library source under package/ and its independent Node.js 24 test harness.\n\nInstall the published library and an explicit native runtime for the server OS. Shared JS modules install transitively.\n\n${fence}sh\nnpm install ${hostInstall}${name}@${version} @freerdp-bridge/runtime-linux-x64-gnu@${version}\n${fence}\n\nWindows x64 selects runtime-win32-x64 of the same version. Public availability is a separate release gate; do not infer it from this source version.\n\n[Full project guide](docs/${target}_USAGE.md), [interface](docs/${target}_PLUGIN.md), [identity/Cookie boundaries](docs/HOST_AUTHENTICATION.md).\n\n## Development\n\nAfter the exact core dependencies are public, run npm ci, npm run build, npm run check:types and npm test. The private root manifest supplies host/test tools and OS-selected optional native packages; the published package metadata remains in package/package.json.\n\nThe test harness distinguishes fake media from actual native TLS/lifecycle. Real desktop and device acceptance is recorded separately in the release evidence. Each RDP session still owns one native worker; FreeRDP does not run inside Node.\n\n## Release\n\nSee DELIVERY.md. The workflow publishes the exact accepted archive from GitHub Releases using OIDC, after Windows/Linux checks and compiled-file comparison. No native tarball or npm credential is stored in Git.\n\n## License\n\nMIT for this adapter; native runtimes carry their own licenses/notices and corresponding source companions.\n`,
  );
  return manifest;
}
