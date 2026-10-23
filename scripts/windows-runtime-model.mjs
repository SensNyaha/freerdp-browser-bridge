import { packageRecord } from './sbom-model.mjs';

export const windowsRuntimeNames = [
  'concrt140.dll',
  'msvcp140.dll',
  'msvcp140_1.dll',
  'msvcp140_2.dll',
  'msvcp140_atomic_wait.dll',
  'msvcp140_codecvt_ids.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll',
];

export function windowsRuntimeInventory(records, files) {
  const invalid = () => new Error('WINDOWS_RUNTIME_VERSION_INVALID');
  if (
    !Array.isArray(records) ||
    records.length !== windowsRuntimeNames.length ||
    !Array.isArray(files) ||
    files.length > 1024 ||
    files.some((file) => !file || typeof file !== 'object')
  )
    throw invalid();
  const packages = new Map(),
    seen = new Set(),
    relationships = [];
  for (const record of records) {
    if (
      !record ||
      !windowsRuntimeNames.includes(record.name) ||
      seen.has(record.name) ||
      typeof record.version !== 'string' ||
      !/^[0-9]{1,5}(?:\.[0-9]{1,5}){3}$/.test(record.version) ||
      record.version.split('.').every((value) => Number(value) === 0) ||
      record.version.split('.').some((value) => Number(value) > 65535)
    )
      throw invalid();
    seen.add(record.name);
    const matching = files.filter(
      (file) => file.fileName === './native/bin/' + record.name,
    );
    if (
      matching.length !== 1 ||
      !/^SPDXRef-[A-Za-z0-9.+-]+$/.test(matching[0].SPDXID)
    )
      throw invalid();
    const pkg = packageRecord(
      'microsoft-vc-runtime',
      record.version,
      'SPDXRef-msvc-' + record.version,
    );
    pkg.sourceInfo =
      'File version from packaged PE resources; not a redistributable installer version or publisher signature verification.';
    packages.set(pkg.SPDXID, pkg);
    relationships.push({
      spdxElementId: pkg.SPDXID,
      relationshipType: 'CONTAINS',
      relatedSpdxElement: matching[0].SPDXID,
    });
  }
  return { packages: [...packages.values()], relationships };
}
