# Встраивание RDP в сервер на node:http

Адаптер принят в **0.2.3**, после отдельных feature/release branches и всех
versioned native/consumer/RDP checks. [Контракт](NODE_HTTP_PLUGIN.md),
[release-приёмка](ITERATION_433.md). Текущий согласованный набор **0.2.4**
полностью опубликован в npm и GitHub; чистые Windows/Linux consumers проходят
strict TypeScript и 10/10. [Публикация](ITERATION_441.md). Исторический 0.2.3
ещё имеет pending JS stages; используйте опубликованный 0.2.4.

## Роли и установка

Общие `api`, `node`, `config` и `protocol` npm устанавливает автоматически
как зависимости HTTP adapter; отдельные `npm install` для них не нужны.
Native runtime своей ОС устанавливается явно.
[Цепочка и причина публикации](NPM_PUBLISHING.md#почему-публикуются-общие-js-пакеты).

Node.js-приложение владеет HTTP(S) listener, TLS, identity, разрешением целевых
подключений, своими маршрутами и WebSocket. Bridge подключает свой префикс к
этому же порту, управляет сессиями и запускает один native worker на сессию.
FreeRDP не загружается в процесс Node. Внутренний Fastify router является
зависимостью bridge; переводить свой сервер на Fastify не требуется.

Установка опубликованного 0.2.4 на Linux x64/glibc:

```sh
npm install @freerdp-bridge/http@0.2.4 @freerdp-bridge/runtime-linux-x64-gnu@0.2.4
npm install --save-dev typescript@5.9.3 @types/node@24.10.0
```

Windows x64 выбирает `@freerdp-bridge/runtime-win32-x64` той же версии вместо
Linux runtime. Все bridge JS/native версии должны совпадать. Нужны Node.js 24
и браузер; compiler, CMake и system FreeRDP у потребителя не нужны. Runtime
содержит готовый worker, платформенные IPC-компоненты, частные библиотеки,
проверяемый inventory/pairing, notices/licenses и source companions.
macOS, ARM, musl и произвольные distro/security profiles этим не принимаются.
[Полные runtime требования](NATIVE_NPM_RUNTIME.md).

Пакет использует ESM. В своём `package.json` задайте `"type": "module"`;
для TypeScript выберите `module`/`moduleResolution: "NodeNext"`, `strict: true`
и свой `outDir`, например `dist`. После `npx tsc -p tsconfig.json` запускайте
обычный `node dist/server.js`. Worker не требует отдельного ручного запуска;
bridge создаёт и завершает его для каждой RDP-сессии. Проверенный внешний
TypeScript пример — `tests/fixtures/http-package-consumer.ts`.

## Подключение к своему dispatcher

Пример использует уже существующий `verifyApplicationIdentity` из вашего
`auth.js`: это не функция пакета. Она проверяет bearer/mTLS identity и возвращает
`{ id: verifiedPrincipalId }` либо undefined. Простого наличия Authorization
недостаточно; не возвращайте постоянного пользователя для всех запросов.

```ts
import { createServer } from 'node:http';
import {
  createRdpBridgeHttp,
  resolveNativeRuntime,
} from '@freerdp-bridge/http';
import { verifyApplicationIdentity } from './auth.js';

const server = createServer((request, response) => {
  if (bridge.handleRequest(request, response)) return;
  if (request.url === '/host/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"host":true}');
    return;
  }
  response.writeHead(404);
  response.end();
});
const bridge = await createRdpBridgeHttp(server, {
  prefix: '/rdp',
  worker: await resolveNativeRuntime({
    runtimeRoot: '/private/run/rdp-bridge',
  }),
  allowedOrigins: ['https://app.example'],
  authenticate: verifyApplicationIdentity,
  sessions: { maxSessions: 16, maxPerPrincipal: 2 },
});
await new Promise<void>((resolve) => server.listen(8080, '127.0.0.1', resolve));
```

Обработчик начинает получать запросы только после listen, когда `bridge` уже
готов. На Windows задайте абсолютный Windows runtimeRoot. Это частный writable
каталог хоста приложения; resolver проверяет platform, product version,
закреплённый FreeRDP, inventory/hashes и IPC pairing.

True означает полное владение request/response: второй обработчик не должен
парсить body, писать headers или отправлять ответ. False означает чужой путь;
bridge не читает body/identity и не меняет response. Порядок важен: вызов bridge
должен предшествовать общему body parser. Не ставьте два catch-all `request`
listeners на один Server — EventEmitter вызовет оба. Bridge не добавляет такой
listener за приложение и не меняет host maxConnections, limits или handlers.

Identity callback проверяет пользователя, а не выбранный RDP target. В этом
adapter нет встроенного per-target allowlist callback; ограничение destinations
задаётся доверенным host orchestration и сетевой egress-политикой. Не считайте
валидный hostname или успешную авторизацию разрешением на любой адрес сети.
Session capacity/rate limits относятся к конкретному handle/SessionManager,
а не являются общемашинным лимитом всех mounts и Node.js-процессов. Согласуйте
общую ёмкость приложения отдельно.

Для прямого HTTPS используйте тот же dispatcher в `node:https.createServer`.
Host получает key/cert из своего private secret provider в памяти; module не
сохраняет их и не принимает из session JSON. HTTP/2-only server отклоняется.
При TLS на reverse proxy сохраняйте bridge prefix и Upgrade/Connection headers;
`allowedOrigins` должен точно содержать внешний Origin. Прокси и ранние host
middleware не должны писать тела, credentials, Authorization или attach query
tokens в журналы. Не доверяйте forwarded identity от произвольного клиента.

## Существующие WebSocket

Автоматический режим подходит, когда остальные listeners тоже выбирают только
свои пути. Для одного catch-all dispatcher задайте `upgradeMode: 'manual'`:

```ts
server.on('upgrade', (request, socket, head) => {
  if (bridge.handleUpgrade(request, socket, head)) return;
  hostWebSocketRouter(request, socket, head);
});
```

`hostWebSocketRouter` принадлежит вашему приложению. True нельзя передавать
второму WS consumer; false не читает headers/credentials/head и не трогает socket.
Не вызывайте removeAllListeners. Закрытый manual handle сохраняется в dispatcher
до shutdown хоста для явного отказа поздним bridge upgrades. Cookie identity
отклоняется; cookie auth требует отдельной CSRF/Origin интеграции.
Запрет относится к любому Cookie header, включая WS. Согласуйте Cookie Path/Domain
приложения, чтобы `/rdp` оставался cookie-free: [подробный identity контракт](HOST_AUTHENTICATION.md).

## Session и browser flow

Публичные маршруты получают указанный префикс:

| Метод и путь                                | Назначение                                |
| ------------------------------------------- | ----------------------------------------- |
| `GET /rdp/healthz`, `/rdp/readyz`           | Liveness/readiness bridge                 |
| `GET /rdp/v1/build`, `/rdp/v1/capabilities` | Фактический native build и capabilities   |
| `POST /rdp/v1/sessions`                     | Создание из validated session config      |
| `GET/DELETE /rdp/v1/sessions/:id`           | Состояние/закрытие своей сессии           |
| `POST /rdp/v1/sessions/:id/attach-token`    | Новые одноразовые control/media tokens    |
| `GET /rdp/v1/diagnostics`, `/rdp/metrics`   | Authenticated bounded aggregate telemetry |

JSON bridge ограничен 64 KiB, в том числе при chunked transfer. Строгая schema
не преобразует строку port в число и не удаляет неизвестные поля молча. RDP
credentials поступают из UI в памяти по HTTPS и уходят worker через private IPC;
не храните их в env, argv, файлах, профилях bridge или логах. Сертификаты RDP
строгие по умолчанию. Явный prompt допускает только решение по фактическому
утверждённому fingerprint, без общего отключения проверки.

Для своей формы создайте сессию и подключите ответ 202 к reference client:

```js
const response = await fetch('/rdp/v1/sessions', {
  method: 'POST',
  credentials: 'omit',
  headers: {
    ...applicationAuthorizationHeaders(),
    'content-type': 'application/json',
  },
  body: JSON.stringify(sessionConfigFromUi),
});
if (response.status !== 202) throw new Error('Session creation refused');
const createdSession = await response.json();
window.bridgeViewer.attach(createdSession, {
  basePath: '/rdp',
  codecs: ['h264', 'jpeg'],
});
```

`applicationAuthorizationHeaders` и `sessionConfigFromUi` принадлежат приложению.
Очищайте поле пароля после отправки и не печатайте config для диагностики.
Control/media WS используют разные одноразовые tokens и subprotocol
`freerdp-bridge-v1`. Перед reattach получите новые tokens с identity владельца
и сохраните тот же basePath. Resize подтверждается результатом и новой media
configuration; открытый WS сам по себе не доказывает отрисованный desktop.

`@freerdp-bridge/http/browser` экспортирует `referenceBrowserDirectory` с HTML/JS
reference viewer. Раздавайте только этот каталог через host static routes, с
корректным MIME и ограниченным allowlist; native/npm root раздавать нельзя.
Например, явный `/desktop/index.html` позволяет модулям страницы загружаться из
`/desktop/`, а API остаётся под `/rdp`. Для node:http `response.end(Buffer)`
передаёт содержимое файла; framework controller может иметь другую сериализацию.
Установите CSP/permissions согласно политике приложения и дождитесь загрузки
browser modules. Затем настройте встроенную форму:

```js
window.bridgeConnection.configure({
  basePath: '/rdp',
  authorize: () => applicationAuthorizationHeaders(),
});
await window.bridgeConnection.refresh();
```

Audio/Clipboard/microphone имеют отдельные capabilities, server policy и browser
permissions. Установка adapter не добавляет неподдерживаемые устройства.
[Подробности reference browser](FASTIFY_USAGE.md), [wire contract](../PROTOCOL.md).

## Завершение и диагностика

При независимой остановке RDP вызовите `await bridge.close()`. Это идемпотентный
joined drain только bridge workers/WS; host HTTP и чужие WS продолжают работать.
Owned HTTP mount после close отвечает 503. Remount на уже слушающем host не
является принятым lifecycle profile.

При остановке всего приложения порядок должен быть таким:

```ts
let stopping: Promise<void> | undefined;
function stop() {
  return (stopping ??= (async () => {
    await bridge.close();
    await closeApplicationWebSockets();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  })());
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
}
```

`closeApplicationWebSockets` — ваш bounded drain чужих WS. Не ждите callback
server.close до закрытия upgraded sockets: это может зависнуть. Также
closeAllConnections не закрывает WS. Host-close observer bridge является
fallback, а не заменой явного await close; ошибки cleanup доступны через ту же
promise. Не завершайте Node немедленным process.exit и не удаляйте runtime
directory до join.

`bridge.diagnostics()` и authenticated HTTP snapshot не содержат credentials,
remote contents, target names или сырые native logs. При 401 проверьте verified
identity; при 403 на attach — Origin/ownership/fresh token; при 413 — размер
body; при `BRIDGE_RAW_BODY_REQUIRED` — порядок parser; при
`HTTP_BRIDGE_INSTALL_FAILED` — runtime path/version/pairing и private directory.
`HTTP_BRIDGE_CLEANUP_FAILED` не раскрывает исходную ошибку. Не логируйте исходный
request для разбора отказа.

Перед production проверьте точный OS/Node/native комплект: actual desktop,
неверный сертификат, чужую identity, свой HTTP/WS, reattach, shutdown и отсутствие
worker/runtime entries. Внешний tarball helper —
`scripts/test-http-package.mjs`; `--runtime-archive` выбирает согласованный
локальный native пакет до его публикации. Только registry-only consumer после
публичного integrity подтверждает доступность полного npm-графа. Текущие
remaining gates описаны в [контракте](NODE_HTTP_PLUGIN.md).
Feature-проверки и оставшиеся release/npm условия — [итерация 431](ITERATION_431.md).
