# Документация FreeRDP Browser Bridge

Здесь собраны основные маршруты чтения. Для интеграции не нужно проходить
сотни iteration-отчётов: начните с нужного блока. Подробные контракты,
первоначальные требования и доказательства приёмки сохранены по ссылкам.

## 1. Что готово и какой вариант выбрать

Текущий публичный набор **0.3.0** включает четыре Node.js адаптера, два native
runtime и standalone web-сервер с установщиками Windows/Linux. Все десять npm
архивов, пять GitHub Releases, независимые Windows/Linux consumers и финальные
установщики проверены. Это не завершение всей исходной V1-программы.

| Нужный результат | Основной документ |
| --- | --- |
| Принятые возможности и ограничения 0.3.0 | [Публичная приёмка](RUNTIME_RECOVERY.md#030-public-delivery), [локальные RDP-профили](RUNTIME_RECOVERY.md#030-local-release-acceptance) |
| Выбор адаптера или отдельного сервера | [Framework selection](FRAMEWORK_SELECTION.md), [Standalone](STANDALONE.md) |
| Список оставшихся задач | [TODO](../TODO.md) |
| Версии и история | [Version policy](VERSIONING.md), [Changelog](../CHANGELOG.md) |

0.2.3 — архивный принятый snapshot с частичной npm-публикацией. Семь старых JS
версий намеренно не допубликовываются; используйте полный 0.3.0. Исходники,
тег и принятые архивы сохранены. [Решение пользователя](ITERATION_458.md).

## 2. Встраивание в приложение

Все варианты используют один session/native engine; выбор framework не
добавляет RDP-возможностей. На сервере нужны Node.js 24 и native runtime своей
ОС той же product version. Установка adapter подтягивает общие JS-библиотеки.

| Приложение | Guide реального проекта | Точный контракт |
| --- | --- | --- |
| Fastify 5 | [FASTIFY_USAGE](FASTIFY_USAGE.md) | [FASTIFY_PLUGIN](FASTIFY_PLUGIN.md) |
| NestJS 12 | [NESTJS_USAGE](NESTJS_USAGE.md) | [NESTJS_PLUGIN](NESTJS_PLUGIN.md) |
| Node HTTP/HTTPS | [NODE_HTTP_USAGE](NODE_HTTP_USAGE.md) | [NODE_HTTP_PLUGIN](NODE_HTTP_PLUGIN.md) |
| Express 5 | [EXPRESS_USAGE](EXPRESS_USAGE.md) | [EXPRESS_PLUGIN](EXPRESS_PLUGIN.md) |

Начните с guide: там установка, порядок middleware, подключение, ownership и
shutdown. Общие границы: [identity/cookies](HOST_AUTHENTICATION.md),
[native runtime](NATIVE_NPM_RUNTIME.md), [session API](SESSION_API.md).
Koa/Hono/Next.js не объявлены принятыми адаптерами по сходству интерфейса;
их оценка и условия отдельной приёмки — в [framework selection](FRAMEWORK_SELECTION.md).

## 3. Отдельный сервис и эксплуатация

[Установка и обслуживание](STANDALONE_INSTALL.md) — короткая инструкция для
готовых архивов и служб. [Standalone](STANDALONE.md) описывает целевые сценарии,
JWT, allowed targets, reverse proxy и точный контракт.
[Скачать дистрибутивы](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.3.0).

| Формат | Инструкция |
| --- | --- |
| ZIP/TGZ без регистрации службы | [Portable](../packaging/standalone/portable/README.md) |
| Windows MSI | [Установка службы](STANDALONE_INSTALL.md#windows-msi) |
| Linux DEB/RPM | [Установка systemd-службы](STANDALONE_INSTALL.md#linux-debrpm) |

Приложение разрешает пользователю конкретную машину и выделяет VM/учётные
записи. Bridge обеспечивает RDP и владение сессией. Не храните JWT, пароли или
private signing keys в публичном config. Capabilities и результаты конкретного
профиля определяют доступность звука/буфера/устройств. [Security](../SECURITY.md),
[устройства и browser boundaries](../DEVICE_REDIRECTION.md).

## 4. Архитектура и контракты

[Specification](../SPECIFICATION.md) задаёт требования;
[architecture](../ARCHITECTURE.md) — процессную модель;
[protocol](../PROTOCOL.md) — HTTP/WS/IPC;
[config schema](../CONFIG_SCHEMA.md) — настройки;
[FreeRDP mapping](../FREERDP_MAPPING.md) — связь с native API.
Изменение wire-контракта требует обновления реализации, схем и документации.

Ключевые подсистемы: [изображение/звук](../MEDIA_PIPELINE.md),
[ввод](INPUT.md), [дисплей](DISPLAY_CONTROL.md), [session audio](SESSION_AUDIO.md),
[browser clipboard](CLIPBOARD_BROWSER.md), [производительность](../PERFORMANCE.md).
Остальные файлы раскрывают отдельные компоненты; конкретный guide/контракт
ссылается на нужные детали и evidence.

## 5. Разработка, проверка и выпуск

[Development](DEVELOPMENT.md) и [Build and deploy](../BUILD_AND_DEPLOY.md)
описывают toolchain и воспроизводимые проверки. Node.js 24/pnpm, strict
TypeScript; C++20/CMake/Ninja; закреплённый FreeRDP 3.32.1.
[Compiler support](COMPILER_SUPPORT.md) разделяет GCC 8.3/Astra 1.7.5,
обязательный RED OS 7.3/GCC 11, foundation и installed-OS/RDP evidence.

[Test plan](../TEST_PLAN.md) и [MVP acceptance](MVP_ACCEPTANCE.md) разделяют
unit/fake-worker, настоящий native lifecycle и реальную RDP/device приёмку.
Успешный build сам по себе не закрывает TODO. Сначала узкие проверки, затем
нужные regression и профильные gates. Каждая feature идёт в отдельной ветке.

[Version policy](VERSIONING.md) → [npm acceptance](NPM_PUBLISHING.md) →
[OIDC](NPM_TRUSTED_PUBLISHING.md) → [GitHub delivery](GITHUB_DELIVERY.md).
Не перепаковывайте принятые архивы и не перемещайте опубликованные теги.
Installer workflow выполняется по push в core main/master и публикует файлы
после его проверок. OIDC устраняет ручное 2FA при каждом npm publish.
[Структура каталогов и очистка](PROJECT_MAINTENANCE.md) описывает, какие
инструменты/receipts сохраняются и что уже удалено.

## 6. История и правила чтения

Приоритет: явный актуальный запрос пользователя → SPECIFICATION → принятые
[ADR](adr) → ARCHITECTURE/PROTOCOL → TODO.
[CODEX_INSTRUCTIONS](../CODEX_INSTRUCTIONS.md) задаёт правила работы.
Исторический текст не отменяет более позднее решение или непройденный gate.

Девять ключевых `ITERATION_*.md` оставлены отдельно. Ещё 444 прежних отчёта
собраны в [10 архивных томов](history/iterations/README.md) с якорями итераций и
исходными хешами. Их дата, артефакт и ограничения сохранены. Старые build paths
могут быть удалены после сохранения receipts;
[cleanup evidence](ITERATION_458.md) явно описывает такие случаи.
[Предыдущий README](history/README_BEFORE_458.md) сохранён с тем же текстом;
ссылки пересчитаны для его расположения и архивных томов.
