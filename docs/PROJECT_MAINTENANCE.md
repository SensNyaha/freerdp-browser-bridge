# Структура проекта и очистка

Текущая работа по обслуживанию идёт в `chore/project-cleanup-0.2.5` после
публичной [приёмки 0.2.5](ITERATION_457.md). Текущая цель ограничена очисткой
и упрощением документации; новые функции не разрабатываются. 0.2.3 оставлена архивной без
допубликации семи старых JS-пакетов по решению пользователя.

## Что сохраняется

| Каталог | Назначение |
| --- | --- |
| `apps/`, `packages/`, `native/`, `scripts/`, `tests/` | Рабочие исходники и воспроизводимые проверки |
| `docs/`, корневые нормативные MD | Актуальные guides, контракты и сгруппированные доказательства |
| `.tools/`, `.deps/`, рабочие compiler/browser fixtures | Закреплённые входы и инструменты следующих сборок |
| `.local-tests/` | Только действующие локальные lab configs, credentials, known_hosts и authority receipts |
| `.runtime/` | Временное состояние worker; вне работающих сессий должно быть пустым |
| `build/` | Генерируемые сборки, проверенные release archives и компактные retained receipts; не исходники продукта |

Не удаляйте каталоги только по префиксу имени. Сначала проверьте live-процессы,
Git/worktree status, ссылки/junctions, источник воспроизведения и нужные receipts.
Рекурсивное удаление допускает только проверенные абсолютные пути внутри проекта.
Секреты не копируются в build, Git, архивы документации или логи.

## Уже выполнено

Удалены девять устаревших native-build каталогов с сохранением receipts и
проверкой актуальных SDK/worker/release archives. Удалены два завершённых idle
packaging-контейнера; остальные проектные и чужие контейнеры сохранены.
[Подробности и размеры](ITERATION_458.md).

По отдельному запросу пользователя очищены скрытые каталоги:

- `.local-tests`: удалены 45 сгенерированных screenshots/метрик/отчётов и
  старых одноразовых файлов; 17 действующих файлов сохранены побайтово.
- `.runtime`: после проверки отсутствия worker/service удалены 36 пустых
  каталогов и единственный stale marker `runtime-v1`; корень оставлен пустым.
- Содержимое credentials не выводилось, ACL не менялись.

[Receipt скрытых каталогов](evidence/HIDDEN_CLEANUP_459.json).

## Документация

README — короткая точка входа, [docs map](README.md) — шесть основных тем,
[standalone install](STANDALONE_INSTALL.md) — практические команды ОС.
444 старых iteration-отчёта собраны в [10 томов](history/iterations/README.md),
ключевые релизные приёмки оставлены отдельно. Содержание не сокращено:
исходные SHA-256 и source commit позволяют восстановить прежний файл.
Ссылки обновлены; проверяются целевые файлы, якоря и полное сохранение текста.

Проверка переноса: 444 исходных текста и SHA-256 совпали; 2235 локальных ссылок,
1183 явных якоря, ноль новых/ранее отсутствовавших targets. Все 21 unit-проверка
GitHub delivery прошли, включая manifests, immutable archives, source inventory,
историю, bootstrap и OIDC guards. Product code и опубликованные теги/архивы
этим переносом не меняются.

## Дополнительная очистка build

После no-follow проверки полных путей удалены ещё **72** генерируемых каталога:
старые native outputs, payload/portable/MSI-дубли и временные npm consumers.
Это **9409040412 логических байт**, а не измерение физически освобождённого места.
Сохранены и сверены 188 receipts/lockfiles/результатов. После удаления проверены
19 accepted npm archives (0.2.3/0.2.5), 8 финальных installer/checksum files и
артефакты текущего worker. Актуальная native-сборка, registry-only payload и по
одному чистому consumer каждого адаптера сохранены.
[Receipt](evidence/BUILD_CLEANUP_459.json).

Удалены **7** чистых старых Git worktrees — ещё **1072148445 логических байт**.
Все коммиты остались доступны в существующих ветках/тегах, 17 receipts сохранены.
779 junction/symlink сначала отвязаны без обхода targets; отдельный witness
проверяет, что nonrecursive удаление junction сохраняет target. Текущие Node,
pnpm и worker до/после совпадают по хешам. Отдельный compiler worktree позднее
удалён с восстановлением зависевшего от него локального SDK — см. ниже.
[Receipt worktrees](evidence/WORKTREE_CLEANUP_459.json).

После очистки текущая native-сборка проходит **CTest 36/36** и **13/13** настоящих
Node/native worker lifecycle-тестов, без ошибок и skips. Это проверка сохранённых
бинарников после удаления дублей; она не выдаётся за новую RDP/device приёмку.
[Regression receipt](evidence/CLEANUP_REGRESSION_459.json).

