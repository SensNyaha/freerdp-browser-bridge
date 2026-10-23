import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeBuildOutputs } from '../../scripts/node-build-outputs.mjs';
test('clean build checks every declared library/declaration export and the standalone CLI entry instead of assuming index.js', () => {
  const manifest = {
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './browser': {
        types: './dist/browser.d.ts',
        import: './dist/browser.js',
      },
    },
    scripts: { start: 'node dist/main.js' },
  };
  assert.deepEqual(nodeBuildOutputs(manifest), [
    'dist/browser.d.ts',
    'dist/browser.js',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/main.js',
  ]);
  assert.deepEqual(
    nodeBuildOutputs({
      private: true,
      scripts: { start: 'node dist/main.js' },
    }),
    ['dist/main.js'],
  );
  assert.deepEqual(
    nodeBuildOutputs({ main: './dist/index.js', types: './dist/index.d.ts' }),
    ['dist/index.d.ts', 'dist/index.js'],
  );
});
test('clean build refuses missing output contracts, traversal, noncompiled targets and arbitrary start commands', () => {
  for (const value of [
    {},
    { exports: { '.': '../outside.js' } },
    { exports: { '.': './dist/../outside.js' } },
    { exports: { '.': './src/index.ts' } },
    { exports: { '.': null } },
    { exports: { '.': ['./dist/index.js'] } },
    { scripts: { start: 'node --eval arbitrary' } },
    { scripts: { start: 'node dist/main.js && extra' } },
    {
      exports: Object.fromEntries(
        Array.from({ length: 129 }, (_, i) => ['./x' + i, './dist/index.js']),
      ),
    },
  ])
    assert.throws(
      () => nodeBuildOutputs(value),
      /NODE_BUILD_OUTPUT_CONTRACT_INVALID/,
    );
});
