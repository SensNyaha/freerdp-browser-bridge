# Встраивание RDP в NestJS

Модуль принят в **0.2.2**, после отдельных feature/release branches,
внешних npm consumers и реальных Astra/RED OS проверок обоих host adapter.
[Контракт](NESTJS_PLUGIN.md), [release-приёмка](ITERATION_429.md).
Все восемь npm-пакетов 0.2.2 опубликованы; точный integrity и свежие Windows/Linux
registry-only consumers проходят strict TS и 15/15 проверок на каждой ОС.
[Публикация 0.2.2](history/iterations/401-450.md#iteration-437). Текущий согласованный набор **0.4.0**
также полностью опубликован; обе ОС проходят strict TS и 15/15.
[Публикация 0.4.0](CLIPBOARD_BROWSER.md#040-public-delivery). Историческая 0.2.1 содержит только Fastify.

## Зависимости и размещение worker

На хосте приложения нужны Node.js 24, NestJS 12.2, выбранный platform adapter,
`reflect-metadata`, RxJS и native runtime той же product version, что и bridge.
Для текущей опубликованной версии 0.4.0:

```sh
# Linux x64 / glibc
npm install @freerdp-bridge/nestjs@0.4.0 @freerdp-bridge/runtime-linux-x64-gnu@0.4.0
# Windows x64: вместо Linux runtime выбирается runtime-win32-x64 той же версии
```

Готовый runtime содержит скомпилированный C++ worker, платформенные IPC-компоненты
и частные библиотеки FreeRDP. GCC/MSVC, CMake и системный FreeRDP для использования
готового пакета не нужны. Node.js и браузер устанавливаются отдельно. Сервер RDP,
к которому подключаются, не требует этих npm-пакетов. Поддержка OS/CPU/libc и
конкретные платформенные проверки описаны в [runtime guide](NATIVE_NPM_RUNTIME.md).

Для неопубликованного source-снимка устанавливайте полный согласованный набор локальных tarballs,
включая общие JS-пакеты; не смешивайте manifest одного development-снимка с
native worker другого релиза. Один JS tarball не публикует его зависимости.

## Подключение модуля

Общие `api`, `node`, `config` и `protocol` npm устанавливает транзитивно.
В обычной registry-установке указывайте adapter и явный native runtime своей ОС;
перечислять внутренние JS-пакеты не требуется.
[Зачем они публикуются](NPM_PUBLISHING.md#почему-публикуются-общие-js-пакеты).

Пример предполагает существующие `HostConfigModule`, `HostConfigService`,
`HostAuthModule` и `HostAuthService` приложения. Они не поставляются bridge.

```ts
import { Module } from '@nestjs/common';
import { RdpBridgeModule, resolveNativeRuntime } from '@freerdp-bridge/nestjs';

@Module({
  imports: [
    RdpBridgeModule.forRootAsync({
      imports: [HostConfigModule, HostAuthModule],
      inject: [HostConfigService, HostAuthService],
      useFactory: async (config: HostConfigService, auth: HostAuthService) => ({
        prefix: '/rdp',
        worker: await resolveNativeRuntime({
          runtimeRoot: config.privateRuntimeRoot,
        }),
        allowedOrigins: [config.publicOrigin],
        authenticate: (request) => auth.verifyBridgeRequest(request),
      }),
    }),
  ],
})
export class AppModule {}
```

`verifyBridgeRequest` проверяет bearer/mTLS identity и возвращает
`{ id: verifiedPrincipalId }` либо undefined. Наличие заголовка само по себе
не подтверждает пользователя. Не возвращайте постоянного пользователя и не
записывайте заголовки, session bodies или attach query tokens. Cookie-based
identity требует отдельного CSRF/Origin adapter и пока отказывается ядром.
Отказ относится к любому Cookie header и к WS, даже при наличии bearer.
Для same-port host ограничьте Cookie Path/Domain вне bridge prefix;
[полный identity и browser-cookie контракт](HOST_AUTHENTICATION.md).

`runtimeRoot` — абсолютный частный writable каталог на хосте приложения; на
Windows укажите Windows-путь. Resolver проверяет установленный runtime, product
version, pinned FreeRDP, inventory/hashes и IPC pairing. RDP-секреты передаются
worker через прежний приватный IPC. Проверка RDP-сертификатов строгая по умолчанию.

Если настройки уже подготовлены, используйте `RdpBridgeModule.forRoot(options)`.
Provider регистрирует ранний raw mount; native admission и core resources
инициализируются через Nest lifecycle. После `app.init()`/`app.listen()` можно
получить `app.get(RdpBridgeService)` и читать aggregate `diagnostics()`.

## Express и FastifyAdapter

Обычный `NestFactory.create(AppModule)` использует Express. Для Fastify:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

const app = await NestFactory.create(AppModule, new FastifyAdapter());
app.setGlobalPrefix('api');
await app.listen(8080, '127.0.0.1');
```

Контроллеры приложения будут под `/api`, а bridge останется под явным `/rdp`.
Оба используют существующий HTTP(S) listener и порт. Express-путь использует
внутренний Fastify router без listen/proxy-порта; FastifyAdapter получает тот же
plugin в контексте реального Fastify instance. FreeRDP в обоих случаях остаётся
в отдельном процессе на каждую сессию.

Bridge использует собственные identity checks, schema validation и lifecycle.
Nest controller guards/pipes/interceptors не применяются к raw HTTP/WS маршрутам
автоматически. Также не предполагайте, что поздний Express middleware для CORS,
security headers или access logging оборачивает ранний mount. Согласуйте нужную
политику на внешнем TLS/reverse proxy либо в host middleware, установленном в
правильном порядке. Same-origin размещение browser assets не требует отдельного
cross-origin API. Стандартный Nest body parser остаётся за bridge mount; если
свой host parser уже разобрал bridge body, запрос будет отвергнут с фиксированным
кодом. Лимит bridge — 64 KiB, включая chunked JSON; host routes сохраняют свой.

## WebSocket routing и завершение

По умолчанию модуль добавляет один prefix-selective upgrade listener. Другие
listeners также должны выбирать только свои пути. Для catch-all диспетчера
укажите в module options `upgradeMode: 'manual'`:

```ts
import { RdpBridgeService } from '@freerdp-bridge/nestjs';

const bridge = app.get(RdpBridgeService);
app.getHttpServer().on('upgrade', (request, socket, head) => {
  if (bridge.handleUpgrade(request, socket, head)) return;
  routeApplicationWebSocket(request, socket, head);
});
```

`routeApplicationWebSocket` принадлежит приложению. False означает, что bridge
не читал credentials/head и не трогал socket. Закрытый service остаётся в
диспетчере до host shutdown, чтобы поздние RDP upgrades явно отказывались.

`await bridge.close()` идемпотентно завершает только bridge-owned workers/WS,
оставляя host HTTP и чужие WS живыми. `await app.close()` вызывает ту же cleanup
через Nest lifecycle перед закрытием HTTP server; собственные host WS приложение
завершает своим lifecycle. При обработке сигналов применяются обычные Nest
`enableShutdownHooks` и правила host. Динамический remount после закрытия на
уже слушающем сервере не поддерживается.

## Browser, диагностика и границы приёмки

`@freerdp-bridge/nestjs/browser` экспортирует `referenceBrowserDirectory`.
Раздавайте только этот каталог, а не npm/native runtime целиком. Например,
следующий controller подходит для обоих проверяемых adapter; добавьте его
в `controllers` вашего модуля. Пути `/desktop/*` и `/rdp/*` независимы:

```ts
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { referenceBrowserDirectory } from '@freerdp-bridge/nestjs/browser';

async function asset(name: string): Promise<string> {
  const path = join(referenceBrowserDirectory, name);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > 131072) throw new Error('ASSET_LIMIT');
    return await readFile(path, 'utf8');
  } catch {
    throw new NotFoundException();
  }
}

@Controller('desktop')
export class DesktopController {
  @Get('index.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  index() {
    return asset('index.html');
  }

  @Get(':file')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  script(@Param('file') name: string) {
    if (!/^[a-z][a-z0-9-]*\.js$/.test(name)) throw new NotFoundException();
    return asset(name);
  }
}
```

Открывайте явный `/desktop/index.html`: поведение trailing slash зависит от
host adapter. Для HTML/JS возвращайте текст. Nest controller может сериализовать
`Buffer` как JSON; заголовок `text/html` сам по себе не превращает его в HTML.
Если приложение задаёт controller global prefix `/api`, адрес assets станет
`/api/desktop/index.html`; абсолютный bridge prefix останется `/rdp`.
Согласуйте CSP и HTTPS/permissions со своей политикой приложения.

После загрузки модулей страницы настройте форму через публичный browser API:

```js
window.bridgeConnection.configure({
  basePath: '/rdp',
  authorize: () => applicationAuthorizationHeaders(),
});
await window.bridgeConnection.refresh();
```

`applicationAuthorizationHeaders()` возвращает подтверждённую identity
приложения из памяти, не RDP пароль. Форма создаёт сессию через
`POST /rdp/v1/sessions`. Для своей формы отправьте validated session config
на тот же адрес с verified application authorization и передайте ответ 202:

```js
window.bridgeViewer.attach(createdSession, {
  basePath: '/rdp',
  codecs: ['h264', 'jpeg'],
});
```

Для reattach сначала получите новые отдельные одноразовые control/media tokens
через authenticated `POST /rdp/v1/sessions/:id/attach-token` и сохраните
`basePath`. Для resize вызывайте `bridgeViewer.resize(width, height)` и ждите
подтверждённого результата и новой media configuration. Открытый WS сам по себе
не подтверждает отрисованный desktop. `bridgeViewer.detach()` закрывает viewer;
удаление серверной сессии выполняется отдельным authenticated DELETE либо
штатным shutdown. Presentation, credential-entry UI и browser permission policy
остаются у приложения. [Подробности browser flow](FASTIFY_USAGE.md).

Authenticated `/rdp/v1/diagnostics` и `bridge.diagnostics()` содержат ограниченные
счётчики lifecycle без hostnames/credentials/remote contents. Control-channel
session diagnostics используют прежний command/size budget. Capabilities/build
получаются из существующих `/rdp/v1/build` и `/rdp/v1/capabilities`; compiled
channel не означает фактическую поддержку устройства или permission.

## HTTPS, эксплуатация и отказ

При прямом TLS используйте обычные host-owned Nest `httpsOptions` для Express
либо `FastifyAdapter({ https: httpsOptions })`. Ключи получает host secret
provider; они не входят в module options, примеры или runtime package. В
reverse-proxy варианте сохраняйте `/rdp` и Upgrade/Connection headers; внешний
Origin должен точно совпадать с `allowedOrigins`. Не доверяйте forwarded identity
от произвольного клиента. Не включайте request-body/query/Authorization logging
в proxy, раннем host middleware или Nest hooks. Cookies ядром не принимаются.

| Симптом                       | Проверка                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 401                           | Callback проверяет identity приложения и возвращает владельца; одного наличия Authorization недостаточно    |
| 403 на attach                 | Origin, владелец, отдельный свежий token для каждого канала                                                 |
| 413                           | Session JSON превышает 64 KiB; host limit не расширяет bridge limit                                         |
| `BRIDGE_RAW_BODY_REQUIRED`    | Custom Express parser стоит перед bridge; исключите bridge prefix из него                                   |
| `NEST_BRIDGE_OPTIONS_FAILED`  | Host configuration/identity provider не смог подготовить options; исходная ошибка намеренно не раскрывается |
| `NEST_BRIDGE_INSTALL_FAILED`  | Проверьте trusted worker path, Node 24, version/pairing и доступ к private runtime directory                |
| `RDP_CERTIFICATE_REJECTED`    | Проверьте серверный сертификат/имя и утверждённую trust policy; strict остаётся default                     |
| HTML есть, viewer отсутствует | Проверьте текстовый HTML/JS, MIME, CSP и явный index.html; не возвращайте JSON-представление Buffer         |
| Host WS перестал работать     | Catch-all dispatcher должен первым делегировать bridge в manual mode                                        |

В production readiness проверяется через `/rdp/readyz`; агрегатные счётчики и
лимиты — через authenticated diagnostics/metrics. После drain сначала дождитесь
bridge/Nest close, затем завершайте процесс. Не удаляйте runtime directory до
joined cleanup и не завершайте Node через немедленный `process.exit()`.
Проверьте это на точном OS/Node/native комплекте своего приложения, включая
отказ сертификата, чужой identity, host HTTP/WS, reattach и исчезновение workers.

Framework/fake-media/native-TLS проверки, external npm tarball consumers и
actual Astra/RED OS desktop учитываются отдельно; [приёмка](history/iterations/401-450.md#iteration-427).
Versioned 0.2.2 release gates проходят в [429](ITERATION_429.md); npm publication
остаётся отдельным следующим блоком. Полная
V1-программа и незавершённые device/installers requirements сохраняются.

Модель host adapter, lifecycle и штатного raw body описана в официальных
[Nest HTTP adapter](https://docs.nestjs.com/faq/http-adapter),
[lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events) и
[raw body](https://docs.nestjs.com/faq/raw-body). Bridge требует исходный stream
до body parser; опция Nest `rawBody` для уже разобранного controller body этого
контракта не заменяет.
