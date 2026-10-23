import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { referenceBrowserDirectory } from '@freerdp-bridge/api/browser';

const invalid = () => new Error('STANDALONE_BROWSER_ASSETS_INVALID');
async function boundedFile(path: string, maximum: number) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maximum) throw invalid();
    const bytes = Buffer.alloc(info.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== info.size) throw invalid();
    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

const panel = `<section aria-label="Доступ к приложению">
<form id="application-auth" method="post" action="/viewer/" autocomplete="off">
<label>Токен доступа приложения <input name="accessToken" type="password" maxlength="8185" autocomplete="off" spellcheck="false" required></label>
<button type="submit" disabled>Применить</button>
</form><p id="application-auth-status">Пароль RDP вводится отдельно в настройках подключения ниже.</p></section>`;

export async function installStandaloneBrowser(server: FastifyInstance) {
  const entries = await readdir(referenceBrowserDirectory, {
    withFileTypes: true,
  });
  if (entries.length < 2 || entries.length > 64) throw invalid();
  const assets = new Map<string, Buffer>();
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-z][a-z0-9-]*\.(html|js)$/.test(entry.name))
      throw invalid();
    const bytes = await boundedFile(
      join(referenceBrowserDirectory, entry.name),
      Math.min(262144, 2097152 - total),
    );
    total += bytes.length;
    assets.set(entry.name, bytes);
  }
  const index = assets.get('index.html')?.toString('utf8');
  if (
    !index ||
    !assets.has('session-form.js') ||
    !index.includes('<body>') ||
    !index.includes('src="./session-form.js"')
  )
    throw invalid();
  assets.set(
    'index.html',
    Buffer.from(
      index
        .replace('<body>', '<body>' + panel)
        .replace('src="./session-form.js"', 'src="./standalone.js"'),
    ),
  );
  assets.set(
    'standalone.js',
    await boundedFile(
      fileURLToPath(new URL('../web/session-auth.js', import.meta.url)),
      16384,
    ),
  );
  const send = (file: string, reply: FastifyReply) => {
    const body = assets.get(file);
    if (!body) return reply.code(404).send({ code: 'ASSET_NOT_FOUND' });
    return reply
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('x-content-type-options', 'nosniff')
      .header(
        'content-security-policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      )
      .type(
        file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'text/javascript; charset=utf-8',
      )
      .send(body);
  };
  server.get('/', (_request, reply) => reply.redirect('/viewer/'));
  server.get('/viewer/', (_request, reply) => send('index.html', reply));
  server.get<{ Params: { file: string } }>('/viewer/:file', (request, reply) =>
    send(request.params.file, reply),
  );
}
