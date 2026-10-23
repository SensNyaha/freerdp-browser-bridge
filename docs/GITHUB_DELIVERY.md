# Отдельные GitHub repositories и публикация принятых архивов

Реализация готовится на `feature/github-delivery-oidc` после локального
`v0.2.4` (`4b018fc`). GitHub owner — **SensNyaha**, npm scope —
**@freerdp-bridge**. После первоначального плана самостоятельного push
пользователь создал пять GitHub repositories и явно поручил агенту отправить
их. Все пять `main` и annotated `v0.2.4` теперь запушены и независимо сверены.
Core GitHub Release уже опубликован с точными assets, девять существующих npm
packages публикуются через OIDC. Все десять npm архивов 0.2.4 публичны с accepted
integrity; пять Releases/workflows и четыре fresh Windows/Linux consumers
проходят. Express после разрешённого bootstrap также имеет read-back verified
trust. [Публикация](ITERATION_441.md), [CI checkpoint](ITERATION_440.md).

## Структура delivery

- `SensNyaha/freerdp-browser-bridge`: полный принятый source snapshot, четыре
  общих JS-пакета и два native runtime.
- `SensNyaha/freerdp-bridge-fastify`, `freerdp-bridge-nestjs`,
  `freerdp-bridge-http`, `freerdp-bridge-express`: исходники соответствующей
  библиотеки, отдельный build/test harness, полные guides и её принятый архив.
- По последнему решению пользователя standalone installers публикуются в
  **Releases существующего `SensNyaha/freerdp-browser-bridge`**. Workflow
  генерирует их автоматически на push в `master`/`main`; прежний план
  отдельного standalone repository отменён. Реализация/приёмка следуют после
  plugin delivery.

Native runtime не переносится внутрь Node/framework. Общие JS/native версии
совпадают, runtime устанавливается явно, target/device acceptance остаётся
отдельным. Непринятые дополнительные frameworks не получают фиктивных repos.

## Первичная передача immutable 0.2.4

Публикуются **точные уже принятые** `.tgz` из release audit. Пересборка native
бинарников на другом hosted compiler не гарантирует те же bytes и не заменяет
локальную приёмку. Поэтому local export разделяет source Git repositories и
соседний каталог `release-assets/`. Native tarballs, lab files, account configs
и npm credentials не коммитятся в новые Git repositories.

Порядок первоначальной доставки:

1. Экспортировать immutable source/tag и exact archives с проверкой SHA-256 из
   принятого tagged report, SHA-512, metadata, версий и repository binding.
2. Проверить независимые library builds/declarations/tests. Создать локальные
   repositories и их annotated release tags. Assets остаются вне Git.
3. Создать/push-ить соответствующие GitHub repositories и tags — выполнено
   для пяти перечисленных поставок 0.2.4 по последующему поручению пользователя.
4. Когда workflow существует на GitHub, настроить npm Trusted Publisher для
   каждого существующего package, разрешив **npm publish**, а не только stage.
5. Загрузить exact assets в GitHub Releases одним bootstrap запуском с обычной
   GitHub CLI authentication. Release публикуется лишь после загрузки assets.
6. `release: published` запускает проверки source inventory, archive hashes,
   package metadata и Windows/Linux smoke/integration; после них npm job
   публикует exact archive через OIDC без повторной per-package 2FA.

Core публикуется первым; adapter releases ждут публичных exact core dependencies.
HTTP публикуется перед Express, который зависит от HTTP. При повторном запуске
совпадающая публичная версия пропускается, другое содержимое отказывает.
Ни unpublish, ни замена assets, ни перемещение старых tags не выполняются.
GitHub CLI не установлен в текущем PATH. Фактическая загрузка пяти Releases
выполнена тем же проверенным bootstrap state machine через GitHub REST;
системная Git credential передаётся только в памяти и HTTPS header. Ни token
в argv/env/files, ни подмена локальной проверки внешней публикацией не нужны.

## Проверенная локальная поставка 0.2.4

