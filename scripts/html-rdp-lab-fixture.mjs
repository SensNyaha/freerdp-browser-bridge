import { readFile } from 'node:fs/promises';

export const htmlLabUnicode = ' \u0416\u65e5\u672c\u8a9e\ud83d\ude00';
const noncePattern = /^[0-9a-f]{32}$/;
const invalid = () => new Error('HTML_LAB_FIXTURE_INVALID');

/** Public synthetic document, never a credential or an arbitrary remote command. */
export async function htmlLabDocument(nonce) {
  if (!noncePattern.test(nonce ?? '')) throw invalid();
  const source = await readFile(
    new URL('../tests/fixtures/html-rdp-application.html', import.meta.url),
    'utf8',
  );
  if (source.split('__BRIDGE_ID__').length !== 2) throw invalid();
  // Keep SourceURL below the native 4 KiB CF_HTML description-header limit.
  const document = source
    .replace(/<!--[^]*?-->/g, '')
    .replace(/\r?\n\s*/g, '')
    .replace('__BRIDGE_ID__', nonce);
  const uri =
    'data:text/html;base64,' + Buffer.from(document).toString('base64');
  if (uri.length > 3500) throw invalid();
  return { document, uri };
}

/** Only known scalar receipt fields leave the owned remote application. */
export function parseHtmlLabReceipt(value, nonce) {
  if (
    !noncePattern.test(nonce ?? '') ||
    typeof value !== 'string' ||
    Buffer.byteLength(value) > 512
  )
    throw invalid();
  try {
    const result = JSON.parse(value);
    if (
      !result ||
      Array.isArray(result) ||
      Object.keys(result).sort().join(',') !==
        'html,id,ok,pastes,ready,source,text,v' ||
      result.v !== 1 ||
      result.id !== nonce ||
      result.ready !== true ||
      !Number.isInteger(result.source) ||
      result.source < 0 ||
      result.source > 4 ||
      !Number.isInteger(result.pastes) ||
      result.pastes < 0 ||
      result.pastes > 3 ||
      !['ok', 'html', 'text'].every((key) => typeof result[key] === 'boolean')
    )
      throw invalid();
    return {
      source: result.source,
      pastes: result.pastes,
      ok: result.ok,
      html: result.html,
      text: result.text,
    };
  } catch {
    throw invalid();
  }
}
