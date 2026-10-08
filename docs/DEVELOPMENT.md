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

The pinned FreeRDP source metadata is native/dependencies.json. Future production dependency
builds must include FreeRDP/WinPR and required channels, package all runtime libraries and
verify exact runtime ABI. BRIDGE_WITH_FREERDP is an optional exact-version link probe; it does
not implement connection callbacks or claim RDP support. Foundation defaults to OFF explicitly.

The Windows test machine originally had Node.js 22. A SHA-256 verified portable Node.js
24.21.0 and pnpm were installed under ignored .tools without changing system installation.
CI uses Node.js 24 directly. Catch2 v3.8.1 is fetched only at configure time, not at runtime.

On this machine, `./scripts/local-pnpm.ps1 check` selects the local Node/pnpm for one command.
The helper restores PATH after execution. It uses Windows system CA trust, keeping TLS checks
enabled. The native build still requires the Visual Studio x64 Developer shell.

Dependency build preparation (not yet accepted on this machine):

```sh
node scripts/fetch-freerdp.mjs
cmake -S .deps/FreeRDP -B build/freerdp -G Ninja -C native/freerdp-profile.cmake
cmake --build build/freerdp
```

The configure probe currently stops at missing ZLIB_LIBRARY/ZLIB_INCLUDE_DIR. This does not
prove the remaining dependencies are present. Resolve dependency inventory before building
or claiming any required FreeRDP channel. Preserve upstream license/notices in distribution.

Original blueprint: ../README.md. Current implementation status: ../TODO.md.
