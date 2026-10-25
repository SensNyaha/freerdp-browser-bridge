# Native runtime в npm-проекте

Native runtime принят вместе с Fastify **0.2.1**: все product manifests и
нативные бинарники согласованы на 0.2.1. [Финальная приёмка](ITERATION_424.md).
Все семь пакетов опубликованы; integrity и новые registry-only проекты на
Windows/Linux проверены в [426](history/iterations/401-450.md#iteration-426).
Более ранние development-комплекты 0.2.0, их проверки и ограничения сохраняются
в [итерации 420](history/iterations/401-450.md#iteration-420) и [итерации 421](history/iterations/401-450.md#iteration-421);
они не переименовываются в релизные архивы 0.2.1.

Текущий согласованный npm-набор — **0.2.5**: десять точных архивов публичны,
все четыре adapter проходят свежие Windows/Linux registry-only consumers.
[Публикация](ITERATION_456.md). Ниже обычная установка использует этот набор;
первоначальная приёмка 0.2.1 выше сохранена как история.

## Установка в приложении

Нужны Node.js 24 и полный native пакет той же product version, что и bridge.
Готовые native executables поставляются в npm tarball: у потребителя не нужны
CMake, compiler, system FreeRDP или сетевой `postinstall`. Node.js и браузер
в эти пакеты не входят. Подготовлены два имени:

| Пакет | Профиль |
| --- | --- |
| `@freerdp-bridge/runtime-linux-x64-gnu` | Linux x64 с glibc; worker, IPC-only addon, process query, private DSOs, notices |
| `@freerdp-bridge/runtime-win32-x64` | Windows x64; worker, private directory/resource helper, DLL/CRT, notices |

Для опубликованного 0.2.1 выберите одну команду под ОС сервера:

```sh
# Linux x64 / glibc
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.2.5 @freerdp-bridge/runtime-linux-x64-gnu@0.2.5

# Windows x64
npm install fastify@5.12.5 @freerdp-bridge/fastify@0.2.5 @freerdp-bridge/runtime-win32-x64@0.2.5
```

Для ещё неопубликованного development-снимка установите соответствующие локальные
архивы, заменив также его JS workspace dependencies. Проверяющий helper делает это
через overrides в отдельном проекте; [Fastify usage](FASTIFY_USAGE.md).
Runtime сейчас устанавливается явно рядом с adapter. Автоматическая установка
через `optionalDependencies` ещё не подключена. Не считайте успешную установку
одного JS adapter доказательством наличия native worker.

Разрешите native пакет один раз во время старта приложения, до `listen`:

```ts
import { rdpBridgePlugin, resolveNativeRuntime } from '@freerdp-bridge/fastify';

const worker = await resolveNativeRuntime({
  runtimeRoot: '/private/run/rdp-bridge',
});
app.register(rdpBridgePlugin, {
  prefix: '/rdp',
  worker,
  authenticate: verifyApplicationIdentity,
  allowedOrigins: ['https://app.example'],
});
```

На Windows укажите абсолютный частный writable путь в формате Windows. Resolver
не создаёт runtime directories: ими владеет существующий lifecycle worker.
`workerPath` на Windows возвращается как namespace path для длинных npm/pnpm
каталогов. Не обрезайте этот префикс перед передачей WorkerOptions.

По умолчанию resolver выбирает имя по текущим OS/CPU/libc и ищет пакет через
стандартное разрешение Node. Для deployment, где package manager изолирует
dependencies иначе, можно передать абсолютный `packageDirectory` установленного
runtime package. Это только доверенная настройка host, никогда не поле JSON
сессии или browser query. Каталог должен содержать `package.json`,
`runtime-manifest.json` и полный `runtime/`. Не указывайте просто `bin/`.

## Что проверяется до запуска

Resolver отказывает на неподдержанном Node/OS/CPU/libc, при отсутствии пакета,
несовпадении product version/name, FreeRDP 3.32.1 или pinned commit
`bf217a504e54cc719880c228e82353382cd7d4fa`. Затем он проверяет ограниченный
инвентарь и SHA-256 каждого файла. Лишние файлы, отсутствующие файлы, symlink
компоненты, дубликаты путей и выходы из runtime root запрещены. В Linux
дополнительно проверяются executable bits и существующая worker/addon pairing.
Возвращаемый `ipcTransport: 'auto'` сохраняет pairing-проверку при старте worker.

Manifest schema 1 содержит `productVersion`, `freeRdpVersion`, `freeRdpCommit`,
`platform`, `arch` и массив `files` с `path`, `bytes`, `sha256`. Ограничения:
до 512 файлов, 64 MiB на файл, 256 MiB суммарно; JSON до 128 KiB до разбора.
Перечень дерева ограничен 1024 entries и глубиной 16. Manifest не является
подписью издателя; используйте доверенный registry/архив и read-only deployment.
Проверка не защищает от привилегированного изменения файлов после старта.

Ошибки содержат фиксированный `NativeRuntimeError.code`, без исходных путей
или parser/native сообщений. Среди них: `NATIVE_RUNTIME_NOT_INSTALLED`,
`NATIVE_RUNTIME_MISMATCH`, `NATIVE_RUNTIME_INTEGRITY`,
`NATIVE_RUNTIME_PERMISSION`, `NATIVE_RUNTIME_PLATFORM`, `NATIVE_RUNTIME_LIBC`
и `NATIVE_RUNTIME_INVALID`. Исправьте deployment; не откатывайтесь молча к
старому worker, framed transport или системному FreeRDP.

Resolver ничего не скачивает, не запускает RDP и не загружает FreeRDP в Node.
Фактический build/feature/IPC probe остаётся частью запуска bridge. Серверные
RDP secrets передаются worker только через приватный IPC.

## Как собрать release tarball

Сначала подготовьте проверенный, установленный native stage внутри `build/`
того же product version. Затем из корня проекта на целевой ОС:

```sh
pnpm build
node scripts/package-native-npm.mjs build/verified-native-stage
```

Генератор создаёт новый `build/npm-native-<platform>-*/package/` и `archives/`,
не изменяя исходный stage или прежние архивы. Он проверяет native version,
пин dependencies, codec probes, копирует ограниченный комплект и разворачивает
только внутренние file symlinks. После копирования проверяются inventory,
pairing и relocation при чистом loader environment. Итоговый tgz ограничен
128 MiB. В receipt записываются точные archive SHA-256, размеры, platform и
`published: false`.

Пакет также содержит `corresponding-source/`: полные исходные архивы LGPL
компонентов (Windows: libusb; Linux: libusb, eudev, libfuse, numactl), точные
port recipes/патчи из SBOM и platform triplets. Исходники сохраняют собственные
лицензии. Они не извлекаются и не исполняются при установке и не требуют
компилятора у потребителя готового runtime. README внутри объясняет пересборку
и использование собственной совместимой модификации библиотеки; manifest
фиксирует SHA-512 архивов и SHA-256 recipes/патчей.

На машине подготовки нужны исходные архивы в `.tools/vcpkg-downloads/` и
recipes из проверенного stage, `native/vcpkg/ports/` или `.deps/vcpkg/ports/`.
Упаковщик сверяет source revision/version/checksum с build SBOM и ожидаемыми
пинами; отсутствие или несовпадение останавливает упаковку. Он не скачивает
недостающий source автоматически. Лимиты source companions: 8 MiB на архив,
1 MiB на JSON/recipe, 16 MiB суммарных исходных данных, до 64 recipes на
компонент; source tarballs копируются целиком без распаковки. Receipt дополнен
`sourceComponents` и `sourceBytes`. Эти файлы лежат вне исполняемого `runtime/`;
добавление исходников не меняет native бинарники или pairing manifest.

Linux `bin`-записи служат для сохранения executable permissions при npm/pnpm
установке. `freerdp-bridge-worker` и process-query — внутренние IPC executables,
а не пользовательский RDP CLI; у worker нет произвольных FreeRDP argv.
Runtime-check предназначен для диагностики комплекта. Не передавайте им
учётные данные через аргументы или environment.

Проверка внешнего потребителя из свежих архивов:

```sh
node scripts/test-fastify-package.mjs --runtime-archive build/npm-native-PLATFORM-ID/archives/RUNTIME.tgz
node scripts/test-fastify-package.mjs --npm --runtime-archive build/npm-native-PLATFORM-ID/archives/RUNTIME.tgz
```

Первый вариант требует наполненного offline pnpm store/metadata; второй
использует npm registry со строгой TLS-проверкой. `--ignore-scripts` в обоих
вариантах подтверждает отсутствие обязательной install-компиляции. Проверяются
строгие declarations, HTTP/WS composition и настоящий native certificate
refusal. Успех fake media transport не заменяет browser decode/real RDP gate.

## Лицензии и платформенная приёмка

Собственный bridge-код имеет MIT. Полный native пакет содержит зависимости с
их отдельными условиями. Читайте `THIRD_PARTY_NOTICES.md`, `runtime/share/`
licenses, port metadata и [SBOM](SBOM.md). MIT не перелицензирует FreeRDP,
libusb, codecs или Microsoft runtime. Этот инвентарь не заменяет provenance,
подписи, upstream license review и требования конкретного deployment.
LGPL-исходники и патчи сопровождают бинарники в том же npm-архиве; читайте
их исходные license files и [LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html).
Windows notices отдельно ссылаются на [Microsoft redistribution list](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution)
и [Visual C++ Runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/);
Microsoft DLL остаются под применимыми условиями Microsoft.

Проверка GCC 8.3 и runtime relocation отделена от установленной Astra Linux
1.7.5 / RED OS 7.3 и их security profiles. Сохраняется обязательная поддержка
RED OS/GCC 11 и MSVC; конкретные реальные RDP/browser результаты фиксируются
отдельно. macOS, ARM и musl не заявлены поддержанными этим набором пакетов.

Справочные первичные источники: [npm platform/bin fields](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/),
[Node diagnostic report header](https://nodejs.org/download/release/v24.21.0/docs/api/report.html).
