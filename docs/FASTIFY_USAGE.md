# Встраивание RDP в приложение Fastify

В 0.5.0 доступен отдельно включаемый буфер изображений. Именованные PNG-профили,
явные действия браузера, общие лимиты и ограничения описаны в
[image clipboard](CLIPBOARD_BROWSER.md#versioned-050-image-application-acceptance).

Этот документ описывает Fastify-реализацию релиза **0.2.1**, принятую через
отдельные `feature/fastify-0.2.1` и `release/0.2.1`. Стабильная 0.2.0 не
содержит этого plugin. JS/native-артефакты имеют согласованную версию 0.2.1;
[release-проверки](ITERATION_424.md) и
[подтверждённая публикация всего набора в npm](history/iterations/401-450.md#iteration-426). Пользователь
создал npm-организацию `freerdp-bridge` и подтвердил имена `@freerdp-bridge/*`.

## Что запускается в приложении

Приложение Node.js 24 / Fastify 5 владеет своим HTTP(S)-сервером. Plugin
регистрирует HTTP и WebSocket под выделенным префиксом, например `/rdp`, на
том же порту. Каждая RDP-сессия получает отдельный native worker. FreeRDP не
загружается в Node.js; desktop/media идут через прежний ограниченный IPC.

Приложение отвечает за идентификацию пользователя, разрешение целевых
подключений, внешний TLS, своё журналирование и раздачу своего web-client.
Plugin владеет сессиями, одноразовыми attach tokens и своим shutdown.
Поддерживаемые возможности определяются `/rdp/v1/capabilities` и native build,
а не фактом установки JavaScript-пакета. Полная исходная V1-программа остаётся
в [TODO](../TODO.md); интеграция не включает незавершённые устройства/диски.

## Установка и native runtime

Текущий согласованный набор **0.5.0** полностью опубликован в npm. Чистые
Windows/Linux consumers проходят strict TypeScript, HTTP/WS, assets и native
TLS/lifecycle. [Публикация](RELEASE_0_5_0.md#public-delivery). Установка:

```sh
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.5.0
# Выберите один native runtime той же версии для ОС сервера приложения:
npm install @freerdp-bridge/runtime-linux-x64-gnu@0.5.0
# Windows x64 вместо Linux runtime:
# npm install @freerdp-bridge/runtime-win32-x64@0.5.0
npm install --save-dev typescript@5.9.3 @types/node@24.10.0
```

На хосте приложения не нужны установленный GCC/MSVC, CMake, SDK или системный
FreeRDP. C++-исходники компилируются при подготовке релиза: native runtime
содержит готовый worker, платформенные IPC-компоненты, закреплённый FreeRDP
3.32.1 и его частные библиотеки. Сам `@freerdp-bridge/fastify` содержит JS,
TypeScript declarations и экспорт браузерного примера; общие JS-пакеты
устанавливаются как зависимости. Нативные бинарники поставляются отдельно
в `@freerdp-bridge/runtime-*`, а не в исходных `.cpp` внутри Fastify-пакета.

`api`, `node`, `config` и `protocol` не нужно указывать в `npm install`
вручную: они подтягиваются транзитивно. Их публикация нужна для работоспособной
установки adapter в чужой проект. [Цепочка зависимостей](NPM_PUBLISHING.md#почему-публикуются-общие-js-пакеты).
Каждая RDP-сессия запускает скомпилированный C++ worker отдельным процессом.

GCC 8.3 — baseline сборки Linux-комплекта, а не обязательный установленный
компилятор пользователя. На сервере приложения нужны совместимые ОС/CPU,
системные библиотеки исполнения, Node.js 24 и права на запуск native worker.
Данный набор предназначен для Windows x64 и Linux x64 с glibc; произвольные
дистрибутивы, macOS, ARM и musl этим утверждением не принимаются. Результаты
compiler/foundation, runtime и конкретных платформ фиксируются отдельно в
[COMPILER_SUPPORT](COMPILER_SUPPORT.md) и отчётах о приёмке.

На удалённой машине, к которой подключаются по RDP, GCC и FreeRDP для этого
подключения также не требуются: там нужен настроенный RDP-сервер, например
XRDP. Это отдельная роль от хоста Node.js/Fastify.

Для ещё неопубликованных development-снимков используйте собранные `pnpm pack`
архивы. Такой внешний consumer должен
получить архивы всех workspace dependencies той же product version:
`protocol`, `config`, `node`, `api`, `fastify`. Установка одного development
tarball не делает остальные пакеты доступными в registry. Воспроизводимый
проверяющий helper — [test-fastify-package.mjs](../scripts/test-fastify-package.mjs):
он создаёт отдельный проект в `build/fastify-consumer-*`, устанавливает архивы,
проверяет строгие TypeScript declarations, same-port HTTP/WS, browser assets
и настоящий native TLS-отказ. Флаг `--npm` проверяет именно npm; без флага
используется pnpm с предварительно наполненным offline-кешем.

После публикации текущей product version проверяйте обычную установку из npm:

```sh
node scripts/test-fastify-package.mjs --registry-only
```

Этот режим создаёт чистый npm-проект с двумя прямыми bridge dependencies:
Fastify adapter и runtime своей ОС. Общие пакеты устанавливаются транзитивно;
локальные архивы и overrides не используются. Проверяются те же строгие типы,
HTTP/WS, assets, native TLS-отказ и завершение worker. Режим требует уже
опубликованного согласованного набора версии из корневого `package.json`.

При использовании самостоятельно подготовленного native комплекта передайте
`worker: { workerPath, runtimeRoot }`. Для установленного npm runtime используйте
`worker: await resolveNativeRuntime({ runtimeRoot })`: resolver найдёт worker
и платформенные IPC-компоненты. В обоих вариантах используйте
полный проверенный native комплект, сохраняя рядом worker, platform helpers,
IPC pairing metadata, библиотеки, лицензии и notices. Нельзя копировать только
`rdp-worker` из build-каталога или подставлять системный `xfreerdp`.
Native npm-комплекты и resolver приняты и опубликованы в 0.2.1;
[установка и проверка runtime](NATIVE_NPM_RUNTIME.md). Runtime пока
устанавливается явно рядом с adapter, затем `resolveNativeRuntime` выбирает
и проверяет установленный комплект. Version-stamped архивы 0.2.1 собраны;
финальная release-приёмка пройдена. Публичная доступность и обычная установка
из npm на Windows/Linux подтверждены в [отчёте о публикации](history/iterations/401-450.md#iteration-426).
Рабочий runtime root должен быть частным и доступным учётной записи сервиса;
не помещайте его внутрь публичной static-директории.

## Регистрация и идентификация

```ts
import Fastify from 'fastify';
import {
  rdpBridgePlugin,
  type BridgeHandle,
  type RdpBridgePluginOptions,
} from '@freerdp-bridge/fastify';

// Trusted host configuration; authenticate verifies the application's identity.
export async function createApplication(options: RdpBridgePluginOptions) {
  const app = Fastify();
  let bridge: BridgeHandle | undefined;
  app.get('/application/health', async () => ({ ok: true }));
  app.register(rdpBridgePlugin, {
    ...options,
    prefix: '/rdp',
    onReady(handle) {
      bridge = handle;
    },
  });
  await app.ready();
  return { app, getBridge: () => bridge };
}
```

Передайте `worker: { workerPath, runtimeRoot }`, `allowedOrigins` с точными
origin вашего web-приложения и `authenticate(request)`. Последний возвращает
`{ id: verifiedUserId }` или `undefined`, допускается Promise. Реальную проверку
bearer/mTLS identity выполняет приложение; наличие любого заголовка само по
себе не является авторизацией. Ограничьте внешнюю проверку идентичности по
времени и не записывайте входные заголовки в журнал. Plugin имеет собственную
ограниченную по времени проверку. Cookie-based authentication в этом срезе
отклоняется: для существующего cookie login нужен отдельно спроектированный
CSRF/Origin identity adapter.

Настройте production ограничения через `sessions` согласно
[типам SessionManagerOptions](../packages/node-bridge/src/session-manager.ts)
и [SECURITY](../SECURITY.md). Не подменяйте `sessions.workerFactory` fake-worker:
по умолчанию plugin создаёт настоящий `NativeSessionWorker`.

Префикс обязателен: до 128 ASCII символов, до 16 компонентов из букв, цифр,
`_` и `-`. Не используйте trailing slash, percent escapes и пересекающиеся
mounts (`/rdp` и `/rdp/sub`). `allowedOrigins` — до 32 точных HTTP(S) origins,
каждый до 2048 символов. Прокси должен сохранять выбранный внешний origin.

Plugin не вызывает `listen()`: запускайте существующее приложение обычным
способом. Обратитесь к `/rdp/readyz` после запуска и проверьте
`/rdp/v1/build`, включая product/FreeRDP версии и transport.

## Сессия и browser client

Авторизованный клиент создаёт сессию через `POST /rdp/v1/sessions`, передавая
структурированный запрос из [PROTOCOL](../PROTOCOL.md). RDP-учётные данные
передаются только в HTTPS body и дальше в приватном IPC. Не помещайте их в
URL, environment, disk profile, localStorage или журналы. Схема строгая:
неизвестные поля/строковый port не исправляются автоматически, body больше
64 KiB отклоняется до разбора.

Ответ 202 содержит `sessionId` и attach tokens для control/media. Соединения
WebSocket используют `/rdp/v1/sessions/:id/control` и `/media`, разрешённый
Origin и прежний subprotocol `freerdp-bridge-v1`. Токены одноразовые,
разделены по каналам и ограничены по времени; повторное подключение получает
новые через `POST /rdp/v1/sessions/:id/attach-token` с авторизацией владельца.
Сертификаты RDP проверяются строго по умолчанию. Если приложение явно выбирает
интерактивный `prompt`, решение принимает пользователь по фактическому
fingerprint, без общего отключения проверки сертификатов.

Для собственного UI используйте [reference harness](../apps/reference-harness)
как пример lifecycle, binary media credit, input, certificate и browser
permissions. Пакет `@freerdp-bridge/fastify/browser` экспортирует
`referenceBrowserDirectory` с HTML/JS reference client. Раздайте эти файлы
через ваш static-file router, не раздавая весь каталог npm/native runtime.
HTTP-префикс assets и префикс bridge могут различаться: например `/desktop/`
и `/rdp`. После загрузки формы настройте её до обновления capabilities:

```js
window.bridgeConnection.configure({
  basePath: '/rdp',
  authorize: () => applicationAuthorizationHeaders(),
});
await window.bridgeConnection.refresh();
```

`applicationAuthorizationHeaders` получает identity приложения в памяти.
Существующую созданную сессию можно подключить непосредственно:

```js
window.bridgeViewer.attach(createdSession, {
  basePath: '/rdp',
  codecs: ['h264', 'jpeg'],
});
```

Передайте одинаковый basePath при reattach. Для resize используйте
`bridgeViewer.resize(width, height)` и дождитесь результата и новой media
configuration. Не принимайте наличие открытого WebSocket за отрисованный
desktop. Audio/Clipboard/microphone имеют собственную политику, capabilities
и browser permissions; permission browser не заменяет серверное разрешение.

## Существующие WebSocket приложения

Любой Cookie header отказывается на защищённых REST и WS, даже вместе с bearer. Для
same-port приложения настройте Cookie Path/Domain так, чтобы bridge prefix
оставался cookie-free. REST `credentials: 'omit'` не выключает cookies браузерного
WebSocket; [подробный identity контракт](HOST_AUTHENTICATION.md).

Автоматический режим добавляет только prefix-selective listener. Он подходит,
когда остальные upgrade listeners также выбирают только свои маршруты.
Если host использует catch-all router или WebSocket plugin, отклоняющий чужие
маршруты, у приложения должен остаться один общий dispatcher:

```ts
app.register(rdpBridgePlugin, {
  ...options,
  prefix: '/rdp',
  upgradeMode: 'manual',
  onReady(handle) {
    bridge = handle;
  },
});
app.server.on('upgrade', (request, socket, head) => {
  if (bridge?.handleUpgrade(request, socket, head)) return;
  hostWebSocketRouter(request, socket, head);
});
```

`false` означает, что bridge не читал credentials, не потреблял head и не
добавлял socket listeners. `true` означает полное владение upgrade. Не
передавайте такой запрос второму обработчику. Не вызывайте
`removeAllListeners('upgrade')`. Совместимость с произвольным catch-all
`@fastify/websocket` без общей маршрутизации пока не заявляется.

## Диагностика, журналы и завершение

`bridge.diagnostics()` возвращает фиксированный aggregate snapshot. Его HTTP
проекция `/rdp/v1/diagnostics` и `/rdp/metrics` требуют identity. Для собственной
сессии control-channel принимает `session.diagnostics.request` с пустым `data`
и возвращает `session.diagnostics`; корреляция выполняется по `requestSeq`.
Проверяйте `sessionDiagnostics: 1` в capabilities. Поля и общие rate/size limits
описаны в [PROTOCOL](../PROTOCOL.md). Это текущий lifecycle/buffer snapshot,
не полный performance report и не remote desktop contents.

Автоматические request logs bridge scope отключены, включая его 404, а
отказы пишут фиксированные безопасные коды. Приложение и reverse proxy также
должны исключить тела, Authorization, cookies и attach query tokens из своих
hooks/access logs. Изоляция plugin не может отменить уже выполненный host hook.

При штатной остановке вызовите `await app.close()` — bridge join выполнится
через Fastify hooks. Для независимой остановки RDP вызовите
`await bridge.close()`: host HTTP и чужие WS продолжат работать. Close
идемпотентен, закрывает свои WS и дожидается retirement sessions/workers.
Закрытый mount отвечает 503; сохраните его manual handle до остановки host,
чтобы поздние upgrades также получали явный отказ. Remount после listen
не поддерживается. Сигналы процесса обрабатывает приложение и должно дождаться
его async close, прежде чем завершать Node.

## Проверки перед внедрением

Запустите consumer на точном production Node/OS/native комплекте. Проверьте
успешный RDP desktop, отказ неверного сертификата, чужую identity, reattach,
отключение и отсутствие workers/runtime entries после close. Оставьте HTTP и
WS вашего приложения активными во время независимого bridge shutdown.
Если `/readyz` не готов, проверьте полный runtime и pairing, версии Node и
product; не выбирайте старый worker как fallback. При 401 проверьте identity,
при 403 — Origin и ownership, при 413 — размер body, при 503 — состояние
mount/worker и лимиты. Не печатайте исходный запрос для диагностики отказа.

Текущие результаты и незакрытые gates: [итерация 419](history/iterations/401-450.md#iteration-419).
Типизация Fastify: [официальное руководство](https://fastify.dev/docs/latest/Reference/TypeScript/).
