# Выбор серверного адаптера

Запрос пользователя закрепляет Fastify 0.2.1, NestJS 0.2.2, node:http 0.2.3
и Express 0.2.4. Каждый adapter использует тот же session/native engine;
выбор framework не добавляет новую RDP/device возможность. Подтверждённые
версии, публикация и pending gates перечислены в [TODO](../TODO.md).

| Приложение | Выбранный вариант | Основное условие |
| --- | --- | --- |
| Fastify | `@freerdp-bridge/fastify` | Prefixed host plugin; не конкурировать за чужие upgrades |
| NestJS | `@freerdp-bridge/nestjs` | DI и lifecycle модуля; ранний raw middleware для Express или FastifyAdapter |
| Собственный Node HTTP/HTTPS server | `@freerdp-bridge/http` | Один host dispatcher; вызов handleRequest перед host parsing |
| Express 5 | `@freerdp-bridge/express` | Корневой middleware перед parsing/rewrite; полный namespace через prefix |

Все варианты требуют Node.js 24 и долговременный серверный процесс, который
может запускать отдельный native worker на сессию и обеспечивать приватный IPC.
Платформа должна предоставлять проверенный native runtime нужной ОС/CPU/libc.
Нельзя считать наличие HTTP route handler достаточным для всей реализации.
REST identity, WebSocket ownership, raw-body bounds, shutdown и реальные
desktop/device profiles проверяются отдельно.

## Дополнительные популярные библиотеки

На текущем этапе отдельного пользовательского сценария, требующего ещё одного
framework adapter, не выявлено. Следующие варианты оценены архитектурно,
но не объявлены поддерживаемыми и не получают фиктивных версий/checkboxes:

| Кандидат | Что позволяет официальный API | Непроверенная часть bridge |
| --- | --- | --- |
| Koa | `app.callback()` можно передать Node HTTP server | Композиция с raw HTTP bridge перед callback, чужие WS, auth/error/close, реальные RDP profiles |
| Hono на Node | Node server adapter имеет отдельную поддержку WebSocket | Связь Fetch API и сырого Node request, consumption bounds, upgrade dispatcher, native lifecycle |
| Next.js с custom server | Framework документирует собственный Node server | Совместимость конкретного server/router/deployment profile, upgrades и native/session lifetime |

Источники: [Koa API](https://koajs.com/),
[Hono WebSocket helper](https://hono.dev/docs/helpers/websocket),
[Hono Node server](https://github.com/honojs/node-server),
[Next.js custom server](https://nextjs.org/docs/pages/guides/custom-server).
Возможность соединить эти API с HTTP adapter — вывод из интерфейсов, не
integration acceptance. Особенно нельзя переносить результаты Node-hosted
варианта на Bun, Deno, edge functions или произвольный serverless hosting.
Ограничения конкретного провайдера оцениваются по фактическому deployment.

При реальном проекте на Koa/Hono/Next/hapi сначала проверяется существующий
HTTP adapter в принадлежащем приложению Node HTTP/HTTPS dispatcher. Новый
пакет нужен, если остаётся конкретная framework-specific задача: lifecycle,
DI, request/upgrade ownership или безопасная композиция middleware. Тогда он
получает отдельную feature branch, полный guide, независимый installed-package
consumer и реальные заявленные RDP profiles. Похожесть middleware signatures
не является доказательством поддержки.

## Установка и общие библиотеки

В приложении устанавливаются выбранный adapter, host framework и **явный**
native runtime своей ОС той же product version. Общие protocol/config/node/api
устанавливаются npm транзитивно. Их публикация обязательна для установки
adapter, но отдельных npm-команд для них не нужно.
[Объяснение графа](NPM_PUBLISHING.md#почему-публикуются-общие-js-пакеты).

Реальные guides: [Fastify](FASTIFY_USAGE.md), [NestJS](NESTJS_USAGE.md),
[node:http/HTTPS](NODE_HTTP_USAGE.md), [Express](EXPRESS_USAGE.md).
Общие [identity/Cookie/Origin границы](HOST_AUTHENTICATION.md) сохраняются
независимо от framework. Не считайте Express session middleware, Nest guard
или доверие к forwarded header готовой авторизацией сырых bridge upgrades.
