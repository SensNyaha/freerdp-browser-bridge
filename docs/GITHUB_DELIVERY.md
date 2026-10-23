# Отдельные GitHub repositories и публикация принятых архивов

Реализация готовится на `feature/github-delivery-oidc` после локального
`v0.2.4` (`4b018fc`). GitHub owner — **SensNyaha**, npm scope —
**@freerdp-bridge**. Пользователь самостоятельно пушит подготовленные локальные
Git repositories. Hosted repositories, GitHub Releases и npm trust ещё не
объявляются настроенными.

## Структура delivery

- `SensNyaha/freerdp-browser-bridge`: полный принятый source snapshot, четыре
  общих JS-пакета и два native runtime.
- `SensNyaha/freerdp-bridge-fastify`, `freerdp-bridge-nestjs`,
  `freerdp-bridge-http`, `freerdp-bridge-express`: исходники соответствующей
  библиотеки, отдельный build/test harness, полные guides и её принятый архив.
- `SensNyaha/freerdp-bridge-standalone`: последующий standalone installer и
  отдельный workflow GitHub Releases на push в `master`/`main`.

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
3. Пользователь создаёт/push-ит соответствующие GitHub repositories и tags.
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
GitHub CLI не установлен в текущем PATH; подготовка/локальная проверка не
выдаётся за выполненный remote bootstrap.

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
