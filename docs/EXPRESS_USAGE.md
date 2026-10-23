# Встраивание bridge в настоящий Express-проект

Адаптер принят локально в **0.2.4**, tag `v0.2.4`;
[release-проверки](ITERATION_438.md) проходят. До публичной npm-публикации используйте
локальные архивы из соответствующего release-каталога; наличие документации
не означает доступность этой версии в публичном npm. Статус находится в
[TODO](../TODO.md), интерфейс — в [EXPRESS_PLUGIN.md](EXPRESS_PLUGIN.md).

## Установка и структура приложения

Требуются Node.js 24, ESM, Express 5; проверяемый профиль — Express 5.3.0.
После публикации установка в существующем проекте:

```sh
npm install express@5.3.0 @freerdp-bridge/express@0.2.4 @freerdp-bridge/runtime-linux-x64-gnu@0.2.4
npm install --save-dev typescript@5.9.3 @types/node@24.10.0
```

Типы Express являются зависимостью адаптера и входят в его публичные
декларации. В TypeScript используйте `module`/`moduleResolution: NodeNext`,
`strict: true`; потребительская проверка также использует `skipLibCheck: false`.
Для JavaScript компилятор не нужен. В `package.json` приложения задайте
`"type": "module"`. Не копируйте workspace-исходники в `node_modules`.