Текущий каталог от корня рабочего проекта:
`build/github-delivery-0.2.4-rwdL2I/`. Его `delivery-bundle.json` содержит пять
проверенных source commits, а `release-assets/` — десять точных принятых
архивов и отдельные manifests. Предыдущие пробные экспорты не используются.

| Каталог внутри `repositories/` | Локальный commit / annotated `v0.2.4` |
| --- | --- |
| `freerdp-browser-bridge` | `16b29a7b4c72db98d88cbc2f1ad38ffcafcfd29e` |
| `freerdp-bridge-fastify` | `f9339f0ae1dbff2a3a72d716cb098b17e4d0a589` |
| `freerdp-bridge-nestjs` | `242d119d0f7b4f21444b69cbbf867100f1cf42e0` |
| `freerdp-bridge-http` | `29189ae17908a958308d983827cd7a57a04357ff` |
| `freerdp-bridge-express` | `ee1bf047b4ea426297ccefd22939fb5207fc7b62` |

Core main после успешных hosted foundation/sanitizer/fuzz checks продвинут
до b67d472; принятый v0.2.4 остаётся на исходном 16b29a7. Для точной локальной
проверки старого delivery manifest используйте checkout v0.2.4: инвентарь
закреплён за этим snapshot и не описывает последующие изменения main.

Все пять проходят Windows/Linux source builds и точные source/archive checks.
У адаптеров дополнительно проходят строгие consumer declarations,
интеграционные fixtures и byte-for-byte сравнение каждого compiled dist файла
с принятым архивом. Core smoke проверяет встроенный source workspace с exact
native runtime, TLS refusal, HTTP/WS и lifecycle. Он не заменяет реальный
RDP/device acceptance из исходного релиза. [Доказательства](ITERATION_439.md).

Создайте соответствующие пустые **public** repositories под `SensNyaha`.
В каждом локальном каталоге `origin` уже указывает на его GitHub URL. Например,
из корня проекта для core:

```sh
git -C build/github-delivery-0.2.4-rwdL2I/repositories/freerdp-browser-bridge push --set-upstream origin main
git -C build/github-delivery-0.2.4-rwdL2I/repositories/freerdp-browser-bridge push origin v0.2.4
```

Повторите для четырёх adapter-каталогов из таблицы. Не используйте force и не
смешивайте эти начальные histories с существующим непустым repository. Перед
созданием Release настройте [npm trust](NPM_TRUSTED_PUBLISHING.md), включая
**Allow npm publish** для каждого публикуемого пакета.

Этот первоначальный push уже выполнен агентом по прямому запросу пользователя.
GitHub refs и public workflow bytes для всех пяти совпадают с таблицей;
повторять команды не требуется. Не смешивайте исходную старую историю этого
рабочего checkout с новыми delivery histories. Core запускает существующие
foundation workflows на push; их фактический результат отслеживается отдельно
от ещё не запущенного npm workflow.

## Проверка и загрузка assets

Команды выполняются из исходного рабочего проекта под Node.js 24. Оригинальный
принятый tag в нём нужен скрипту для независимой сверки SHA-256 с tagged
acceptance report. Публичные source repositories не содержат эту старую Git
историю, credentials или native tarballs.

По умолчанию команда только проверяет локальные данные и печатает план:

```sh
node scripts/bootstrap-github-deliveries.mjs --bundle build/github-delivery-0.2.4-rwdL2I --kind all
```

