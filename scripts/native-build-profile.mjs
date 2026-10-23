import { lstat, readFile, opendir } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

const failure = () => new Error('Native CMake build profile is incomplete');
const scalar = (value, maximum) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximum &&
  !/[\u0000-\u001f\u007f]/u.test(value);

export function nativeBuildProfile(
  index,
  toolchains,
  cache,
  expectedBuildType,
) {
  const reference = index?.reply?.['toolchains-v1'];
  const compilers = toolchains?.toolchains;
  if (typeof cache !== 'string' || cache.length > 1048576) throw failure();
  let configuredType;
  for (const entry of cache.matchAll(/^CMAKE_BUILD_TYPE:STRING=(.*)\r?$/gm)) {
    if (configuredType !== undefined) throw failure();
    configuredType = entry[1].trim();
  }
  if (
    reference?.kind !== 'toolchains' ||
    reference.version?.major !== 1 ||
    toolchains?.kind !== 'toolchains' ||
    toolchains.version?.major !== 1 ||
    !Array.isArray(compilers) ||
    compilers.length > 32 ||
    !['Debug', 'Release'].includes(expectedBuildType) ||
    configuredType !== expectedBuildType ||
    !scalar(index?.cmake?.version?.string, 64) ||
    index?.cmake?.generator?.name !== 'Ninja'
  )
    throw failure();
  const cpp = compilers.filter((entry) => entry?.language === 'CXX');
  const compiler = cpp[0]?.compiler;
  if (
    cpp.length !== 1 ||
    !scalar(compiler?.id, 64) ||
    !scalar(compiler?.version, 64) ||
    !scalar(compiler?.path, 4096) ||
    !isAbsolute(compiler.path)
  )
    throw failure();
  return {
    v: 1,
    buildType: expectedBuildType,
    generator: 'Ninja',
    cmakeVersion: index.cmake.version.string,
    compiler: {
      id: compiler.id,
      version: compiler.version,
      path: compiler.path,
    },
  };
}

async function bounded(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576)
    throw failure();
  return readFile(path, 'utf8');
}

export async function readNativeBuildProfile(binary, expectedBuildType) {
  const reply = resolve(binary, '.cmake/api/v1/reply');
  let latest = '',
    count = 0;
  for await (const entry of await opendir(reply)) {
    if (++count > 512) throw failure();
    if (
      entry.isFile() &&
      entry.name.startsWith('index-') &&
      entry.name.endsWith('.json') &&
      entry.name > latest
    )
      latest = entry.name;
  }
  if (!latest) throw failure();
  const index = JSON.parse(await bounded(resolve(reply, latest)));
  const reference = index?.reply?.['toolchains-v1']?.jsonFile;
  if (
    !scalar(reference, 256) ||
    basename(reference) !== reference ||
    reference.includes('\\') ||
    !reference.endsWith('.json')
  )
    throw failure();
  const toolchains = JSON.parse(await bounded(resolve(reply, reference)));
  const cache = await bounded(resolve(binary, 'CMakeCache.txt'));
  return nativeBuildProfile(index, toolchains, cache, expectedBuildType);
}