## Логи, последний worktree и локальный SDK

Удалены 3319 старых корневых build-логов (**186415728 логических байт**),
пять итоговых acceptance/regression логов сохранены. Свежие и изменяющиеся
файлы не затронуты. [Receipt](evidence/LOG_CLEANUP_460.json).

Последний чистый worktree `worktree-redos73-gcc11` удалён с сохранением
коммитов и семи receipts: **3115554671 логический байт**, 389 ссылок отвязаны
без обхода targets. При последующей проверке обнаружена ошибка preflight:
корневой SDK `build/freerdp-source-clean-YyYMr3` был junction внутрь этого
worktree. Совпадение Git commit у двух путей не доказывало независимость копий.
Локальный SDK оказался удалён; опубликованные архивы и принятый worker не
изменились. [Исправленный receipt](evidence/COMPILER_WORKTREE_CLEANUP_460.json).

SDK восстановлен штатной чистой Release-сборкой из закреплённого FreeRDP
3.32.1 и сохранённых зависимостей. Новый физический каталог —
`build/freerdp-source-clean-czdbUM`, новая native-сборка —
`build/native-clean-7MLpLU`. SDK probe проходит 1/1, worker CTest — 36/36,
Node/native проверки — 27 pass, 0 fail; один тест Unix transport пропущен на
Windows. Source hash, FreeRDP commit и hash-bound override совпадают с принятой
0.2.5. Это восстановление среды сборки, не новая RDP/device-приёмка.
Прежний SDK receipt сохранён отдельно как историческое доказательство;
новая сборка имеет собственный receipt и не выдаётся за прежние бинарники.
[Доказательства восстановления](evidence/SDK_RECOVERY_460.json).

После восстановления удалены ещё семь старых Release/failed SDK и fixtures:
**1600024644 логических байта**, 13 receipts сохранены, 508 ссылок отвязаны
без обхода targets. Перед удалением проверены 7042 ссылки во всём доступном
дереве проекта; входящих ссылок из сохраняемых каталогов в удаляемые не было.
Debug SDK `build/freerdp-source-clean-iVDioP` и его dependency prefix
`build/dependencies-source-clean-MypULr` сохранены для отладки.
[Receipt](evidence/SDK_DOUBLES_CLEANUP_460.json).

Также удалены семь старых transport/prototype TAR (**1103503360 логических
байт**): прежние копии Node/SDK/pnpm store, три временных npm consumer и ранний
standalone-прототип. Состав проверен; внутри нет npm release archives,
`.git`, `.local-tests` или `.runtime`. Текущие scripts/tests на них не ссылаются.
Принятые npm/installer archives исключены из этой группы.
[Receipt с SHA-256](evidence/TRANSPORT_CLEANUP_460.json).

Удалён дублирующий `astra-407-docker-context` (**453440476 логических байт**).
Его runtime TAR побайтово совпадает с сохранённым
`build/iteration-407-astra-runtime.tar`, Node TAR — с
`.tools/node-v24.21.0-linux-x64.tar.xz`. Dockerfile сохранён в retained evidence;
для воспроизведения контекста нужны эти два архива под прежними именами и
сохранённый Dockerfile. Образы/контейнеры этим действием не удалялись.
[Receipt и канонические входы](evidence/CONTEXT_CLEANUP_460.json).

Итоговая Windows-проверка после этих удалений: `pnpm check` — **1004 pass,
63 skip, 0 fail**, повторный CTest новой native-сборки — **36/36**. Все 19
принятых npm archives и восемь installer/checksum files совпадают с сохранёнными
digest. Проверены 2242 локальные ссылки и 1183 iteration-якоря без broken targets;
444 исходных текста/SHA-256 сохранены. После тестов удалены четыре оставленных
ими пустых runtime-fixture каталога; `.runtime` снова пуст, ACL не менялись.

## Delivery и история helpers

Удалены четыре старые копии delivery 0.2.4 и связанный CI worktree
`github-core-ci-440`: **1772713034 логических байта**, 111514 файлов. Перед
удалением все ветки, теги и HEAD 12 репозиториев сохранены в Git bundles
общим объёмом **11897094 байта**. Каждый bundle восстановлен в независимый
bare-репозиторий с проверкой refs, доступности commits и `git fsck`.
Все 32 копии npm archives совпали с десятью каноническими архивами
`build/release-436-archives`. Публичный core tag 0.2.4 сверён с GitHub:
`16b29a7b4c72db98d88cbc2f1ad38ffcafcfd29e`.
[Receipt и пути Git bundles](evidence/DELIVERY_CLEANUP_461.json).