После push и настройки trust установите официальный [GitHub CLI](https://cli.github.com/)
и выполните обычный `gh auth login --hostname github.com --web` под SensNyaha,
если CLI ещё не авторизован. Не передавайте токен скрипту или в чат. Начните
с core:

```sh
node scripts/bootstrap-github-deliveries.mjs --bundle build/github-delivery-0.2.4-rwdL2I --kind core --execute
```

`--execute` проверяет GitHub identity, public repository, pushed annotated tag
и byte-identical workflow. Затем создаёт draft, загружает недостающие assets,
сверяет размер и серверный `sha256:` digest каждого файла и только после этого
публикует draft. [GitHub API описывает digest](https://docs.github.com/en/rest/releases/assets).
Существующий совпадающий опубликованный release пропускается; несовпадающий
файл, посторонний asset или неопределённый upload останавливает запуск.
Clobber, изменение tags и повтор неопределённой записи в том же запуске не
применяются. Неполный собственный draft можно продолжить следующим запуском.

GitHub Actions работает асинхронно. Дождитесь успешного core workflow и точных
шести public npm packages, затем выполните:

```sh
node scripts/bootstrap-github-deliveries.mjs --bundle build/github-delivery-0.2.4-rwdL2I --kind all --execute
```

Скрипт проверяет публичный integrity зависимостей перед downstream releases.
Если HTTP ещё не опубликован в npm, Express не отправляется и возвращается
`DELIVERY_PUBLIC_DEPENDENCIES_PENDING`. После успешного HTTP workflow повторите
ту же команду: совпадающие GitHub Releases не загружаются заново. Для отдельной
поставки вместо `all` допустимы `fastify`, `nestjs`, `http`, `express`.

Первоначальный core bootstrap теперь выполнен через GitHub API с уже
подтверждённым системным Git credential (CLI здесь отсутствует). Credentials
используются только в памяти и HTTPS headers. Release `v0.2.4` содержит
шесть архивов и manifest, все server SHA-256 сверены перед публикацией draft.
Во время работы обнаружено, что by-tag API не показывает собственный draft;
bootstrap теперь также ищет его в ограниченном списке releases и отказывает
на duplicates. Существующий draft продолжен без повторного create/overwrite.

Synthetic API/CLI tests сами не доказывают actual upload, hosted workflow или
OIDC. Итоговая публикация всего набора требует actual workflow run, exact npm
integrity и свежих registry-only consumers. Новый Express bootstrap и старые
0.2.3 stages остаются отдельными account gates ниже.

Официальная [gh release create](https://cli.github.com/manual/gh_release_create)
при передаче assets сначала создаёт draft, загружает файлы и затем публикует
release. Используется `--verify-tag`, чтобы отсутствие pushed tag не создало
неожиданный tag на другом commit. Содержимое release соответствует manifest,
который проверяется независимо от факта успешного upload.

## Оставшиеся npm account gates

[Trusted publishing](NPM_TRUSTED_PUBLISHING.md) требует существующий npm package
и первый успешный publish новой trust-конфигурации в течение двух дней.
Настройка не выполняется заранее, пока repository/workflow не готовы.

Для нового Express package сначала нужен bootstrap существования пакета.
Официальный [npm stage publish для новых packages](https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/)
создаёт placeholder без ручного первого publish; первая staged версия всё
равно требует owner approve. Это однократный gate нового имени, а не ручная
очередь для каждого будущего релиза. Новый stage/approve сейчас не запускается
автоматически по прямому распоряжению пользователя.

Семь существующих JS stages 0.2.3 сохраняются отдельно. Их approve требует
интерактивной identity, не поддерживает OIDC и не обходится новым workflow.
Accepted archives не перепаковываются ради добавления нового repository field.
0.2.2 полностью опубликован и проверен. Все эти статусы остаются явными до
прохождения реальных external account/hosted acceptance gates.

## Проверяемость

Экспорт и workflow должны отказывать на неподдерживаемом owner/repository,
расхождении версии/tag, изменённых exact bytes, небезопасных путях/ссылках,
пропущенном/добавленном исходнике и чрезмерных JSON/archive/file размерах.
Проверки выполняются до загрузки/publish, выделения больших buffers или запуска
native smoke. CI использует официальный npm registry и краткоживущий OIDC;
секреты не копируются в файлы, argv, logs или delivery assets.

Локальная проверка workflow/fixture не подтверждает, что GitHub OIDC уже
настроен или что CI выполнился у пользователя. Реальные workflow runs, public
integrity и новые registry-only consumers фиксируются после push и publish.
