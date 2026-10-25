# Публикация проверенных npm-архивов

Новая настройка пользователя: [автоматический direct publish через GitHub OIDC](NPM_TRUSTED_PUBLISHING.md),
GitHub owner `SensNyaha`, npm scope `@freerdp-bridge`. Ручная очередь approve
остановлена; не возобновлять её автоматически. Исторические сведения о
staging ниже сохранены, но staging сам по себе не устраняет ручную 2FA.

Текущая приёмка: **0.3.0 полностью опубликован в npm** — десять exact accepted
архивов, пять успешных OIDC workflows и все четыре fresh registry-only consumers
на Windows/Linux; [проверки](RUNTIME_RECOVERY.md#030-public-delivery). Финальные standalone установщики
также опубликованы и проверены в этом отчёте. Историческая 0.2.5 также полностью
публична; [её приёмка](ITERATION_457.md).
**0.2.2 полностью опубликован**, точные публичные bytes и
свежие Windows/Linux registry-only consumers проходят
([iteration 437](history/iterations/401-450.md#iteration-437)). **0.2.3** публичен только в части двух
runtimes. По прямому решению пользователя от 2026-10-24 **0.2.3 остаётся
архивной**: семь JS-пакетов не допубликовываются, ручная очередь не возобновляется;
полных 0.2.4/0.2.5 достаточно. Тег, исходники и принятые архивы сохраняются.
[Решение](ITERATION_458.md). **0.2.4** принят локально с десятью
точными архивами ([iteration 438](ITERATION_438.md)) и полностью опубликован:
10/10 public integrity, пять GitHub Releases/workflows и четыре чистых
Windows/Linux registry-only consumers проходят ([iteration 441](history/iterations/401-450.md#iteration-441)).
Исторические pending checkpoints ниже не заменяют этот текущий статус.

## Почему публикуются общие JS-пакеты

Потребитель устанавливает выбранный adapter и native runtime своей ОС.
Общие JS-пакеты npm устанавливает автоматически как транзитивные зависимости;
перечислять их вручную в обычной команде установки не требуется.

```text
fastify / nestjs / http adapter → api → node → config / protocol
                                      └────→ config / protocol
express adapter → http → тот же общий граф
```

| Пакет | Для чего нужен |
| --- | --- |
| `@freerdp-bridge/protocol` | Общие протокольные контракты и типы |
| `@freerdp-bridge/config` | Схемы и проверка конфигурации подключения |
| `@freerdp-bridge/node` | Управление native worker, приватный IPC и lifecycle |
| `@freerdp-bridge/api` | Общие HTTP/WS routes, сессии, identity/ownership и diagnostics |

Они должны быть опубликованы: готовый adapter ссылается на них через обычные
`dependencies`. Если требуемой версии зависимости нет в registry, установка
adapter в чужом проекте не завершится. При `pnpm pack` workspace-ссылки
превращаются в точные product versions; `workspace:*` не является требованием
к проекту потребителя. Общая версия всех bridge-пакетов следует принятой
[version policy](VERSIONING.md), даже когда код отдельного слоя не менялся.

Пример уже опубликованного 0.2.1 для Linux:

```sh
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.2.1 @freerdp-bridge/runtime-linux-x64-gnu@0.2.1
npm ls @freerdp-bridge/api @freerdp-bridge/node @freerdp-bridge/config @freerdp-bridge/protocol
```

Runtime — отдельная **явная** platform dependency; JS adapter не скачивает
его автоматически и resolver не выполняет установку. Windows выбирает
`runtime-win32-x64` вместо `runtime-linux-x64-gnu`. Публикация обеих платформ
позволяет потребителям выбрать нужную, а не устанавливать их одновременно.

Это проверяется registry-only consumer: его начальный manifest задаёт только
выбранный adapter, native runtime и host/dev dependencies, без прямого
перечисления четырёх внутренних JS-модулей и без локальных overrides.

## Новый принятый набор 0.2.3

node:http/node:https 0.2.3 проходит aligned release-приёмку;
[проверки и accepted digests](ITERATION_433.md). Девять точных архивов находятся
в `build/release-432-archives/`: два runtime, protocol/config/node/api,
fastify/nestjs/http. Все содержат root README и проходят exact external
consumers/reinstall, native/full checks, versioned actual RDP и npm dry-run.
Registry publication и registry-only consumers остаются отдельным шагом.

```sh
node scripts/test-http-package.mjs --archives build/release-432-archives
```

## Предыдущий принятый набор 0.2.2: staging

NestJS 0.2.2 проходит aligned release-приёмку; [полные проверки и SHA-256](ITERATION_429.md).
В `build/release-428-archives/` находятся восемь точных архивов: два runtime,
protocol, config, node, api, fastify и nestjs. Все содержат корневой README,
проходят bounded pack audit, внешний Windows/Linux npm consumer и official npm
dry-run с совпадающим SHA-512. Не перепаковывайте эти архивы для публикации.
Все восемь архивов уже успешно приняты официальным npm staging. Они скачаны
обратно и совпадают с исходными accepted SHA-512. Финальное owner approve с 2FA,
публичный integrity и registry-only consumers остаются pending; локальный tag
и accepted stage сами по себе не подтверждают доступность release version в npm.

## Staging и окончательное подтверждение владельцем

Официальный [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
позволяет загрузить точный архив через `npm stage publish <archive>` без 2FA,
а затем подтвердить существующий stage через `npm stage approve <stage-id>`
с 2FA. Текущий закреплённый Node 24/npm 11.19 поддерживает этот workflow.
Владелец может также использовать раздел Staged Packages на npmjs.com.
Сверяйте имя/version и скачанный stage archive с accepted audit до approve.
Уже созданный stage той же версии не отправляется повторно; другой integrity
отказывает. Нельзя заменять accepted tarball, unpublish или двигать старый tag.

Для 0.2.2 isolated publication worktree — `build/npm-publication-430`.
Локальный receipt `build/npm-publication-430/build/npm-staging-0.2.2.json`
содержит восемь stage IDs и download/integrity результаты. Account settings,
токены и OTP не копируются в worktree, npm artifacts или delivery repos.
Staging нового package может создать публичный placeholder `0.0.0-stage`;
это не запрошенный release number и не работоспособная версия adapter.

При нескольких версиях подтверждайте их по возрастанию: 0.2.2, затем 0.2.3,
затем 0.2.4; внутри версии — runtimes/shared dependencies перед adapters.
После каждого полного accepted graph сравните публичный dist.integrity и
запустите новые registry-only Windows/Linux consumers без local overrides.
До их успеха публикация не считается DONE. 2FA подтверждается в официальном
интерфейсе владельца; секреты не передаются в чат или argv/env.

## Проверка exact NestJS набора

Для воспроизводимой проверки точного NestJS набора из корня проекта:

```sh
node scripts/test-nestjs-package.mjs --archives build/release-428-archives
```

Архивы должны находиться внутри `build/` данного проекта. Helper проверяет
упакованные имена/версии, bounded metadata, README, strict TypeScript, оба
host adapter, HTTPS/WSS и actual native certificate refusal. Флаг
`--registry-only` применяется после публикации вместо `--archives`, в новом
проекте без file/workspace overrides. Windows использует закреплённый локальный
Node/pnpm toolchain; Linux — Node 24 и pnpm 10.11.0 из PATH.

## Предыдущий опубликованный набор 0.2.1

Fastify 0.2.1 принят в локальном `v0.2.1`. Последующее прямое решение
пользователя: **сначала допубликовать все готовые версии 0.2.1**. Для этого
используется исходный принятый набор без перепаковки. Добавленные README
поставляются со следующей версией; общее требование ниже сохраняется.
Все семь версий 0.2.1 подтверждены публичными запросами без авторизации;
`dist.integrity` каждого совпадает с принятым архивом.
Свежие registry-only consumers на Windows и Linux проходят strict TypeScript,
same-port HTTP/WS, fake binary media, настоящий native TLS-отказ и joined cleanup.
[Полная приёмка публикации и ссылки на пакеты](history/iterations/401-450.md#iteration-426).
История предыдущих 2FA отказов — в [отчёте 424](ITERATION_424.md),
проверки README и предыдущее состояние частичной публикации — в [425](history/iterations/401-450.md#iteration-425).

По [документации npm](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
создание/публикация пакетов требует интерактивной 2FA либо granular access
token с разрешённым bypass 2FA. Для автоматической публикации владелец может
настроить соответствующий доступ в своём локальном npm-клиенте. Ограничьте
доступ нужным scope `@freerdp-bridge`; для read-only проверки организации
нужны соответствующие права чтения. Токен/OTP не передаются в чат, исходники,
build-артефакты, журналы или аргументы проверяющих скриптов. Настройки npm
не копируются в подготовленные delivery-репозитории.

## README обязателен для каждого пакета и выпуска

Решение пользователя от 2026-10-22: каждый npm-релиз каждого пакета, включая
общие JS-библиотеки и оба native runtime, содержит собственный `README.md`
**в корне пакета**. Вложенные LGPL build instructions его не заменяют.
README объясняет назначение, установку, требования/зависимости, использование,
ограничения и лицензии. Примеры должны соответствовать публичным exports;
runtime-описания отдельно объясняют, где находятся скомпилированные C++ worker,
нужен ли compiler/system FreeRDP и какие OS/CPU/libc поддерживаются.

`pnpm npm:readme:check` проверяет все обнаруженные publishable workspace-пакеты
и оба шаблона runtime; проверка включена в `pnpm check`. Новый adapter без README
также не проходит её. Native packager копирует соответствующий платформе
шаблон из `docs/npm/` в корень генерируемого пакета. Native packaging и внешний
Fastify consumer проверяют **README из готового архива**, а не только исходник.

Перед публикацией проверяйте каждый точный архив, который будет отправлен:

```sh
node scripts/check-npm-readmes.mjs --archives build/release/first.tgz build/release/second.tgz
```

Только после успешной проверки архивов запускайте `npm publish`. Содержимое
README при этом должно быть актуально для конкретной версии. npm отображает
корневой README на странице пакета; [официальная документация](https://docs.npmjs.com/about-package-readme-files/).
Смена README для npm требует новой публикации с новой версией. Уже принятые
теги/архивы сохраняются, а опубликованную пару name/version нельзя переиспользовать
даже после удаления; [правила npm](https://docs.npmjs.com/policies/unpublish/).
Этот documentation-only блок не меняет запланированные версии адаптеров.
Явное последующее указание пользователя завершить уже принятый 0.2.1
разрешает допубликацию именно исторического набора ниже: это исключение для
готовых неизменяемых архивов, а не отмена README-проверок новых релизов.

## Исторический набор 0.2.1

На машине подготовки точные проверенные архивы находятся в
`build/release-423-archives/`. Они не пересобираются при публикации:

| Порядок | Архив |
| --- | --- |
| 1 | `freerdp-bridge-runtime-win32-x64-0.2.1.tgz` |
| 2 | `freerdp-bridge-runtime-linux-x64-gnu-0.2.1.tgz` |
| 3 | `freerdp-bridge-protocol-0.2.1.tgz` |
| 4 | `freerdp-bridge-config-0.2.1.tgz` |
| 5 | `freerdp-bridge-node-0.2.1.tgz` |
| 6 | `freerdp-bridge-api-0.2.1.tgz` |
| 7 | `freerdp-bridge-fastify-0.2.1.tgz` |

SHA-256 native-архивов записаны в [423](history/iterations/401-450.md#iteration-423), пяти неизменённых
JS-архивов — в [422](history/iterations/401-450.md#iteration-422). Локальный
`build/release-423-artifact-audit.json` дополнительно содержит SHA-512 каждого
архива, а `build/release-423-npm-dry-run.json` подтверждает соответствие npm
integrity. Нельзя заменять уже опубликованную версию другими байтами.

Набор выше был подготовлен **до** нового требования README. Корневое описание
имел только Fastify; другие шесть архивов не проходят новую проверку. Их нельзя
перепаковать под уже принятый `v0.2.1`. Для следующей согласованной версии
будут подготовлены новые архивы с README. По последующему прямому решению
пользователя исторический набор допубликовывается в исходном виде; он не
переобозначается как прошедший новую проверку README.

## Интерактивная публикация владельцем

Следующий пример соответствует исходному набору 0.2.1. Прежде чем отправлять
архив, проверьте отсутствие версии либо совпадение уже опубликованной
`dist.integrity`. Подтверждённый пакет не публикуется повторно. Для следующих
релизов дополнительно обязательна указанная выше проверка README.
Набор 0.2.1 уже опубликован; повторная публикация этих пар name/version не нужна.

Если владелец предпочитает подтверждать 2FA в собственном терминале, из
корня проекта с Node.js 24 выполните для каждого архива в указанном порядке:

```sh
npm publish ./build/release-423-archives/freerdp-bridge-runtime-win32-x64-0.2.1.tgz --access public --ignore-scripts --registry=https://registry.npmjs.org/ --logs-max=0
```

Меняется только имя архива. Подтверждение проходит в интерактивном клиенте
npm; код не добавляется к командной строке и не сохраняется в репозитории.
При ошибке остановитесь и сохраните только её фиксированный код без секретов.
Не делайте unpublish, не меняйте существующий тег и не перепаковывайте архивы.

Если на Windows требуется доверенная системная цепочка CA, Node.js 24
поддерживает `NODE_USE_SYSTEM_CA=1`; SSL-проверка остаётся включённой.
После успешной публикации проверяются registry `dist.integrity` всех пакетов
и новый внешний проект с обычными registry dependencies без file/workspace
overrides. Только эта проверка подтверждает доступность полного npm-графа.

Успешный `npm publish` не означает немедленную install-доступность:
[npm выполняет проверку новых пакетов перед открытием доступа](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).
Официально описана типичная задержка около пяти минут, иногда 15 минут и более;
это не гарантированный срок. Записывайте успешную отправку отдельно от
подтверждения публичных name/version/integrity. Пока проверка чтением не
завершена, сохраните receipt и ожидайте доступности, не отправляя уже принятый
архив повторно. Финальную consumer-проверку запускайте после доступности всего
набора.
