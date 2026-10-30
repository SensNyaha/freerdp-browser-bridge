import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareReleaseVersions } from './github-delivery/manifest.mjs';

const kinds = ['http', 'express', 'fastify', 'nestjs'];
const invalid = () => new Error('INVENTORY_CONSUMER_INVALID');
export function inventoryConsumerArguments(input, version) {
  if (
    !Array.isArray(input) ||
    input.some((value) => typeof value !== 'string') ||
    input.filter((value) => value === '--host-inventory').length > 1
  )
    throw invalid();
  return {
    args: input.filter((value) => value !== '--host-inventory'),
    hostInventory:
      compareReleaseVersions(version, '0.7.0') >= 0 ||
      input.includes('--host-inventory'),
  };
}
export function inventoryConsumerTypes(kind) {
  if (!kinds.includes(kind)) throw invalid();
  return `import { discoverHostDevices, resolveNativeRuntime, type HostInventoryRequest, type HostInventoryReport, type NativeRuntimeOptions } from '@freerdp-bridge/${kind}';
const request: HostInventoryRequest = { classes: ['usb'], maxDevices: 3 };
async function collect(options: NativeRuntimeOptions): Promise<HostInventoryReport> {
  return discoverHostDevices(await resolveNativeRuntime(options), request);
}
void collect;
`;
}
export async function prepareInventoryConsumer(directory, kind) {
  const types = inventoryConsumerTypes(kind);
  const path = join(directory, 'tsconfig.json');
  const config = JSON.parse(await readFile(path, 'utf8'));
  if (
    !Array.isArray(config.include) ||
    config.include.length > 16 ||
    !config.include.includes('consumer.ts') ||
    config.include.includes('host-inventory.ts')
  )
    throw invalid();
  await copyFile(
    new URL('../tests/fixtures/package-host-inventory.mjs', import.meta.url),
    join(directory, 'host-inventory.mjs'),
  );
  await writeFile(join(directory, 'host-inventory.ts'), types);
  config.include.push('host-inventory.ts');
  await writeFile(path, JSON.stringify(config, null, 2) + '\n');
}
