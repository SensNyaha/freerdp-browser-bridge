import { createHash } from 'node:crypto';

const invalid = () => new Error('FREERDP_OVERRIDE_INVALID');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pin = 'bf217a504e54cc719880c228e82353382cd7d4fa';
const expected = {
  schema: 1,
  id: 'dsp-opus-reset-ownership-v1',
  sourceCommit: pin,
  sourceSha256:
    '40715894dc14e2869c64bbf3ebfcf209fe12483890ffb709133d7034f32ad10f',
  recipeSha256:
    '6e0d1b10ae4e85effeaf4f2e91b15a140028d4bc7c6f46fb6f4ab5c6923847dd',
  outputSha256:
    'f1da137622368914628be9ef79888186bb6a9a1dc7e5fa77771535c061dae35a',
};

// These bytes must come from the extracted artifact, never a mutable SDK.
// Unknown manifest fields are not projected into diagnostic or SPDX output.
export function freeRdpOverrideInventory(commit, manifestBytes, recipeBytes) {
  if (commit !== pin) throw invalid();
  const original = 'Pinned FreeRDP/WinPR source commit ' + pin;
  if (manifestBytes === undefined && recipeBytes === undefined)
    return {
      sourceInfo:
        original +
        '; override metadata absent in this historical artifact; upstream modification status not established.',
      files: [],
    };
  if (
    !Buffer.isBuffer(manifestBytes) ||
    !Buffer.isBuffer(recipeBytes) ||
    manifestBytes.length > 4096 ||
    recipeBytes.length > 131072
  )
    throw invalid();
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    throw invalid();
  }
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.entries(expected).some(([key, value]) => manifest[key] !== value) ||
    hash(recipeBytes.toString('utf8').replaceAll('\r\n', '\n')) !==
      expected.recipeSha256
  )
    throw invalid();
  return {
    sourceInfo:
      original +
      '; bridge build-copy correction ' +
      expected.id +
      '; source SHA256 ' +
      expected.sourceSha256 +
      '; canonical LF recipe SHA256 ' +
      expected.recipeSha256 +
      '; generated C SHA256 ' +
      expected.outputSha256 +
      '. Public ABI unchanged; metadata is build provenance, not a binary signature.',
    files: [
      {
        path: 'share/freerdp-bridge/freerdp-overrides.json',
        sha256: hash(manifestBytes),
      },
      {
        path: 'share/freerdp-bridge/overrides/freerdp-dsp-override.cmake',
        sha256: hash(recipeBytes),
      },
    ],
  };
}