На Windows x64 вместо Linux runtime явно установите
`@freerdp-bridge/runtime-win32-x64@0.2.4`. На Windows x64 и Linux x64 glibc
`resolveNativeRuntime()` выбирает уже установленный пакет нужной платформы,
проверяет версию, FreeRDP pin, inventory и hashes. Resolver не скачивает runtime.
Общие JS-пакеты http/api/node/config/protocol устанавливаются автоматически
как зависимости adapter; отдельных команд для них не требуется.
[Зачем публикуются общие пакеты](NPM_PUBLISHING.md#почему-публикуются-общие-js-пакеты).
При
собственной сборке можно явно передать `worker`, но это отдельная проверяемая
конфигурация. Для production из принятых runtime-пакетов не нужны CMake,
компилятор, глобальный FreeRDP или дополнительный HTTP-порт.

## Сервер и порядок middleware

`verifyApplicationIdentity` ниже — функция вашего приложения из `auth.js`.
Она проверяет bearer/mTLS identity и возвращает `{ id: verifiedUserId }`
либо undefined. Это не экспорт bridge. Наличие заголовка Authorization само
по себе не подтверждает пользователя; не возвращайте одного постоянного
principal для всех запросов. Подробности обязательного контракта:
[HOST_AUTHENTICATION.md](HOST_AUTHENTICATION.md).

```ts
import express from 'express';
import { createServer } from 'node:http';
import { createRdpBridgeExpress, resolveNativeRuntime } from '@freerdp-bridge/express';
import { verifyApplicationIdentity } from './auth.js';

const app = express();
const server = createServer(app);
const bridge = await createRdpBridgeExpress(server, {
  prefix: '/rdp',
  worker: await resolveNativeRuntime({ runtimeRoot: '/private/run/rdp-bridge' }),
  authenticate: verifyApplicationIdentity,
  allowedOrigins: ['https://app.example'],
  sessions: { maxSessions: 16, maxPerPrincipal: 2 },
});

app.use(bridge.middleware);
app.use(express.json({ limit: '1mb' }));
app.get('/host/health', (_request, response) => response.json({ host: true }));
app.post('/host/echo', (request, response) => response.json(request.body));
await new Promise<void>(resolve => server.listen(8080, '127.0.0.1', resolve));
```

На Windows задайте абсолютный Windows `runtimeRoot` в частном writable
каталоге приложения. Этот каталог используется для IPC и временных ресурсов,
а не для хранения паролей или профилей. Не передавайте credentials через
аргументы процесса или переменные окружения.

Подключение — именно `app.use(bridge.middleware)`. Полный внешний путь уже
задан как `prefix: '/rdp'`. Вариант `app.use('/rdp', bridge.middleware)` неверен:
Express удаляет mount point из `req.url`, а middleware вернёт
`EXPRESS_BRIDGE_ROOT_REQUIRED`. Router допустим только в корне с пустым
effective `baseUrl`; не помещайте bridge в Router, смонтированный под `/api`.
Для namespace `/api/rdp` укажите этот полный prefix и подключите middleware
в корне приложения. Переписывать URL перед ним также нельзя.

Общий `express.json()`, `express.raw()`, urlencoded parser и middleware,
читающие stream, должны идти после bridge. Иначе owned POST получит
`BRIDGE_RAW_BODY_REQUIRED`; bridge не будет повторно сериализовать `req.body`.
Собственный лимит bridge — 64 KiB, включая chunked requests. Маршрут
`/host/echo` в примере сохраняет свой лимит 1 MiB. Неподходящие bridge prefix
запросы переходят в `next()`; обработчик 404/error вашего приложения остаётся
на своём месте после host routes.

## Авторизация, Cookie и сеть

Express session/Passport middleware не является автоматической авторизацией
bridge: callback получает сырой Node request, а upgrade обходит Express HTTP
middleware. Проверяйте identity прямо в `authenticate`. Идентификатор principal
должен быть стабильным, непустым и не длиннее 256 символов. Callback имеет
ограниченный срок выполнения. REST/WS ownership проверяет именно этот principal.

Текущий API отклоняет любой Cookie header на защищённых REST/WS путях.
Даже корректный bearer не отменяет этот отказ. Scope cookie вашего приложения
должен исключать `/rdp`: например, cookies для `/host` не идут в `/rdp`.
Cookie с `Path=/` на этом же origin несовместима с текущим browser WS bridge.
У конструктора WebSocket нет режима `credentials: 'omit'`. Для cookie-free
API origin отдельно настройте CORS/preflight у host/proxy; `allowedOrigins`
сам по себе CORS не реализует. Не добавляйте cookie/session workaround,
который обходит политику без отдельного спроектированного адаптера.

Проверка identity не ограничивает выбранный RDP host. В этих адаптерах нет
готового per-target allowlist callback: разрешённые назначения обеспечивают
доверенный host orchestration и egress policy. Синтаксически допустимый адрес
не означает разрешение ходить в любой сегмент сети. Лимиты сессий относятся
к конкретному SessionManager; несколько mounts/processes требуют отдельного
общего ограничения на уровне приложения.

## REST, browser assets и attach

Пример POST использует значения из памяти UI: `applicationToken` — проверяемый
bearer вашего приложения, `sessionConfig` — валидируемый RDP config с target,
auth и разрешёнными policy-настройками. Не встраивайте реальные пароли в код,
статические JSON или страницы; очищайте поля после отправки.

```ts
const response = await fetch('/rdp/v1/sessions', {
  method: 'POST',
  credentials: 'omit',
  headers: {
    authorization: `Bearer ${applicationToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(sessionConfig),
});
if (response.status !== 202) throw new Error('Session admission failed');
const created = await response.json();
```

Результат содержит `sessionId` и отдельные short-lived control/media attach
tokens. Они не являются ни bearer приложения, ни RDP паролем. Для нового
присоединения получите свежие токены по API, не используйте потраченные.
Маршруты, record schemas и binary media контракт:
[PROTOCOL.md](../PROTOCOL.md). Возвращаемая ошибка должна отображаться без
вывода исходных секретных payload в console/error reporting.

Для reference browser harness используйте экспорт установленного пакета:

```ts
import { referenceBrowserDirectory } from '@freerdp-bridge/express/browser';

