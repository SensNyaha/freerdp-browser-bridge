import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import {
  nativeBuildProfile,
  readNativeBuildProfile,
} from '../../scripts/native-build-profile.mjs';

function inputs(id = 'Clang', version = '18.0.1') {
  return {
    index: {
      cmake: { version: { string: '3.28.3' }, generator: { name: 'Ninja' } },
      reply: { 'toolchains-v1': { kind: 'toolchains', version: { major: 1 } } },
    },
    toolchains: {
      kind: 'toolchains',
      version: { major: 1, minor: 0 },
      toolchains: [
        {
          language: 'CXX',
          compiler: { id, version, path: resolve('compiler/c++') },
        },
      ],
    },
    cache: 'CMAKE_BUILD_TYPE:STRING=Debug\n',
  };
}

test('native build profile records the actual C++ compiler and CMake without implicit toolchain details', () => {
  for (const [id, version] of [
    ['GNU', '12.4.0'],
    ['Clang', '18.0.1'],
    ['MSVC', '19.44.35224.0'],
  ]) {
    const { index, toolchains, cache } = inputs(id, version);
    toolchains.toolchains.unshift({ language: 'C', compiler: { id: 'other' } });
    toolchains.toolchains[1].compiler.implicit = {
      includeDirectories: ['unused'],
    };
    assert.deepEqual(nativeBuildProfile(index, toolchains, cache, 'Debug'), {
      v: 1,
      buildType: 'Debug',
      generator: 'Ninja',
      cmakeVersion: '3.28.3',
      compiler: { id, version, path: resolve('compiler/c++') },
    });
  }
});

test('native build profile distinguishes requested Debug and existing Release configurations', () => {
  const { index, toolchains } = inputs();
  assert.throws(
    () =>
      nativeBuildProfile(
        index,
        toolchains,
        'CMAKE_BUILD_TYPE:STRING=Release\n',
        'Debug',
      ),
    /profile is incomplete/,
  );
  assert.equal(
    nativeBuildProfile(
      index,
      toolchains,
      'CMAKE_BUILD_TYPE:STRING=Release\r\n',
      'Release',
    ).buildType,
    'Release',
  );
  assert.throws(
    () =>
      nativeBuildProfile(
        index,
        toolchains,
        'CMAKE_BUILD_TYPE:STRING=Debug\nCMAKE_BUILD_TYPE:STRING=Release\n',
        'Debug',
      ),
    /profile is incomplete/,
  );
});

test('native build profile requires a complete versioned CXX reply rather than a different language or generator', () => {
  for (const change of [
    ({ index }) => {
      index.reply = {};
    },
    ({ index }) => {
      index.cmake.generator.name = 'Unix Makefiles';
    },
    ({ toolchains }) => {
      toolchains.version.major = 2;
    },
    ({ toolchains }) => {
      toolchains.toolchains[0].language = 'C';
    },
    ({ toolchains }) => {
      toolchains.toolchains.push(toolchains.toolchains[0]);
    },
    ({ toolchains }) => {
      delete toolchains.toolchains[0].compiler.version;
    },
    ({ toolchains }) => {
      toolchains.toolchains[0].compiler.path = 'relative/c++';
    },
  ]) {
    const data = inputs();
    change(data);
    assert.throws(
      () =>
        nativeBuildProfile(data.index, data.toolchains, data.cache, 'Debug'),
      /profile is incomplete/,
    );
  }
});

test('native build profile reader follows the newest CMake reply without falling back to stale compiler evidence', async () => {
  const root = await mkdtemp(resolve('build/native-profile-test-'));
  try {
    const reply = resolve(root, '.cmake/api/v1/reply');
    await mkdir(reply, { recursive: true });
    await writeFile(
      resolve(root, 'CMakeCache.txt'),
      'CMAKE_BUILD_TYPE:STRING=Debug\n',
    );
    for (const [sequence, version] of [
      ['001', '12.4.0'],
      ['002', '18.0.1'],
    ]) {
      const { index, toolchains } = inputs('Clang', version);
      const name = 'toolchains-v1-' + sequence + '.json';
      index.reply['toolchains-v1'].jsonFile = name;
      await writeFile(resolve(reply, name), JSON.stringify(toolchains));
      await writeFile(
        resolve(reply, 'index-' + sequence + '.json'),
        JSON.stringify(index),
      );
    }
    assert.equal(
      (await readNativeBuildProfile(root, 'Debug')).compiler.version,
      '18.0.1',
    );
    await writeFile(
      resolve(reply, 'index-003.json'),
      JSON.stringify({ reply: {} }),
    );
    await assert.rejects(
      readNativeBuildProfile(root, 'Debug'),
      /profile is incomplete/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
