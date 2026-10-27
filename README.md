# FreeRDP → Browser Bridge

Серверный RDP bridge для браузера: отдельный C++ worker на каждую сессию,
Node.js для HTTP/WebSocket API. FreeRDP выполняется вне процесса Node.js.
Можно встроить bridge в существующий backend или установить отдельную службу.

Текущий публичный релиз — **0.5.0**. Все десять npm-пакетов и пять GitHub
Releases опубликованы; чистые установки четырёх адаптеров проверены на Windows
и Linux. Standalone MSI/DEB/RPM/ZIP/TGZ автоматически опубликованы по push в
`main`; обновления проверены на Windows Server 2025, Ubuntu 24.04,
Astra Linux 1.7.5 и RED OS 7.3.
[Приёмка и границы поддержки](docs/RELEASE_0_5_0.md#public-delivery).
В 0.5.0 добавлен отдельно включаемый буфер изображений; проверенные PNG-профили
и ограничения перечислены в отчёте.

## Использование

| Задача | С чего начать |
| --- | --- |
| Установить отдельный web-сервер с приватным Node.js | [Standalone: установка и эксплуатация](docs/STANDALONE.md), [скачать 0.5.0](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.5.0) |
| Подключить к Fastify | [Реальный проект Fastify](docs/FASTIFY_USAGE.md) |
| Подключить к NestJS | [Реальный проект NestJS](docs/NESTJS_USAGE.md) |
| Подключить к Node HTTP/HTTPS | [Реальный проект node:http](docs/NODE_HTTP_USAGE.md) |
| Подключить к Express 5 | [Реальный проект Express](docs/EXPRESS_USAGE.md) |
| Выбрать вариант, найти API или правила разработки | [Карта документации](docs/README.md) |

Для npm-встраивания нужны Node.js 24 и явный native runtime той же версии,
выбранный для ОС сервера. Общие JS-библиотеки устанавливаются транзитивно.
Например, Express на Linux x64/glibc:

```sh
npm install express@5.3.0 @freerdp-bridge/express@0.5.0 @freerdp-bridge/runtime-linux-x64-gnu@0.5.0
```

На Windows x64 выбирайте `@freerdp-bridge/runtime-win32-x64@0.5.0`.
Готовым npm/standalone комплектам не нужен системный FreeRDP или компилятор.
Для standalone не нужен и глобальный Node.js. macOS, ARM и musl этими
проверками не приняты.

## Поддерживаемый сценарий

Приложение или портал авторизует пользователя и доступ к машине; bridge создаёт
RDP-сессию и передаёт её в браузер. Standalone подходит также backend на
Java/Python/Go/.NET, внутренним порталам и учебным стендам.
Изображение, ввод, resize, звук и буфер обмена зависят от capability report и
принятого профиля: [практический MVP](docs/MVP_ACCEPTANCE.md),
[приёмка 0.5.0](docs/RELEASE_0_5_0.md#versioned-checks).

Desktop GUI, Electron, управление VM, запись и совместный просмотр не входят
в этот релиз. Произвольные USB/смарт-карты браузера не поддерживаются одним
фактом RDP-подключения. Полный исходный V1-план и непринятые возможности
сохранены в [TODO](TODO.md) и [матрице устройств](DEVICE_REDIRECTION.md).

## Разработка и релизы

Новая feature — отдельная ветка; merge после нужных тестов и фактической
приёмки. [Разработка](docs/DEVELOPMENT.md), [сборка](BUILD_AND_DEPLOY.md),
[версии и ветки](docs/VERSIONING.md), [OIDC-публикация](docs/NPM_TRUSTED_PUBLISHING.md),
[GitHub delivery](docs/GITHUB_DELIVERY.md). Секреты не должны попадать в argv,
environment, логи или артефакты; [безопасность](SECURITY.md).

Приоритет требований: последнее явное указание пользователя →
[спецификация](SPECIFICATION.md) → принятые [ADR](docs/adr) →
[архитектура](ARCHITECTURE.md) и [протокол](PROTOCOL.md) → [TODO](TODO.md).
Противоречия фиксируются явно. [Правила разработки](CODEX_INSTRUCTIONS.md).

[Changelog](CHANGELOG.md) сохраняет историю версий. 0.2.3 оставлена архивной:
семь отсутствующих JS npm-версий не допубликовываются по решению пользователя;
полные 0.2.4/0.2.5, 0.4.0 и 0.5.0 доступны. [Решение и очистка](docs/ITERATION_458.md).
[Предыдущий подробный README](docs/history/README_BEFORE_458.md) сохранён;
нормативные документы и исторические отчёты не удалены.
