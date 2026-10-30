import { isAbsolute } from 'node:path';
import type { HostInventoryRequest } from '@freerdp-bridge/api/fastify';

const classes = [
  'printers',
  'smartcards',
  'serial',
  'parallel',
  'usb',
] as const;
/** Operator CLI only. Refuse every mixed/unknown/implicit selector before runtime resolution. */
export function parseStandaloneInventoryArgs(args: readonly string[]): {
  runtimeRoot: string;
  request: HostInventoryRequest;
} {
  if (
    args.length !== 6 ||
    args[0] !== '--inventory' ||
    args[2] !== '--runtime-root' ||
    args[4] !== '--max-devices' ||
    !args[1] ||
    args[1].length > 64 ||
    !args[3] ||
    !isAbsolute(args[3]) ||
    !args[5] ||
    !/^[1-9][0-9]{0,2}$/.test(args[5])
  )
    throw new Error('STANDALONE_INVENTORY_USAGE');
  const selected = args[1].split(',');
  const maximum = Number(args[5]);
  if (
    selected.length > classes.length ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (value) => !classes.includes(value as (typeof classes)[number]),
    ) ||
    maximum > 128
  )
    throw new Error('STANDALONE_INVENTORY_USAGE');
  return {
    runtimeRoot: args[3],
    request: {
      classes: classes.filter((kind) => selected.includes(kind)),
      maxDevices: maximum,
    },
  };
}