app.use('/viewer', express.static(referenceBrowserDirectory, {
  index: 'index.html',
  dotfiles: 'deny',
  fallthrough: false,
  maxAge: 0,
}));
```

Разместите static route после bridge и перед общим 404. Это каталог только
поставленных browser assets, не native runtime или приватные данные. Сохраняйте
пути относительных JS-модулей. Страница — reference harness, который можно
заменить собственным UI; её существующие form/client settings задают bridge
base `/rdp` и bearer из памяти. Не делайте доступным весь каталог пакета или
`runtimeRoot`. Политику CSP/headers задаёт host; для same-origin клиента нужны
загрузка модулей и connect к своему HTTP/WS origin.

## Чужие WebSocket-сервисы на том же порту

В automatic режиме адаптер добавляет один общий selective upgrade listener;
соседние handlers обязаны также выбирать только свои пути. Catch-all listener,
который уничтожает каждый неизвестный socket, конфликтует с другим listener.
Когда у приложения уже есть единый dispatcher, используйте manual:

```ts
// В options фабрики: upgradeMode: 'manual'.
server.on('upgrade', (request, socket, head) => {
  if (bridge.handleUpgrade(request, socket, head)) return;
  if (request.url === '/notifications') {
    notifications.handleUpgrade(request, socket, head, ws => {
      notifications.emit('connection', ws, request);
    });
    return;
  }
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
```

Здесь `notifications` — ваш `WebSocketServer({ noServer: true })`, например
из отдельно установленного `ws`. Он не создаётся bridge. Возврат true
передаёт владение socket/head bridge; после этого другой handler не должен
касаться их. Возврат false оставляет их без изменений. Вызывайте dispatcher
один раз на upgrade; не подключайте одновременно automatic и manual путь.

## HTTPS, proxy и завершение

Для HTTPS замените `node:http` на `node:https` и создайте server с вашим TLS
key/certificate. Конфигурация сертификата host HTTPS и проверка сертификата
RDP-сервера — разные контуры. RDP по умолчанию проверяется строго; не отключайте
проверку ради подключения. За reverse proxy сохраните полный `/rdp` namespace,
поддержку WebSocket upgrade и допустимые idle deadlines. В `allowedOrigins`
укажите внешний browser origin. Не считайте произвольный X-Forwarded заголовок
подтверждённой identity; proxy trust настраивает ваше приложение.

При остановке сначала запретите новые операции на уровне host, вызовите
`await bridge.close()`, закройте чужие WebSocket-сервисы, затем дождитесь
`server.close()`. Можно начать `server.close()` раньше, но нельзя ожидать его
завершения до закрытия live upgrades: иначе получится взаимное ожидание.
Bridge close идемпотентен и не останавливает host listener. Наблюдатель события
close — дополнительная очистка, не замена явного `await bridge.close()`.

`bridge.diagnostics()` и защищённый `/rdp/v1/diagnostics` дают ограниченные
счётчики текущего bridge. Не включайте RDP payload, query attach tokens,
Cookie/Authorization в access logs, APM или custom error handlers приложения.
Обрабатывайте стабильные error codes и фиксируйте только безопасные события.

## Проверка внедрения и границы поддержки

Проверяйте отдельно установку и TypeScript, host HTTP/WS, JSON bounds и auth,
native TLS/lifecycle, затем реальный RDP и выбранные устройства/codecs.
В репозитории `scripts/test-express-package.mjs` создаёт независимый npm project
из tarballs, компилирует публичные декларации без skipLibCheck и проверяет
установленные browser/native assets. `--archives build/<release-directory>`
выбирает ровно принятый граф; `--registry-only` используется лишь после
публикации всей версии. Успех fake worker не подтверждает desktop/device RDP.

HTTP/2 не поддерживается данным adapter. Windows/Linux x64 runtime profiles
не означают macOS/ARM или принятую работу всех устройств из полного V1.
Для desktop, audio, clipboard и других функций сверяйтесь с capabilities и
актуальными acceptance reports. Смена Express peer version сама по себе
не принимает новую платформу, compiler profile или device integration.
