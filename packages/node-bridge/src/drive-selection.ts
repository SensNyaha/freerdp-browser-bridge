import type { SessionCreate } from '@freerdp-bridge/config';
import {
  managedDriveDescriptors,
  type ManagedDriveDescriptor,
} from '@freerdp-bridge/protocol';
/** Expand the product alias into the same bounded session-sandbox descriptors. */
export function selectManagedDrives(
  config: SessionCreate,
): ManagedDriveDescriptor[] | undefined {
  const r = config.redirection;
  if (!r) return;
  if (
    Object.keys(r).some((key) => !['drives', 'thinclientDrives'].includes(key))
  )
    throw new Error('Unsupported redirection');
  const values: ManagedDriveDescriptor[] = [];
  for (const drive of r.drives ?? []) {
    if (drive.source.kind !== 'session-sandbox')
      throw new Error('Unsupported drive source');
    values.push({
      name: drive.name,
      subdir: drive.source.subdir,
      readOnly: drive.readOnly ?? false,
    });
  }
  for (const drive of r.thinclientDrives ?? [])
    values.push({
      name: drive.name,
      subdir: drive.subdir,
      readOnly: drive.readOnly ?? false,
    });
  return values.length ? managedDriveDescriptors(values) : undefined;
}
