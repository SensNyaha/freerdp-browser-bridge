# npm без ручного подтверждения каждого выпуска

По прямому решению пользователя новые delivery workflows должны публиковать
пакеты автоматически. GitHub-владелец — **`SensNyaha`**, npm scope —
**`@freerdp-bridge`**. Это разные пространства имён. Очередь интерактивных
approve остановлена по просьбе пользователя; автоматически её не возобновлять.

Текущий результат: все десять пакетов 0.2.4 публичны с точным integrity;
девять существующих имён фактически опубликованы через OIDC. Express прошёл
единственный отдельно разрешённый bootstrap approve; его trust создан и
прочитан обратно, workflow проверяет и пропускает совпадающую версию. Все пять
workflows и четыре чистых Windows/Linux consumers проходят.
[Приёмка](ITERATION_441.md). Для следующей новой Express версии проверьте
срок неиспользованного trust перед публикацией; первый реальный OIDC write
Express этим bootstrap не доказан.

## Выбранный механизм

Используйте [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
через OIDC из GitHub-hosted Actions. npm доверяет конкретному repository и
имени workflow, а GitHub выдаёт краткоживущую identity для job. Долговечный
`NPM_TOKEN`, сохранённый OTP или отключение account 2FA не требуются.

Критически важно разрешить trusted publisher действие **Allow npm publish**.
Разрешение только `npm stage publish` оставляет ручное 2FA для каждого approve
и не решает задачу пользователя. Прямой `npm publish` из правильно привязанного
OIDC workflow публикует без этих локальных browser prompts.

## Репозитории для подготовки

Имена ниже — выбранные локальные delivery targets, не утверждение, что
репозитории уже созданы или workflow выполнен на GitHub. Пользователь сам
первоначально планировал пушить подготовленные локальные репозитории; по его
последующему прямому поручению агент уже отправил все пять main/v0.2.4 и
независимо сверил refs/workflow bytes. Используется workflow filename
`npm-publish.yml`; он должен реально существовать под `.github/workflows/`.

| GitHub repository | npm packages |
| --- | --- |
| `SensNyaha/freerdp-browser-bridge` | protocol, config, node, api, оба native runtime |
| `SensNyaha/freerdp-bridge-fastify` | `@freerdp-bridge/fastify` |
| `SensNyaha/freerdp-bridge-nestjs` | `@freerdp-bridge/nestjs` |
| `SensNyaha/freerdp-bridge-http` | `@freerdp-bridge/http` |
| `SensNyaha/freerdp-bridge-express` | `@freerdp-bridge/express` |

Standalone OS installers по последнему решению пользователя добавляются в
Releases существующего `SensNyaha/freerdp-browser-bridge`, с автоматическим
workflow на push в `master`/`main`. Отдельный standalone repository больше не
планируется. Этот GitHub installer workflow не является npm Trusted Publisher.

В текущем релизном checkout Git remote отсутствует. npm manifests 0.2.4 и
генератор native package получают соответствующие `repository.url` до
приёмки архивов. Поле должно совпадать с repository, из которого фактически
выполняется OIDC публикация. Внутренние пакеты не требуют отдельных delivery
repos: они публикуются из общего core, а npm устанавливает их транзитивно.

## Однократная настройка после push репозиториев

1. Загрузите подготовленный repository с нужным workflow на GitHub.
2. На npm: package → Settings → Trusted publishing → GitHub Actions.
3. Укажите owner `SensNyaha`, точное repository name из таблицы и filename
   `npm-publish.yml` (без пути `.github/workflows/`).
4. Разрешите **npm publish**. Environment укажите только если workflow
   действительно использует GitHub environment с тем же именем.
5. Запустите первую публикацию в течение двух дней после создания привязки:
   неиспользованная новая конфигурация npm истекает. Поэтому её не создают
   заранее, пока репозиторий/workflow ещё не готовы.

Node.js 24 и закреплённый npm 11.19.0 удовлетворяют требованиям OIDC. Job
должен иметь `permissions: { contents: read, id-token: write }`. Публикация
использует официальный npm registry и `npm publish <accepted.tgz> --access public`
через OIDC, без `NODE_AUTH_TOKEN`. Сначала проверяются версия, audit/integrity,
repository binding, dependencies и необходимые acceptance checks. Уже
опубликованная та же версия с другим содержимым должна отказать; перепаковка,
unpublish и перемещение исторических тегов не являются способом исправления.

При нескольких пакетах настройка поддерживает [bulk usage через npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/#bulk-usage).
Например, для уже существующего пакета после готовности repository/workflow:

```sh
npm trust github @freerdp-bridge/fastify --repo SensNyaha/freerdp-bridge-fastify --file npm-publish.yml --allow-publish --yes
```

Это команда изменения account/package settings, а не публикации. Первое
подтверждение выполняет владелец в официальном npm UI; npm документирует
возможность пропуска повторной 2FA на следующие пять минут для этой настройки.
Остальные привязки можно создавать циклом, оставляя рекомендуемый интервал
2 секунды. Не создавайте дубликаты и не удаляйте существующие trust configs
автоматически. Настройка девяти существующих packages теперь выполнена:
после официального login владельца `sensnyaha` и одного подтверждения доступа
официальный `npm trust github --allow-publish --yes` создаёт и read-back
проверяет все девять привязок. Пяти минутный skip-window позволяет выполнить
это без новой очереди per-package browser approvals. Express создаётся
отдельно как новое имя и ещё не имеет этой привязки.
[Фактический checkpoint](ITERATION_440.md). Dry-run сам по себе не является
проверкой реальной OIDC identity.

## Исторические checkpoints до завершения iteration 441

0.2.2: все восемь accepted stages подтверждены и публичны, точный integrity и
чистые registry-only Windows/Linux NestJS consumers проходят.

0.2.3: оба runtime публичны; остальные семь пакетов остаются accepted stages.
Текущие `npm stage approve` требуют интерактивной identity и не используют
OIDC. Их нельзя автоматически approve, перепубликовать напрямую поверх stage
или изменить accepted bytes, чтобы обойти этот контракт. Ручная очередь
остановлена на protocol 0.2.3 до нового решения пользователя. Это отдельный
незавершённый gate, а не успешная публикация полного 0.2.3 набора.

0.2.4: [локальная приёмка десяти точных архивов](ITERATION_438.md) проходит
с верным GitHub owner и repository metadata. Core GitHub Release опубликован,
обе hosted npm validate-матрицы проходят; фактический OIDC publish первой
Windows runtime версии подтверждён независимым public integrity. Остальная
публикация ещё продолжается: registry visibility запаздывает относительно
accepted CLI upload; неизменяемый workflow останавливается до public read-back.
Нельзя объявлять весь набор опубликованным на основании первого пакета.
После отдельного разрешения пользователя создан только один stage нового
Express имени `df36c3b9-2b42-4849-9736-956495651a31`; exact integrity совпадает,
approve ожидает публичных core/HTTP dependencies. Старая 0.2.3 очередь не
возобновлена. GitHub Releases для standalone должны
генерироваться отдельно на push в `master`/`main`, согласно запросу пользователя.
