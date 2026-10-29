import { ProtocolError } from './index.js';
import { validFileName } from './files.js';

export const MAX_CONFIGURE_BYTES = 16384;
export const MAX_MANAGED_DRIVES = 32;
const DOS_NAME_BYTES = 7;
export interface ManagedDriveDescriptor {
  name: string;
  subdir: string;
  readOnly: boolean;
}
/** Fixed session-relative policy; never accept host paths or raw addin argv. */
export function managedDriveDescriptors(
  value: unknown,
): ManagedDriveDescriptor[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_MANAGED_DRIVES
  )
    throw new ProtocolError();
  const keys = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new ProtocolError();
    const d = item as Record<string, unknown>;
    if (
      Object.keys(d).some(
        (key) => !['name', 'subdir', 'readOnly'].includes(key),
      ) ||
      typeof d.name !== 'string' ||
      d.name.length > 64 ||
      !/^[A-Za-z0-9_ -]+$/.test(d.name) ||
      !validFileName(d.name) ||
      !validFileName(d.name.slice(0, DOS_NAME_BYTES)) ||
      typeof d.subdir !== 'string' ||
      d.subdir.length > 253 ||
      !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(d.subdir) ||
      d.subdir.split('/').length > 31 ||
      d.subdir.split('/').some((part) => !validFileName(part)) ||
      typeof d.readOnly !== 'boolean'
    )
      throw new ProtocolError();
    const key = d.name.slice(0, DOS_NAME_BYTES).toUpperCase();
    if (keys.has(key)) throw new ProtocolError();
    keys.add(key);
    return { name: d.name, subdir: d.subdir, readOnly: d.readOnly };
  });
}
