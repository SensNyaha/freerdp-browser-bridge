# Building the foundation

## Manual Windows/XRDP viewer

From the project root in PowerShell, with the existing local toolchain and
bundled native build, run:

```powershell
& .\scripts\local-pnpm.ps1 -PnpmArguments @('build')
$fingerprint = 'sha256:7a826b7c5f71b03b67866a63d03e15279aefb6638a36cfc9c7209e349d5e75ed'
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --manual
```

This local helper opens installed Edge visibly, uses the ignored lab configuration
and credentials, and accepts only the supplied previously verified certificate.
It serves the harness only on 127.0.0.1:47999. Click the desktop to give it keyboard
focus; mouse buttons and wheel are enabled in this explicit manual mode. Changing
`h264` to `jpeg` selects the fallback. Close the Edge window or press Ctrl+C to
close the session and clean up the worker. Automatic mode without `--manual`
retains its movement/reset-only lab guard and finishes after its smoke checks.

The lab files are `.local-tests/xrdp-lab.json` and
`.local-tests/xrdp-lab.secrets.json`; the existing user-authorized development
exception permits the latter locally. Neither file is published or packaged.
If the native worker needs rebuilding, run `./scripts/native-build.ps1 -Task bundled`.

Session creation now accepts [quality/FPS profiles](VIDEO_QUALITY.md). To run the
automatic lab check with 5 FPS and the low-bandwidth profile, use the same
fingerprint variable and pass `--quality-test` instead of `--manual`:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264-reset --quality-test
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --quality-test
```

This verifies the reported cap, browser output and direct native capture pacing;
it is a bounded smoke check, not maximum-FPS or 30-minute soak acceptance.

## Foundation prerequisites

Prerequisites: Node.js 24, pnpm 10.11.0, CMake >=3.24, Ninja and a C++20 compiler.
Windows: initialize the x64 MSVC/SDK environment with `scripts/msvc-env.cmd`
and the Visual Studio installation path in a disposable `cmd.exe` session.
Linux: install Ninja and GCC/Clang.
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
links exact FreeRDP/WinPR 3.32.1 and provides an experimental native connection core.
See [connection contract](CONNECTION_CORE.md) and [XRDP evidence](ITERATION_004.md).
Usable browser RDP remains false. Foundation defaults to BRIDGE_WITH_FREERDP=OFF explicitly.

The Windows test machine originally had Node.js 22. A SHA-256 verified portable Node.js
24.21.0 and pnpm were installed under ignored .tools without changing system installation.
CI uses Node.js 24 directly. Catch2 v3.8.1 is fetched only at configure time, not at runtime.

On this machine, `./scripts/local-pnpm.ps1 check` selects the local Node/pnpm for one command.
The helper restores PATH after execution. It uses Windows system CA trust, keeping TLS checks
enabled. Native compilation still requires an initialized MSVC/SDK environment.

Private dependency and runtime build (Windows x64 verified; Linux acceptance pending):

Linux build prerequisites include Perl, NASM, pkg-config, Autotools/libtool and libudev-dev
in addition to CMake/Ninja/compiler. The pinned libusb Linux port enables udev by default;
its OS integration library must be inventoried and declared before Linux installer acceptance.

```sh
pnpm build:dependencies
pnpm build:freerdp
pnpm build:bundled
BRIDGE_TEST_BINARY_DIR=build/bundled pnpm check
pnpm test:bundle
```

On Windows, prefer the helper commands below from regular PowerShell. They prepare
the MSVC/SDK environment and a temporary short workspace alias for vcpkg, which
is needed for this workspace's long non-ASCII path:

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

The Windows helper uses `scripts/msvc-env.cmd`: `VsDevCmd -no_ext` initializes
the SDK, followed by explicit C++ and CMake batch extensions. It does not invoke
Visual Studio's vcpkg shell integration, whose `iex (Get-Content ...)` initialization
can be blocked by endpoint protection. The target and host overlay triplets set
`VCPKG_LOAD_VCVARS_ENV=OFF` and pass only build-tool environment variables, so
private vcpkg does not repeat the full Visual Studio shell initialization.
Compiler tracking remains enabled and environment values participate in ABI hashes.
The supported variables are described in [Microsoft's vcpkg documentation](https://learn.microsoft.com/en-us/vcpkg/users/triplets#vcpkg_load_vcvars_env).
This requires an initialized MSVC environment; use the helper from a regular terminal.
No antivirus settings, exclusions, execution policy or Visual Studio installation files
are changed. Existing native-build commands above remain the entry points.

Pinned vcpkg builds release shared libraries into .deps/installed/<triplet>, with downloads,
tooling, build trees and binary cache under .tools/.deps. No system installation or global vcpkg
integration is performed. ZLIB/OpenSSL/libusb/OpenH264 paths are checked before building FreeRDP.
The Windows bundled profile includes private OpenH264 browser encoding and incoming
FreeRDP AVC420 decoding; FFmpeg remains disabled. These are experimental media
features, with the overall `rdp` capability still false. [GFX contract](GFX.md).
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
The current viewer helper reads the already authorized plaintext lab credentials
from the ignored `.local-tests/xrdp-lab.secrets.json`, under the explicit local
development exception in AGENTS.md. These files never enter Git or the package.
Passwords still reach the worker through private IPC and never through argv,
environment, logs or production persistence. Certificate verification remains
strict by default; the lab helper uses only the previously approved exact fingerprint.

Original blueprint: ../README.md. Current implementation status: ../TODO.md.
