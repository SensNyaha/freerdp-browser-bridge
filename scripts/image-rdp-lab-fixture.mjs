import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const invalid = () => new Error('Invalid owned image lab fixture');
export function imageLabPixels(id, role, revision) {
  if (
    !/^[0-9a-f]{32}$/.test(id ?? '') ||
    !['browser', 'remote'].includes(role) ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision > 2
  )
    throw new Error('Invalid owned image lab pixels');
  const seed = Uint8Array.from(id.match(/../g), (v) => parseInt(v, 16)),
    rgba = new Uint8Array(4096),
    remote = role === 'remote';
  for (let n = 0; n < 1024; n++)
    rgba.set(
      [
        (seed[n % 16] + n + (remote ? 71 : 0) + revision * 13) & 255,
        (seed[(n + 5) % 16] + n * 3 + (remote ? 137 : 0) + revision * 29) & 255,
        (seed[(n + 9) % 16] + n * 7 + (remote ? 193 : 0) + revision * 47) & 255,
        255,
      ],
      n * 4,
    );
  seed.fill(0);
  return rgba;
}
export async function imageLabDocument(id) {
  if (!/^[0-9a-f]{32}$/.test(id ?? '')) throw invalid();
  const template = await readFile(
    new URL('../tests/fixtures/image-rdp-application.html', import.meta.url),
    'utf8',
  );
  if (
    Buffer.byteLength(template) > 16384 ||
    template.split('__NONCE__').length !== 2 ||
    template.split('__PIXELS__').length !== 2
  )
    throw invalid();
  const html = template
    .replace('__NONCE__', id)
    .replace('__PIXELS__', imageLabPixels.toString());
  if (Buffer.byteLength(html) > 20480) throw invalid();
  return { html, sha256: createHash('sha256').update(html).digest('hex') };
}
export function parseImageLabReceipt(text, id) {
  if (
    typeof text !== 'string' ||
    text.length > 512 ||
    !/^[0-9a-f]{32}$/.test(id ?? '')
  )
    throw invalid();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  const keys = [
    'v',
    'id',
    'ready',
    'source',
    'copies',
    'pastes',
    'pending',
    'ok',
    'png',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k)) ||
    value.v !== 1 ||
    value.id !== id
  )
    throw invalid();
  for (const key of ['ready', 'pending', 'ok', 'png'])
    if (typeof value[key] !== 'boolean') throw invalid();
  for (const key of ['source', 'copies', 'pastes'])
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 2)
      throw invalid();
  if (
    value.copies > value.source ||
    (value.ok && (!value.png || !value.pastes))
  )
    throw invalid();
  const { ready, source, copies, pastes, pending, ok, png } = value;
  return { ready, source, copies, pastes, pending, ok, png };
}