3641 junction/symlink отвязаны без обхода targets. Связанный CI worktree
удалён через Git до удаления его основного репозитория. Из-за разного
владения старыми `node_modules` удаление продолжено от владельца workspace;
ACL не менялись. Delivery 0.2.5, текущие SDK, dependency prefix и worker
сохранены. Для просмотра исходников старого core можно восстановить bundle:

```sh
git clone --branch main build/retained-evidence-461/deliveries-mRFXG7/github-delivery-0.2.4-rwdL2I--freerdp-browser-bridge.bundle build/restored-024-core
```

**701** старый helper/отчёт до итерации 450 убран из корня build в
`build/retained-evidence-461/helpers-before-450.zip` — **905833 байта** вместо
2407549 исходных байт. ZIP проверен чтением каждого entry: все исходные
размеры и SHA-256 совпали. `manifest.json` внутри хранит прежние относительные
пути и digest. Текущие helpers 450+, compiler recipes 407/410/411 и найденные
литеральные зависимости исполняемых файлов сохранены; проверены 923 tracked
source-файла. Известные lab-пароли проверялись только в RAM: совпадений в
архивируемых файлах нет, credentials не копировались и не выводились.
[Receipt и SHA-256 ZIP](evidence/HELPER_ARCHIVE_461.json).

Для просмотра истории извлекайте её в отдельный каталог:

```powershell
Expand-Archive -LiteralPath build/retained-evidence-461/helpers-before-450.zip -DestinationPath build/helper-history-before-450
```

Это исходники исторических проверок, а не готовая повторная приёмка:
для повторного запуска нужны соответствующие build inputs и свежие receipts.
После этого блока CTest проходит **36/36**, delivery/npm README unit-проверки —
**24/24**. Побайтово сохранены 29 принятых/архивных npm archives (0.2.3/0.2.4/0.2.5)
и восемь финальных installer/checksum files. Product source не менялся;
новая RDP/device-приёмка не заявляется.
[Regression receipt](evidence/CLEANUP_REGRESSION_461.json).

Docker image inventory теперь содержит два образа bridge: текущий RDP/browser
образ и RPM builder. Они сохраняются для следующих проверок и выпусков.
BuildKit cache, включая родителей сохраняемых записей, требует отдельного
аудита; общий image/cache/volume prune не выполнялся. Точечные cache-фильтры
описаны в [официальной документации Docker](https://docs.docker.com/reference/cli/docker/buildx/prune/).

## Проверки перед следующей очисткой

1. Получить `lstat` и `realpath` каждого сохраняемого SDK, toolchain, worker,
   dependency prefix и Catch2 source; убедиться, что физический путь не входит
   в удаляемый каталог. Проверить также цепочки receipt/CMakeCache.
2. Проверить ссылки **из остальных каталогов в удаляемые**, а не только ссылки
   внутри удаляемого дерева. Рекурсивный обход не должен следовать junctions.
3. Сохранить нужные receipts, проверить отсутствие уникальных исходников,
   Git-коммитов, секретов и активных процессов; затем удалять только явные
   абсолютные пути внутри workspace.
4. После удаления проверить доступность сохранённых входов, хеши принятых
   артефактов, CTest и необходимые Node/native проверки. Новый receipt должен
   описывать фактическую сборку; старый не переписывается под новую.

Последним блоком удалены ещё **99** старых generated stage/runtime/consumer,
prototype и Docker-context каталогов: 72810 файлов, 4275627085 логических байт.
В них нет tracked source или вложенных Git-репозиториев; входящих ссылок из
сохранённых каталогов нет. Дополнительно удалены пять пробных DEB/RPM/TGZ
из корня build (610894713 байт). Финальные публичные файлы сохранены отдельно.
Затем удалены ещё 523 старых скрипта, лога и промежуточных архива из корня build,
устаревший source snapshot, старый screenshot и временные скрипты самой очистки.
В корне build осталось **12 файлов**: native features/dependency metadata,
manifest финальных установщиков и audit/dry-run metadata сохранённых релизов.
Нужные Linux compiler inputs собраны в `build/compiler-inputs`, последние
проверки — в `build/current-validation`; новые архивы мусора не создавались.
За весь этот блок свободное место D: выросло с 283716333568 до 289230340096 байт,
то есть на **5,51 ГБ**; это измерение диска, а не сумма размеров hardlinks.
После удаления CTest: **36/36**; хеши 29 npm archives, восьми финальных файлов
установщиков, текущих SDK и обоих native workers совпали.

Перенос исторических отчётов не изменяет статус продукта и не перепаковывает
опубликованные артефакты. Закреплённые compiler inputs, текущий cache сборки
и чужие Docker-ресурсы сохраняются. Основная документация организована в шесть
смысловых блоков в [оглавлении](README.md).
