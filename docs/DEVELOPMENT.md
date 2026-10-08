# Building the foundation

Prerequisites: Node.js 24, pnpm 10.11.0, CMake >=3.24, Ninja and a C++20 compiler.
Windows: run in an x64 Visual Studio 2022 Developer shell. Linux: install Ninja and GCC/Clang.
No GUI, Docker or system FreeRDP is needed for this *lifecycle-only* development profile.

```sh
pnpm install --frozen-lockfile
pnpm build:native
pnpm test:native
pnpm check
node examples/lifecycle.mjs
pnpm --filter @freerdp-bridge/api start
```

API listens on localhost:8080 and exposes /healthz, /readyz, /v1/build and /v1/capabilities.
Foundation readiness means the native lifecycle executable can be started and negotiated,
not that an RDP connection can be created. RDP is reported false.

Runtime root may be configured through BRIDGE_SESSION_RUNTIME_DIR; binary location through
BRIDGE_WORKER_PATH. Neither setting contains per-session secrets.

```sh
cmake --preset sanitizers
cmake --build --preset sanitizers
ctest --preset sanitizers
BRIDGE_TEST_BINARY_DIR=build/sanitizers pnpm test
cmake --preset fuzz
cmake --build --preset fuzz
node scripts/seed-fuzz.mjs
build/fuzz/ipc-fuzz build/fuzz/corpus -max_total_time=20
```

The pinned FreeRDP source metadata is native/dependencies.json. The bundled development profile
links exact FreeRDP/WinPR 3.32.1 and creates/frees a headless client context. It does not implement
connection callbacks or claim RDP support. Foundation defaults to BRIDGE_WITH_FREERDP=OFF explicitly.

The Windows test machine originally had Node.js 22. A SHA-256 verified portable Node.js
24.21.0 and pnpm were installed under ignored .tools without changing system installation.
CI uses Node.js 24 directly. Catch2 v3.8.1 is fetched only at configure time, not at runtime.

On this machine, `./scripts/local-pnpm.ps1 check` selects the local Node/pnpm for one command.
The helper restores PATH after execution. It uses Windows system CA trust, keeping TLS checks
enabled. The native build still requires the Visual Studio x64 Developer shell.

Private dependency and runtime build (Windows x64 verified; Linux acceptance pending):

```sh
pnpm build:dependencies
pnpm build:freerdp
pnpm build:bundled
BRIDGE_TEST_BINARY_DIR=build/bundled pnpm check
pnpm test:bundle
```

On Windows, use an x64 Visual Studio Developer shell for the commands above. On this machine,
the workspace has long non-ASCII paths, so vcpkg requires a temporary short workspace alias:

```powershell
./scripts/native-build.ps1 dependencies
./scripts/native-build.ps1 freerdp
./scripts/native-build.ps1 bundled
$env:BRIDGE_TEST_BINARY_DIR = 'build/bundled'
./scripts/local-pnpm.ps1 check
./scripts/local-pnpm.ps1 test:bundle
```

The helper creates an unused R:–Z: subst alias, initializes the MSVC shell, selects local
Node.js and removes the alias in finally. Build caches contain this temporary alias; subsequent
builds must reuse the same available drive letter. Fresh checkouts can use installed Node.js 24
in an MSVC shell on a short ASCII workspace path; local-pnpm/native-build helpers are machine helpers.

Pinned vcpkg builds release shared libraries into .deps/installed/<triplet>, with downloads,
tooling, build trees and binary cache under .tools/.deps. No system installation or global vcpkg
integration is performed. ZLIB/OpenSSL/libusb paths are checked before building FreeRDP.
FFmpeg/OpenH264 bridge media providers are not implemented or advertised in this lifecycle profile.
Windows serial/parallel client modules are explicitly disabled because pinned upstream lacks them.

build/native-stage contains only the native runtime and licenses/metadata. Windows DLLs and
release CRT live beside the worker; Linux libraries use private lib paths with relative RPATH.
build/packages contains the ZIP/TGZ and SHA-256 sidecars. MSI/EXE/DEB/RPM generators can consume
the same CPack install rules once their tooling and installer integration are added and tested;
none of those installer formats is accepted yet. Node.js and the API are not in this native bundle.

rdp-worker --build-features and /v1/build expose compiled channel inventory and dependency versions.
Compiled channels do not imply working redirection. tests/packaging/relocate.test.mjs moves the
runtime to a path containing spaces, removes dependency PATH entries, validates loaded module
paths and static addins, then runs worker HELLO/heartbeat/shutdown and cleanup.

For the user-provided XRDP lab, non-secret connection parameters are in ignored .local-tests.
To persist its password, run ./scripts/save-xrdp-lab-credential.ps1 interactively. It accepts no
password arguments and stores a current-user Windows DPAPI credential with a private directory
ACL. Password entry remains pending; automatic plaintext command-line storage was rejected.
These local lab files never enter the package or Git. Future test credentials must be delivered
to the worker over private IPC, retaining strict certificate verification.

Original blueprint: ../README.md. Current implementation status: ../TODO.md.
