import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'prettier';
import {
  publicLock,
  publicTarballUrl,
} from '../../scripts/github-delivery/lock.mjs';
import { npmWorkflow } from '../../scripts/github-delivery/templates.mjs';

test('Delivery public lock keeps accepted integrity and replaces only private bootstrap resolutions', () => {
  const integrity = 'sha512-' + Buffer.alloc(64, 2).toString('base64');
  const self = '@freerdp-bridge/express',
    dependency = '@freerdp-bridge/http';
  const records = new Map(
    [self, dependency].map((name) => [
      name,
      { name, version: '0.2.4', integrity },
    ]),
  );
  const intended = {
    name: 'delivery-fixture',
    version: '0.2.4',
    private: true,
    workspaces: ['package'],
    dependencies: { [self]: 'file:./package' },
    devDependencies: { typescript: '5.9.3' },
  };
  const input = {
    name: intended.name,
    version: intended.version,
    lockfileVersion: 3,
    packages: {
      '': {
        name: intended.name,
        version: intended.version,
        dependencies: { ...intended.dependencies },
      },
      package: {
        name: self,
        version: intended.version,
        dependencies: { [dependency]: '0.2.4' },
      },
      ['node_modules/' + self]: { resolved: 'package', link: true },
      ['node_modules/' + dependency]: {
        version: '0.2.4',
        resolved: 'file:/private/bootstrap/http.tgz',
        integrity,
      },
      'node_modules/typescript': {
        version: '5.9.3',
        resolved:
          'https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz',
        integrity,
      },
    },
  };
  const output = publicLock(input, intended, records, self);
  assert.equal(
    output.packages['node_modules/' + dependency].resolved,
    'https://registry.npmjs.org/@freerdp-bridge/http/-/http-0.2.4.tgz',
  );
  assert.equal(
    output.packages['node_modules/' + dependency].integrity,
    integrity,
  );
  assert.equal(output.packages['node_modules/' + self].resolved, 'package');
  assert.equal(
    input.packages['node_modules/' + dependency].resolved,
    'file:/private/bootstrap/http.tgz',
  );
  assert.equal(JSON.stringify(output).includes('/private/bootstrap'), false);
  for (const change of [
    (value) =>
      (value.packages['node_modules/' + dependency].integrity =
        'sha512-different'),
    (value) => (value.packages['node_modules/' + dependency].version = '0.2.3'),
    (value) => (value.packages['node_modules/' + self].resolved = '../package'),
    (value) =>
      (value.packages['node_modules/typescript'].resolved =
        'file:/private/typescript.tgz'),
    (value) =>
      (value.packages['node_modules/typescript'].resolved =
        'https://private:secret@registry.npmjs.org/typescript.tgz'),
    (value) => (value.packages.package.dependencies[dependency] = '^0.2.3'),
  ]) {
    const corrupted = structuredClone(input);
    change(corrupted);
    assert.throws(
      () => publicLock(corrupted, intended, records, self),
      (error) => /^DELIVERY_LOCK_/.test(error.code),
    );
  }
  assert.throws(() => publicTarballUrl('@another/http', '0.2.4'));
});

test('Delivery workflow templates parse as YAML for every supported kind and refuse unknown delivery types', async () => {
  for (const kind of ['core', 'fastify', 'nestjs', 'http', 'express']) {
    const source = npmWorkflow(kind);
    const yaml = await format(source, { parser: 'yaml' });
    assert.ok(yaml.length > 1000);
    assert.ok(yaml.includes('id-token: write'));
    assert.equal(yaml.includes('NODE_AUTH_TOKEN:'), false);
    assert.equal(yaml.includes('NPM_TOKEN:'), false);
    assert.ok(yaml.includes('cancel-in-progress: false'));
    assert.ok(yaml.includes('node --test release-tools/guards.test.mjs'));
  }
  assert.throws(
    () => npmWorkflow('unaccepted-framework'),
    (error) => error.code === 'DELIVERY_KIND_INVALID',
  );
});
