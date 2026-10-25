# Building the foundation

For current installation, architecture and release reading paths start with the
[documentation map](README.md). Historical lab commands below retain their
one-run authorizations and original scope; they are not permission to repeat
remote tests. Cleanup removes obsolete native build outputs after saving their
receipts ([record](ITERATION_458.md)). In a new test use a fresh verified linked
receipt for that source/version; an archived receipt cannot make a removed
worker executable available again.

Current delivery criteria and evidence boundaries are in
[practical MVP acceptance](MVP_ACCEPTANCE.md).

## Current functional work

Development continues in `feature/stage1-runtime-isolation` from shared
`master`. The original eight Stage 0 tasks and its clean-build/version gate
already have accepted release-profile evidence in
[0.2.5 delivery](ITERATION_457.md). The expanded sanitizer matrix continues in
the separate `feature/stage0-sanitizer-matrix` branch; its pending Node/addon and
broader dependency results are retained, not treated as successful acceptance.

The corrected hosted Node-ASan build in run `40113778793` now succeeds. Its
next standalone-Node baseline fails before any bridge addon is loaded:
LeakSanitizer reports 24 bytes allocated by Node's bundled OpenSSL
`ossl_load_builtin_compressions`. The identity control exits 1; addon checks are
skipped and remain unaccepted. This is a failure boundary, not an approved
suppression or a claim that bridge sanitizer checks passed. The original JSON
and diagnostic are retained as
`build/current-validation/github-node-sanitizer-baseline.{json,stderr.log}`;
the independent local Node build also finished successfully. Its automatic
acceptance then failed the same standalone-Node baseline with a 24-byte
OpenSSL leak before loading the bridge addon. Local evidence is
`build/current-validation/node-addon/instrumented-node/node-sanitizer-baseline.{json,stderr.log}`;
the addon matrix remains unaccepted. No suppression was added.

The first Stage 1 change rejects unsafe Linux runtime roots before session
creation: foreign service UID, group/other write permission, or a root symlink.
It never changes an existing directory's owner/mode. Native runtime and wire
contracts are unchanged. The host still supplies trusted ancestors; this does
not close simultaneous hard-kill recovery or the whole multi-user isolation
gate. [Host boundary](../SECURITY.md#2-worker-sandbox).

Five actual Linux admission cases pass without skips under UID1000, including
a real UID1001 root; four fail before the change. A real unchanged foundation
worker passes HELLO/heartbeat/shutdown and leaves an empty safe 0750 runtime
root with its original mode. Evidence is under
`build/current-validation/runtime-root-{before,after,native}.log` and
`runtime-root-acceptance.json`. Strict TypeScript, lint and formatting pass.
Unchanged native CTest passes **36/36**; Windows worker/private-directory
integration passes **22/22**, including 100 actual sequential workers and
parent-death cleanup. Product version is
still 0.2.5 during development; choose the next version only for accepted work.

The SDK now verifies a bounded worker/helper manifest, selects managed session
names, keeps independent Node ownership through joined retirement and exposes
bounded `recoverRuntimeSessions` through all four adapters. Only known metadata
in confirmed orphan directories can be removed; live owners, locked workers,
foreign UID/unsafe ACLs, links and unknown contents are preserved.

The current revision passes fresh linked MSVC CTest **38/38**, full Windows
`pnpm check` **1036 / 70 skips / 0 failures**, Linux GCC12 ASan/UBSan foundation
**22/22** and all SDK/process controls **27/27** without skips under UID1000 and
zero effective capabilities, including a real UID1001 root. The current helper
also compiles/links and runs its refusal path with exact GCC 8.3.0. Prior native
and endpoint-only results remain in [Runtime recovery](RUNTIME_RECOVERY.md).
`runtime-recovery-sdk-acceptance.json` under `build/current-validation` binds
the unchanged native source snapshot and current JS to these results.
Standalone calls recovery before listening. Actual Windows supervisor checks
now pass **9/9**, portable ZIP acceptance **1/1**, service-host CTest **1/1** and
full Windows check **1036/70 skips/0 failures**. The host now admits the bounded
recovery report before READY and leaves schema-1 orphan directories for the
verified SDK helper. The isolated development ZIP is not a published 0.2.5
replacement. Linux portable now also passes actual orphan recovery before
readiness, JWT/HTTP/native TLS and joined shutdown under UID1000. The current
GCC 8.3 linked build passes CTest **39/39** and SDK/recovery **27/27**; a fresh
Windows build passes CTest **38/38**. Installed bundle relocation passes on both
OSes without a library-path override. An actual Linux startup failure exposed
pre-install hashes surviving ELF RPATH replacement; installation now regenerates
the recovery manifest from final bytes, and npm packaging verifies the cohort
before creating an archive. Final Windows regression passes **1036/70 skips/0
failures**; CPack's actual native TGZ also has matching installed cohort hashes.
Installed upgrades, release
versioning, merge and publication remain open;
[evidence and limits](RUNTIME_RECOVERY.md#acceptance).

The final helper-owner correction retains a four-child physical limit even
after an unconfirmed close deadline; `exit` alone cannot free capacity. Its
failing-before/passing-after model and actual recovery checks pass. Updated full
`pnpm check` passes Windows **1037/70 skips/0 failures** and Linux **1017/92
skips/0 failures**, using the exact GCC 8.3 linked worker under UID1000. The
initial clean Linux source fixture omitted an empty scratch `build/` directory;
all eleven resulting path failures pass after fixture setup, without changing
test conditions. New-version installed upgrades, merge and publication remain
open.

Latest user priority: finish this Stage 1 recovery feature and its accepted
delivery before starting HTML clipboard. The empty HTML branch/worktree was
removed without code changes. Existing broader isolation and sanitizer gates
remain explicit; no original stage is closed by a component-only check.

Feature workflow (user instruction, 2026-10-21): start each feature on a separate
branch from the shared `master`, keep its acceptance criteria/evidence with the
change, and make focused commits there. Run narrow checks, relevant regression
and actual RDP/device acceptance where required. Merge the completed feature
into `master` only after those checks pass; unfinished work stays on its branch.
This workflow does not mark an entire V1 stage complete after one component.

Fetch-backed loopback tests use `tests/fixtures/browser-port.mjs` to select
49152–65535 with bounded collision retries. Some hosts allocate `listen(0)`
from a low range containing ports such as 2049, which Node Fetch rejects before
opening a connection. HTTP/Express/NestJS fixtures, copied npm consumers and
standalone web-port reservations therefore use the same helper. Generated
consumer projects must copy it next to their other local fixtures and rewrite
its import, preserving their independence from the source checkout. The port
unit test demonstrates the actual Fetch refusal and a reachable selected port.
The port-fixture correction passes full Windows `pnpm check` **1006 / 63 skips /
0 failures**, all four fresh public npm 0.2.5 consumers (strict TypeScript and
native TLS), and the relocated Windows portable/private-Node shutdown test.
Its five temporary consumer/portable trees were removed after saving receipts
under `build/current-validation`; accepted release archives were preserved.

Certificate-wait resource fixtures await the session's actual
`certificate.prompt` event before taking an attachment's certificate snapshot.
The preceding `awaiting-user` state is a separate IPC message and can arrive
first. The combined sanitizer-branch check exposed this race at `assert.ok(prompt)`
(1013 passed / 64 skipped / one failed); the failed report is retained under
`build/current-validation/certificate-race-check`. After correcting the event
wait, five consecutive native RSS/certificate runs and all nine related
native TLS/HTTP/WS checks pass without skips. The original deadlines and memory
policy assertions remain in the test.

For the user-authorized local Linux RDP container, use the
[owned XRDP stand](OWNED_XRDP_LAB.md). Its separate fixed loopback profile keeps
Windows lab credentials and certificate decisions independent.

For a separately authorized real Browser Clipboard API ↔ Windows Notepad
check, prepare a fresh empty unsaved editor with input focus, then disconnect
mstsc without logging off. The headed Edge helper replaces both clipboards
with fixed Unicode/multiline test text and uses the ordinary viewer buttons
and public control input. Pass the exact certificate fingerprint approved for
that one session and an existing verified linked Windows native receipt:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-windows-browser-clipboard.mjs $fingerprint build/native-clean-4ZhORq/receipt.json
```

The helper compares text without logging it, checks actual browser permission
refusal, clears only its verified test document after success, detaches and
joins native/runtime cleanup. It does not save or close the remote document.
A failure may leave synthetic text in the prepared document; its fixed result
reports that possibility. Do not rerun under an already consumed one-session
authorization. Browser directions/quota fixtures are separate evidence.
The optional `--focus-editor` additionally requires approval for a single center
click in the prepared editor and one ignored native RDP frame on failure. It
does not search the desktop or repeatedly capture frames. A reconnect can change
remote input focus even when the editor was focused before mstsc disconnected.

The separately authorized `--focus-editor --keyboard-smoke` additionally tests
physical Shift/number entry, release of left Ctrl / right Shift / left Alt on
canvas blur, and held right Ctrl across viewer detach/fresh-token reattachment.
The left-Alt case cancels application menu mode with Escape before the next digit.
Every step compares actual Notepad copied text through the ordinary Get action;
it uses only the already verified synthetic document. The fixed `!1` expectation
is a named current-layout check, not automatic layout selection or acceptance of
all keyboards. It requires explicit approval for those inputs and reattachment
in addition to the ordinary Clipboard scenario. No application is launched and
no file is saved. Preparation or fixtures do not accept actual remote input.

The joint Windows helper uses `--focus-editor --mvp-soak` with the same
fingerprint/receipt arguments. It requires a user-prepared maximized disposable
Notepad and the existing fixed tone running inside that RDP session for 33
minutes. The tone command is offered in the local viewer draft; sending it is
an explicit user action, and executing it/preparing Notepad remains manual.
After audio decoding starts, click “Блокнот готов — начать совместный тест”.
Alternatively the operator can relay an explicit user readiness confirmation
by creating the exact per-process `build/mvp-notepad-ready-<pid>` file printed
by that invocation; it contains no secrets or application data.

This mode replaces only the prepared document with synthetic text, verifies
both Clipboard API directions, then repeats a physical-key/edit/readback check
every 30 seconds during the full 30-minute H.264/Opus observation. It measures
existing video/audio/RSS counters, then checks resize, permission refusal,
revoke, reattachment and cleanup. Its watchdog is 40 minutes; epoch recovery
is observed for at most 3 seconds and still counts toward total sample loss.
It captures no failure screenshots. A failed run may leave its test document;
the finite tone ends itself or the user can stop it with Ctrl+C. Numeric results
do not replace the user's listening assessment. The named complete real joint
gate passes in [403](history/iterations/401-450.md#iteration-403); the earlier failed run remains recorded
in [402](history/iterations/401-450.md#iteration-402). New compiler/profile regressions retain their own
acceptance and do not inherit that result merely by using this helper.

For separately authorized basic mouse/scroll acceptance, copy
`tests/fixtures/rdp-pointer-page.html` to the Windows lab yourself, open it in
Edge, maximize the window and disconnect mstsc. The page stays local/offline
and exposes only fixed bounded numeric counters. Use the same helper with
`--focus-editor --pointer-smoke`, instead of `--keyboard-smoke`. This requires
approval for the button/drag/wheel sequence, left-button blur and middle-button
detach/reattach, F2/Ctrl+C scalar readbacks and the existing optional single
failure frame. It runs no remote command, does not launch an application, does
not write a remote document and sends no clipboard offer. Exact scope and actual
acceptance status are in [the pointer iteration](history/iterations/351-400.md#iteration-396).

For operator-assisted actual Windows Notepad Unicode/input/clipboard checks,
use the [application smoke](WINDOWS_APPLICATION_SMOKE.md). It requires an empty
user-prepared Notepad, fixed test data and phase-by-phase native JPEG inspection;
it never saves the document or accesses the host Clipboard API.

Current authorized `192.168.21.149` is the **Windows lab**, confirmed by the
user on 2026-10-18. The `test-xrdp-*` filenames are legacy helper names; label
new evidence by the actual endpoint. The user has cleared the Windows backup/
preparation wizard themselves. [Current status and remaining gates](LAB_STATUS.md).

## Connected worker RSS policy smoke

Core lab `strict` mode succeeds only for exact `RDP_CERTIFICATE_REJECTED` and
a subsequent native heartbeat. A timeout/authentication error or unexpected
connection is a failed check. `inspect` is inventory only; `connect`/`memory`
require a connected/no-error result. [Result-classification evidence](history/iterations/251-300.md#iteration-299).

With the current built Node package, existing bundled worker and ignored
authorized lab files, use the previously approved exact fingerprint:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-xrdp-lab.mjs memory $fingerprint
```

This explicit mode selects 1920×1080 and a 256 MiB sampled worker RSS cap at
100 ms intervals. It requires at least three actual connected samples, a JPEG
frame, heartbeat and empty-runtime cleanup. It records only count/peak scalars
and sends no remote input, audio generation or physical capture. It does not
stress memory or prove the whole-session target, CPU, hard allocation limits
or sustained acceptance. Ordinary modes and Release defaults remain unchanged.
[Host policy](WORKER_MEMORY_POLICY.md), [evidence](history/iterations/251-300.md#iteration-298).

## Private clipboard lab probe

With the paired current worker/Node build and ignored authorized lab files:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-clipboard.mjs $fingerprint inventory
```

Use the previously verified SHA-256 fingerprint. Inventory reports source
readiness, scalar offer metadata, heartbeat and cleanup; it never reads remote
clipboard contents or accesses the host OS clipboard. The optional action
`set-sentinel` explicitly replaces the remote text offer with a fixed synthetic
value, waits for the native peer ACK, then clears it. This changes clipboard
state and does not prove that a remote application consumed it. Do not run that
action against a session whose clipboard must be preserved. Linux bootstrap can
use `--private-stdin` or `--private-stdin-framed` after the action; credentials
still travel only in bounded private stdin/worker IPC. The SDK build container
must not receive lab secrets. Run lab modes sequentially.

These are private `WorkerProcess` probes. Public session/control/browser clipboard
activation remains gated. [Private API contract](CLIPBOARD_IPC.md#private-typed-node-selection-iteration-232).

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

For explicit PCM output use `--audio-manual` instead of `--manual`:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --audio-manual
```

Click **Включить звук и подключиться** before attachment: the harness creates
the AudioContext/Worklet from that gesture, then opens sockets. The host must
provide fresh single-use tokens; delaying activation beyond their TTL requires
a fresh attachment. Waiting status with no PCM is not audible acceptance.
The helper reads only ignored local credentials and uses private IPC as before.
Automatic `--audio-test` exercises gesture, media/source status and reattachment
with the existing motion/reset-only guard; it never generates remote sound.
Opus/microphone and audible/latency acceptance remain open.

For explicit Unicode/IME fallback, first focus the desired field on the remote
desktop, then enter text in **Текст Unicode / IME** below the canvas, complete IME
and press **Отправить текст**. Physical canvas keys remain the shortcut path.
The field accepts at most 256 UTF-16 units, with one pending submission. A sent
result clears it; unavailable/resize pause retains the draft. Timeout detaches the
viewer without retrying text because delivery may already be partial/complete.
Server Unicode support and real remote application/OS IME behavior still require
acceptance; automated lab checks do not send text. [Contract](INPUT.md#committed-unicode-text).

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

Lint/format exclude `.local-tests` and `.runtime`. The format commands name the
maintained source roots (`apps`, `packages`, `scripts`, `tests`, `examples`,
`.github`) and root configuration/code files explicitly, so Prettier does not
walk private development directories even when their ACL denies enumeration.
Add a new source root to both format commands when introducing one. This does
not change directory permissions or the native clang-format workflow.

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
See [connection contract](CONNECTION_CORE.md) and [XRDP evidence](history/iterations/001-050.md#iteration-004).
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

The lifecycle-only Windows foundation can use the same helper:

```powershell
./scripts/native-build.ps1 foundation
```

It configures/builds/tests the foundation preset without FreeRDP. Catch2's
FetchContent base is explicitly kept on the temporary ASCII alias: a preset can
expand sourceDir to the canonical non-ASCII path, and MSVC's library response-file
reader then misreads UTF-8 object paths even when compilation itself succeeds.

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
`native-build.ps1` discovers the installed Git executable and passes its directory
as the second argument to `msvc-env.cmd`. Before SDK setup the disposable cmd shell
sets PATH to that directory and standard Windows executable directories; the SDK,
C++ and CMake extensions then append their own tool paths. Node is invoked by its
explicit local executable path. Transient caller/automation directories therefore
do not invalidate every vcpkg ABI key between helper calls. PATH remains tracked;
compiler and SDK checks are not disabled. Direct `msvc-env.cmd` calls without the
second argument retain their existing inherited PATH behavior.
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

## Private XRDP Display Control check

After building Node and the bundled worker, use the already approved exact lab
fingerprint with the ignored local credentials:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-display.mjs $fingerprint
```

The helper opts in to native dynamic resolution, checks negotiated caps, changes
1920×1080 to 1280×720, verifies new AVC IDR/JPEG dimensions, and restores the original
size with another IDR. It sends only input reset and lifecycle requests. If the
server has no negotiated Display Control, it records unavailable rather than
claiming a successful resize. This helper is private worker integration.

## XRDP browser resize check

The public control/media path can be tested separately in Edge for each codec:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --resize-test
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --resize-test
```

Run sequentially (the helper uses local port 47999). It explicitly opts in, checks
1920×1080 → 1280×720 → 1920×1080 rendering/config generations and fresh AVC IDRs,
no-op/invalid typed replies, display/cursor reattachment replay and resumed motion.
Only motion/reset input is sent to the operational lab desktop. The helper attempts
restoration on failure before closing. Manual `--manual` viewing also opts in and
shows width/height controls. Other session creators must explicitly set
`display.dynamicResolution=true`; default remains disabled. This is one primary
monitor at 100% scale, not automatic browser viewport or multimonitor support.

## XRDP touch inventory and manual input

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-touch.mjs $fingerprint
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint h264 --touch-inventory
& .\.tools\node-v24.21.0-win-x64\node.exe .\scripts\test-xrdp-viewer.mjs $fingerprint jpeg --touch-inventory
```

The first checks private native readiness, heartbeat and JPEG. The browser modes
explicitly opt in, validate matching rendered touch/display generations and
control reattachment replay. They send no touch/key/button/wheel/text; the browser
helper retains its authorized motion/reset checks. Run modes sequentially.
Credentials stay in ignored lab files and private IPC; use the previously verified
fingerprint. Inventory is not physical touch or remote application acceptance.
Manual --manual viewing also opts in and captures supported touch Pointer Events
only after readiness and matching rendered geometry. It never maps pen to mouse.

## Private Windows PCM readiness check

After bundled native and Node builds, run `node scripts/test-xrdp-audio.mjs
sha256:<verified-lab-fingerprint>` with the bundled Node 24 executable on PATH.
The helper reads the authorized ignored lab files, opts in to private PCM,
observes source metadata for three seconds, checks heartbeat/JPEG and closes.
It sends no remote input/sound-generation commands and writes only a bounded
non-secret `.local-tests/xrdp-audio-report.json`. Waiting with zero packets is an
idle/source observation, not audio negotiation, audible/browser or latency
acceptance. Public session PCM remains unavailable until ordered media routing.

Iteration 85 extends this private helper with an optional second argument:
`node scripts/test-xrdp-audio.mjs sha256:<verified-lab-fingerprint> opus`.
PCM remains the default. Opus writes its bounded metadata report to
`.local-tests/xrdp-audio-opus-report.json`, separate from PCM. The same approved
fingerprint check, private IPC credentials, heartbeat/frame/cleanup and no-input /
no-sound-generation behavior apply. High-level public Opus remains unsupported;
this helper does not test browser playback or audible acceptance. Current public
PCM availability is documented in the later media/viewer contracts.

## Public Windows Opus viewer

Iteration 94 enables explicit `media.audioOutput: 'opus'` and matching
`bridgeViewer.attach(created, { audioOutput: 'opus' })`. The harness opens audio
sockets only after the existing **Включить звук и подключиться** button activates
an exclusive AudioContext; AudioDecoder support is checked and unsupported Opus
fails explicitly. No codec switch or automatic PCM fallback occurs mid-session.

Use `node scripts/test-xrdp-viewer.mjs sha256:<verified-lab-fingerprint> h264
--audio-opus-test` for the authorized local browser/idle-source regression.
It retains only the existing motion/reset input checks and generates no remote
sound. `--audio-opus-manual` opens the manual viewer with the same gesture button
and manual input enabled. Existing `--audio-test` / `--audio-manual` select PCM.
Run lab modes sequentially. Waiting/zero packets is not audible acceptance.
[Wire and recovery ownership](AUDIO_OPUS_PUBLIC.md).

## Private XRDP microphone inventory

After bundled native and Node builds, run sequentially:

```powershell
node scripts/test-xrdp-microphone.mjs $fingerprint off
node scripts/test-xrdp-microphone.mjs $fingerprint pcm
node scripts/test-xrdp-microphone.mjs $fingerprint opus
```

Use Node 24 and the previously verified `sha256:<fingerprint>`. The helper reads
authorized ignored lab credentials and sends them through private IPC. It selects
PCM input with the indicated output, observes three seconds of source metadata,
checks heartbeat/JPEG and closes with empty runtime. It sends no PCM/input/reset
or remote application commands and requests no physical/browser microphone.
Reports in `.local-tests/xrdp-microphone-<mode>-report.json` contain only bounded
scalar inventory. Waiting/epoch 0 is not ready capture, permission, remote
application, audible or latency acceptance. Historical iteration 115 public
creation gating is superseded by explicit PCM selection in iteration 128.
[Actual evidence](history/iterations/101-150.md#iteration-115).

## Explicit native/browser microphone viewer

After the bundled native/Node builds, use the same previously verified fingerprint:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-manual
```

This opens the actual native PCM-input session with output off. The viewer waits
for remote source readiness before enabling **Включить микрофон**. Click that
separate button to request a local microphone; **Выключить микрофон** stops
tracks and joins graph/server cleanup. There is no automatic device request.
Current XRDP evidence is waiting/epoch 0, so the button stays disabled until a
remote application/server negotiates a supported capture profile. No remote
application is opened automatically.

Use `--microphone-pcm-manual` or `--microphone-opus-manual` for simultaneous PCM
input and the indicated output. These modes first require the existing output
activation button, then the separate microphone button. Opus **input** remains
unsupported. Incomplete/failed old permission cleanup blocks new capture until
reload. Other manual input follows the existing explicitly manual viewer rules.

Automated `--microphone-test` verifies H.264/source replay and cleanup with the
existing motion/reset-only guard. It never clicks microphone enable and replaces
getUserMedia with a rejecting sentinel, preventing physical capture even on an
unexpected startup. [Evidence and remaining acceptance](history/iterations/101-150.md#iteration-128).

## Explicit Opus microphone input

Iteration 144 supersedes the unsupported-input statement above. With Node 24 and
the bundled guarded Windows worker, use:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-opus-input-manual
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --microphone-opus-input-test
```

The first selects Opus input / output off and opens the manual viewer. A bounded
provider support check runs before sockets; physical capture still requires the
separate microphone button and an actual ready remote source. The second is an
automated source/video regression with a rejecting getUserMedia sentinel, no
microphone button click and only the existing motion/reset. Waiting is not remote
recording acceptance. Run lab modes sequentially.

Existing `--microphone-opus-manual` keeps its original **PCM input / Opus output**
meaning. It does not select Opus input. Typed `bridgeViewer.attach` and SessionCreate
can select input/output independently; there is no codec fallback.

The private inventory helper accepts an optional third argument selecting input:

```powershell
node scripts/test-xrdp-microphone.mjs $fingerprint off opus
node scripts/test-xrdp-microphone.mjs $fingerprint pcm opus
node scripts/test-xrdp-microphone.mjs $fingerprint opus opus
```

Omitting it retains PCM input and the existing report paths. Opus-input reports
use `.local-tests/xrdp-microphone-opus-<output>-report.json`; all reports remain
bounded scalar metadata. The helper checks selected native capabilities and sends
no microphone samples, reset or remote application input. Credentials stay in
ignored local files and reach the worker only through private IPC.

## Single-viewer stability observation

After building Node and the bundled Windows worker, with the previously verified
lab fingerprint, run lab modes sequentially:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --soak-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --transport-loss-test
```

This holds the actual 1920×1080 desktop for 30 minutes, prints fixed aggregates
every 30 seconds, then checks resize/restoration and cursor/attachment replay.
It observes graphics with audio off and requests no microphone. Working-set
measurements use the bundled limited-query helper. Do not rebuild native DLLs or
run competing timing benchmarks during the observation. A reported failed memory
budget or interrupted run is not acceptance. [Scope](history/iterations/151-200.md#iteration-174).

The separate transport-loss mode uses one loopback relay to the configured lab
IP, waits for real decoded desktop pixels, then breaks only that test connection.
It requires an explicit RDP failure, closed viewer and ordinary cleanup. Extra
peers are refused; no payloads are recorded or device permissions requested.
Run it after the soak, not during another timing observation. [Verified scope](history/iterations/151-200.md#iteration-183).

The private `test-xrdp-audio.mjs $fingerprint pcm` (or `opus`) now observes ten
seconds of real source data and makes at most one reset attempt while ready.
Subsequent fresh config/packet evidence is distinct from merely scheduled reset.
It emits scalar counts and a PCM nonzero indicator, never recordings/sample data.
Dedicated lab viewer `--audio-manual` / `--audio-opus-manual` performs the output
activation button click so certificate approval cannot expire while waiting for
it. The product viewer retains its gesture gate; this does not request microphone
permission. Audible quality remains a user check. [Current XRDP corrections](history/iterations/151-200.md#iteration-175).

## Explicit 200 ms output compatibility profile

The selected native output capacity can be set independently for PCM/Opus:

```powershell
node scripts/test-xrdp-audio.mjs $fingerprint pcm 200
node scripts/test-xrdp-audio.mjs $fingerprint opus 200
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-manual
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-listen
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-recovery-test
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-compat-recovery-test
```

Automatic and manual audio viewer runs emit a final schema-1
`lab.browser.audio-negotiation` record after joined native/server cleanup.
Its `negotiation` object contains only the worker's fixed numeric server/client
format, Training/Wave and write/completion/cancellation/failure counters, as
decimal strings. `null` means no complete diagnostic receipt was observed;
it must not be interpreted as zero negotiation. The private audio helper uses
the same stream parser so stderr fragmentation cannot drop a valid receipt.
The browser footer additionally includes `nativeCounters` (chunking, overflow,
skipped/late publication, revisions, consumer resets and packets) and
`nativeCauses` (initial/profile/block, arrival/timestamp discontinuities,
formats and Close). Both are exact fixed uint64 decimal-string projections,
or `null` if absent. The private helper preserves the same field names with
omitted absent receipts. These are lifetime counters, not a causal diagnosis
of a specific audible pause. [Collection checks](history/iterations/351-400.md#iteration-368).
`consumerRecovery` separately counts calls and fixed results of the existing
Node reset API: requests, scheduled/stale/busy/unavailable, unexpected results
and failures. It never includes epochs or error text. A request can be pending
or refused; it is not a successful source reset or an audible interruption.
[Wrapper checks](history/iterations/351-400.md#iteration-369).
Recovery runs require actual ready-source packet/playback evidence before
detachment; a waiting source fails in phase `audio-source-ready`, before a
desktop snapshot is taken. The host source must run in the redirected Windows
audio endpoint/session. Source launch, endpoint selection and audible acceptance
remain explicit user/lab operations.

PCM viewer modes are `--audio-compat-test` / `--audio-compat-manual`. Manual output
activation is performed by the dedicated lab helper; no microphone is requested.
Run actual RDP modes sequentially. Programmatic creation uses
`media: { audioOutput: 'opus', audioOutputBufferMs: 200 }`; omission or 120 keeps
the original capacity. This is native handoff storage, not total playback latency.
The private Node/native pair must both support the new gated schema.
[Accepted scope](adr/ADR-012-audio-compatibility-buffer.md).

The `--audio-opus-compat-listen` preview activates output, leaves the visible
viewer open for one minute after the first rendered frame, and closes through
ordinary browser/server/worker cleanup. Closing the viewer sooner also finishes
normally. Use this bounded preview for a short listening check.
Before timed cleanup it requests one fresh Worklet stats reply and prints a
schema-1 `lab.browser.audio-preview` observation: fixed video/source/decoder and
Worklet counters, without raw media. A closed viewer or unavailable reply is
reported as `observation: null`, never as a fresh reading of stale counters.
The report does not claim audible acceptance. To verify the source route,
restart the source in PowerShell inside this active Bridge viewer after
connection; the user-started tone in a previous `mstsc` connection did not
establish that route. The native negotiation footer still follows joined close.

Each bounded listening preview also awaits one existing native pipeline query
before cleanup and emits schema-1 `lab.browser.native-pipeline`. Its `stats`
contains only `rdpChecks`, `paints`, `encodedFrames`, `encodeMeanUs`,
`encodeP95Us`, `encodeMaxUs`, `maxReadBatch` and `maxReadBatchUs`, or `null`
when unsupported, closed, refused or unavailable. The existing native request
deadline owns the query; the helper adds no retry, polling or detached timeout.
Encode p95 covers the latest 128 encoded frames; mean/max and the other
counters/maxima cover the worker lifetime. These describe video work, without
identifying the cause or time of a particular audio pause. They exclude audio
codec work, event waits, Node/browser processing and end-to-end latency.
[Collection verification](history/iterations/351-400.md#iteration-374).

For a separately authorized fixed-source Windows test, use
`--audio-opus-compat-tone-listen` instead. This opt-in is restricted to the
named Windows lab `192.168.21.149:3389`. Through private RDP input it opens
Windows PowerShell and types one fixed in-memory quiet 440 Hz PCM8 source,
with a 45-second sleep and Stop/Dispose/exit in `finally`. It accepts no command
or source-file argument, creates no WAV file, and captures no microphone.
The one-minute viewer then collects the same counters and joins normal cleanup.
Do not connect with `mstsc` concurrently; it can replace the Bridge connection.
`lab.browser.tone-input` reports command dispatch, not remote execution or
process-readback proof. In this mode `remoteAudioGenerated: null` means that
the helper cannot independently verify source execution; actual packet/playback
counters and the operator's listening report provide separate evidence.
[Named audible result and retained quality gaps](history/iterations/351-400.md#iteration-367).

For user-operated source startup, `--audio-opus-compat-source-listen` (also
`--audio-opus-compat-tone-soak`, superseding its unverified automatic dispatch) opens a
bounded Opus/200 ms preview and selects browser-to-server text clipboard
with a 2,048-byte cap, including its UTF-16 representation. It places the fixed
three-minute source command in the
local draft only: no Send, paste, Enter or application launch is automated.
The user separately clicks Send, waits for offer acceptance, focuses the already
open PowerShell in the remote desktop, pastes and executes the command. Existing
source counters and the operator's assessment remain the evidence. Clipboard
uses the ordinary grant/revoke lifecycle; server-to-browser reads are disabled.
The helper permits at most five minutes of preparation, then starts its
180-second observation only after the existing browser counter reports the
first decoded audio packet. Missing source fails that explicit scenario and
joins cleanup; preparation is not misreported as active playback time. This is
an observation budget, not a change to connection/protocol/record deadlines.
Opus/200 ms, microphone off, the existing counters and joined cleanup remain.
Ordinary one-minute/45-second modes stay unchanged. This mode requires a
separately approved connection and user-prepared PowerShell. Source-start
failures and exact acceptance boundaries are retained in [387](history/iterations/351-400.md#iteration-387).

On Windows, append one isolated native receipt after the existing viewer mode
to select its verified worker/helper pair:

```powershell
node scripts/test-xrdp-viewer.mjs $fingerprint h264 --audio-opus-compat-tone-listen build/native-clean-EXAMPLE/receipt.json
```

The same receipt validator used by the resource lab checks the pinned linked
profile, source identity and exact worker/helper bytes before reading lab
configuration or credentials. It accepts the existing Windows Debug/Release
receipt profiles. Omitting the receipt keeps the ordinary bundled worker;
explicit selection does not replace it. A schema-1 `lab.browser.native-profile`
record reports receipt/build type and source/worker/helper hashes, without
claiming connection or playback. This prepares the corrected Debug worker for
a separately authorized actual session. [Selection checks](history/iterations/351-400.md#iteration-372).

The recovery modes require real active output before and after browser detach/
reattach, and fail for an idle source. Opus also requires an observed native
reset result and a fresh epoch. Leave audio playing on the authorized lab; the
helper does not start remote applications or record audio. [Verified scope](history/iterations/151-200.md#iteration-181).

## Manual WEB connection example

`node scripts/start-reference-harness.mjs` opens an empty, authenticated local
Edge example. Enter RDP address, settings and credentials manually; choose strict
validation or an explicit session-only certificate prompt. Window close stops the
owned server/workers. [Detailed contract and launch](WEB_CONNECTION_EXAMPLE.md).

## Local linked Linux verification

After `pnpm build:dependencies`, `pnpm build:freerdp` and `pnpm build:bundled`,
the separate private SDK prefixes are used only for build-tree Node checks:

```sh
BRIDGE_TEST_BINARY_DIR=build/bundled \
  LD_LIBRARY_PATH="$PWD/.deps/freerdp-install/lib:$PWD/.deps/installed/x64-linux-bundled/lib" \
  pnpm check
pnpm test:bundle
```

CMake scopes the same private lookup to linked CTest. The relocation command
runs without dependency PATH and validates the staged installed layout instead.
The Linux worker inherits normal HOME unchanged for the pinned settings
initializer, then selects its private cwd through public HomePath/ConfigPath
settings. Do not replace HOME with a project/test directory. Linked Linux
CTest 20/20, Node 452 passed / 76 skipped, and canonical codec/libudev-context /
lifecycle relocation 1/1 pass locally. Private ELF closure is enforced before
CPack; clean-machine and actual Linux RDP/device acceptance remain open.
[Build evidence](history/iterations/151-200.md#iteration-187), [closure boundaries](history/iterations/151-200.md#iteration-189).

The actual Linux/XRDP transport helper uses a separately owned Linux lab container
with the current built source and private dependencies. The host reads ignored
lab credentials and forwards one bounded private stdin object:

```powershell
node scripts/run-linux-xrdp-transport.mjs freerdp-bridge-linux-rdp-201 strict
node scripts/run-linux-xrdp-transport.mjs freerdp-bridge-linux-rdp-201 connect sha256:<previously-approved-fingerprint>
```

Use only an explicitly authorized certificate fingerprint; the helper never
accepts another certificate. Run modes sequentially. The connected mode requires
actual JPEG/H.264 and negotiated resize/restoration, writes no desktop images,
and performs no remote keyboard/mouse, audio generation or microphone capture.
It is a private native integration check, separate from browser acceptance.
[Actual evidence](history/iterations/201-250.md#iteration-201).

To test a Linux producer with the local Windows Edge consumer, use a separate
owned container built from the current verified SDK/source, publish its API only
as `-p 127.0.0.1:47998:47999`, and copy
`scripts/linux-xrdp-viewer-server.mjs` into the same `/work/scripts` location.
Keep lab credential files on the host. Run codecs sequentially:

```powershell
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> h264
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> jpeg
```

The helper verifies the actual loopback publication before authentication, starts
the bounded Linux server through private stdin, and uses ordinary REST/control /
media paths. It checks nonblank pixels, confirmed resize/restoration and fresh
attachment replay; no microphone, audio or operational remote input is activated.
The server is a disposable test host, not the production deployment image.
[Browser evidence](history/iterations/201-250.md#iteration-202).

Active Linux audio checks use `--audio-pcm` or `--audio-opus` instead of `--form`
on `test-linux-xrdp-viewer.mjs`. These explicitly select the 200 ms output profile
and activation gesture, require actual ready packets/Worklet rendering, then
check replay. Opus additionally requires a native reset/new epoch. Leave sound
playing in the authorized XRDP session; an idle source fails the audio gate.
No microphone or audio recording is requested. [Evidence](history/iterations/201-250.md#iteration-208).

The Linux 30-minute H.264 observation uses `--soak-test` in place of `--form`:

```powershell
node scripts/test-linux-xrdp-viewer.mjs freerdp-bridge-linux-viewer-202 sha256:<previously-approved-fingerprint> h264 --soak-test
```

Copy scripts/linux-process-resident.mjs and scripts/viewer-soak.mjs into the same
Linux /work/scripts tree as the lab server. The private bootstrap selects a
finite 30-minute observation window plus cleanup time. It samples copied viewer
queues, protected render credit and worker/Node RSS every 30 seconds, retains
only fixed aggregates, then checks resize/restoration and fresh attachment.
The resource endpoint requires the ephemeral host bearer and rechecks the same
connected worker owner. It activates neither audio nor physical microphone.
This is one actual viewer, not concurrent/interactive/LAN quality acceptance.
[Actual result and bounds](history/iterations/201-250.md#iteration-220).

Current RSS lab wrappers share the strict TypeScript sampler from the built
Node package. Rebuild the ordinary Node packages before use; when refreshing a
prepared Linux lab tree, copy the matching `packages/node-bridge/dist` (including
`process-resident.js` and its updated entry point) together with those scripts.
Historical containers with older JS require that refresh before using current
wrappers. This development step does not run an RDP/device check.
[Host sampler and error contract](PROCESS_RESIDENT.md).

For microphone inventory without physical capture or sample submission, use:

```powershell
node scripts/run-linux-xrdp-microphone.mjs freerdp-bridge-linux-rdp-201 sha256:<previously-approved-fingerprint> off pcm
node scripts/run-linux-xrdp-microphone.mjs freerdp-bridge-linux-rdp-201 sha256:<previously-approved-fingerprint> opus opus --framed
```

The owned container needs the current paired worker/addon/manifest, built Node
packages, `test-xrdp-microphone.mjs` and `private-lab-input.mjs`. Credentials stay
in ignored host lab files and are sent over private stdin. The helper only reads
source status, pings, captures one desktop frame in memory and closes. Waiting
or timed-out input is reported separately from ready AUDIN/recording acceptance.
[Evidence and current network gap](history/iterations/201-250.md#iteration-210).

The independent native archive check uses only three explicitly selected files:

```sh
node scripts/prepare-native-runtime-check.mjs
docker build -t freerdp-bridge-native-check build/native-runtime-check
docker run --rm --network none --init --read-only --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /run/rdp-bridge-tests:rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=700 \
  freerdp-bridge-native-check
```

Preparation defaults to `build/packages/freerdp-bridge-native-0.1.0-Linux.tar.gz`;
one alternate archive below the project's build directory can be supplied.
The verifier removes its own pinned base's system libudev fallback and changes
no host libraries. [Actual restricted native-runtime evidence](history/iterations/151-200.md#iteration-190).

### Isolated native foundation source build

With Node 24, GCC, CMake/Ninja and an already prepared Catch2 3.8.1 source tree:

```sh
node scripts/test-native-clean-build.mjs /catch2-src
```

Run from the Linux project root after the ordinary Node build. The helper copies
only project-native source and C++ fixtures into a unique ignored build tree,
uses disconnected FetchContent, compiles a new foundation worker, checks native
CTest/CLI and runs the existing framed Node lifecycle tests against that worker.
It leaves the fixture and SHA-256 receipt for inspection. Existing objects,
FreeRDP SDK, Node dependencies and lab files are not copied; lifecycle JS is
loaded from the original built workspace. This is a local project-native source
check, separate from fresh upstream dependency/FreeRDP, linked, distro and CI
acceptance. [Exact evidence and retained first helper error](history/iterations/201-250.md#iteration-243).

New clean-native receipts also include `buildProfile.v = 1`: the actual Ninja
generator, configured build type, CMake version and C++ compiler ID/version/path.
The helper requests CMake's versioned `toolchains-v1` File API reply, follows
the newest reply index and checks the requested build type against the cache.
Incomplete compiler evidence or a mismatched configuration fails verification.
Only the selected scalar fields enter the receipt; existing historical receipts
are preserved. This records the existing Debug/foundation or Release/linked
selection and does not change either build configuration.

New receipts additionally bind foundation runtime outputs in `artifacts`:
Windows `rdp-worker.exe` / `rdp-runtime-directory.exe`, or Linux `rdp-worker` /
`rdp-process-query`. Each value is SHA-256 over the completed output, streamed
with the existing 64 MiB per-file bound. A missing/oversized output fails before
receipt publication. Linked artifact inventories keep their existing fields;
historical foundation receipts without this map are preserved. These hashes
bind observed outputs, not deterministic binary reproduction or redistribution
acceptance. [Receipt evidence](history/iterations/351-400.md#iteration-381).

On Windows x64, after preparing the ordinary foundation/Catch2 source, use:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-foundation
```

The wrapper supplies the MSVC environment and temporary ASCII workspace alias
through the entire new build/CTest/Node lifecycle run. It uses the same source
copy/hash checks and platform-specific Windows pipe/private-directory inventory.
It copies no old object or binary. This is local foundation source evidence;
linked FreeRDP/dependencies, clean-machine/distro and actual CI remain separate.
[Windows/Linux receipts](history/iterations/201-250.md#iteration-244).

To compile a new Linux linked Release project-native tree against the already
prepared pinned SDK, after the ordinary dependency/FreeRDP build:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked
```

This verifies the clean pinned FreeRDP source identity, reuses external installed
SDK/Catch2/toolchain inputs, copies the filtered feature report as declared build
metadata and compiles new worker/addon/fixtures. It requires linked CTest and
Node primary/framed/TLS lifecycle, checks the IPC addon's direct import boundary
and leaves a source/input/artifact-hash receipt. No project binary/cache is
copied. Upstream libraries are reused, not rebuilt; packaging,
clean-machine/distro and CI gates remain separate.
[Exact Linux scope and results](history/iterations/201-250.md#iteration-245).

For the corresponding Windows x64 linked source build after preparing the
ordinary bundled SDK/Catch2 source:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled
```

It uses the same clean pinned SDK checks and declared feature input, creates a
new MSVC Release output tree, copies SDK runtime DLLs through the existing CMake
rules and verifies Windows linked CTest/framed Node lifecycle. The Node addon
remains Linux-only. The wrapper keeps its alias alive through all child checks;
the fixture and hashes remain available under canonical build paths afterward.
This does not rebuild/package upstream dependencies or prove clean-machine /
device acceptance. [Windows linked receipt and scope](history/iterations/201-250.md#iteration-246).

To rebuild FreeRDP itself from a new local clone of the prepared pinned source,
using the existing private dependency/toolchain inputs on Linux:

```sh
node scripts/build-freerdp.mjs --clean-local
```

The helper requires a clean exact cached Git pin and creates a unique
`build/freerdp-source-clean-*` checkout, build and installed SDK. It preserves
the ordinary profile/private dependency checks, compiles a public-API consumer,
checks actual loaded-library origins/version/static channels, tests rejection
of a foreign expected prefix and runs the consumer CTest. The generated report
and receipt stay inside the fixture. No network, existing SDK replacement,
RDP connection or device access is needed. Dependencies are reused; complete
fresh dependency/distro/CI acceptance remains separate.
[Exact scope, hashes and retained first failure](history/iterations/201-250.md#iteration-247).

After that SDK receipt passes, compile and verify an independent Linux project
consumer against its exact installed prefix:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked \
  build/freerdp-source-clean-EXAMPLE/receipt.json
```

Use the actual generated receipt path. The helper checks its finite size,
completed SDK identity/pin, new source/output/install relationship and unchanged
bytes, then requires all three CMake package origins inside the new SDK. Runtime
library paths are scoped automatically for its CTest/Node children. Its own
receipt binds the SDK receipt hash and distinguishes SDK consumption from the
preceding actual source rebuild. It leaves both build trees for inspection.
This accepts the named Linux consumer, with reused other dependencies, rather
than complete fresh dependency/distro/CI or RDP/device acceptance.
[Results and scope](history/iterations/201-250.md#iteration-248).

The corresponding new Windows SDK source build uses the existing MSVC/ASCII
alias wrapper:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp
```

The alias stays alive through clone/build/install, DLL version/origin/static
channel verification, foreign-prefix refusal and CTest. Existing dependency
DLLs/toolchain are reused, not rebuilt. The independent probe explicitly uses
the public shared WinPR import ABI; no production source is patched. This is a
local SDK check, separate from a new Windows worker consumer and complete fresh
dependency/clean-machine/distro/CI acceptance.
[Windows result and retained first probe failure](history/iterations/201-250.md#iteration-249).

To build a new Windows worker consumer of that completed SDK receipt:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled `
  -RebuiltSdkReceipt build/freerdp-source-clean-EXAMPLE/receipt.json
```

Use the actual relative generated receipt path. The wrapper refuses absolute /
traversal paths and other tasks before toolchain setup, then projects the path
through its ASCII alias. The shared helper validates the complete unchanged SDK
receipt and exact CMake package origins. It creates fresh project output and
checks linked CTest/Node process lifecycle without replacing the ordinary SDK.
Compilation has a separate finite ten-minute budget; CTest and process/IPC
checks retain their existing deadlines. The prepared dependency/toolchain inputs
remain reused. [Current Windows/Linux acceptance](history/iterations/201-250.md#iteration-250).

For a separate Windows linked **Debug** consumer, first build an isolated
Debug SDK with matching Debug CRT:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp-debug `
  -DependencyReceipt build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

Then pass that new SDK's actual receipt to the Debug consumer:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-bundled-debug `
  -RebuiltSdkReceipt build/freerdp-source-clean-EXAMPLE/receipt.json
```

The underlying SDK mode is `--clean-debug`; it always uses new source/build/
install directories and leaves ordinary/clean Release modes unchanged. The
source consumer mode is `linked-debug`. It requires a bound SDK
receipt before Catch2/toolchain/build preparation, and writes the filtered SDK
feature input inside its new fixture. On Windows it additionally requires the
SDK receipt/cache to identify Debug with dynamic Debug CRT. A Release-CRT SDK
is rejected before output preparation: its returned allocations cannot be
freed through a different consumer CRT. The private dependency outputs remain
reused with their recorded build types and API-specific ownership.
The actual CMake compiler/build-type reply is verified in the consumer receipt.
The existing `linked` / `clean-bundled` profile remains Release. No ordinary
worker, helper or generated feature inventory is replaced by this Debug task.
[Profile scope and verification](history/iterations/301-350.md#iteration-312).

Windows receipt-backed consumers validate CRT compatibility in both directions:
a Release consumer also refuses a Debug SDK before preparing output. Historical
Release receipts without a recorded build type remain accepted when their
actual SDK cache identifies Release and dynamic Release CRT.
[Reverse-combination control](history/iterations/301-350.md#iteration-313).

The selected source receipt can also drive the explicit authorized Windows
RDP CPU/RSS smoke, including worker/helper hash verification and joined cleanup:

```powershell
node scripts/test-rdp-resource-lab.mjs sha256:<approved-session-fingerprint> `
  build/native-clean-EXAMPLE/receipt.json
```

This observes the existing desktop without remote input/application launch or
saved frames. [Requirements and scope](RDP_RESOURCE_SMOKE.md),
[Release/Debug actual observations](history/iterations/301-350.md#iteration-314).

For an isolated local Linux private dependency rebuild from cached source/tool
downloads:

```sh
node scripts/build-dependencies.mjs --clean-local
```

Prepare the ordinary pinned vcpkg checkout/tool first. The helper uses unique
install/buildtrees/packages directories, disables binary caches, refuses new
source downloads and limits compilation to two jobs. It checks the clean vcpkg
pin and bounded unchanged recipe input, then writes
`installed/bridge-dependency-build.json` with source-only settings and the
installed-status hash. The original dependency prefix remains separate.
Compiler/build tools and source archives are reused; this is local source
rebuild evidence, separate from Windows/distro/CI and final runtime acceptance.
[Results and provenance](history/iterations/251-300.md#iteration-252).

Use the completed source dependency receipt for a new Linux FreeRDP SDK:

```sh
node scripts/build-freerdp.mjs --clean-local \
  build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

The SDK helper verifies the receipt/settings/current recipes/status, uses its
exact dependency root for configure/link/runtime and feature inspection, then
binds the unchanged dependency receipt hash into the new SDK receipt. Omitting
this argument retains the ordinary prepared dependency input. Neither path
replaces the ordinary installed SDK. [Verified handoff](history/iterations/251-300.md#iteration-253).

Pass that SDK's new receipt to the source-only project helper as before:

```sh
node scripts/test-native-clean-build.mjs /catch2-src linked \
  build/freerdp-source-clean-EXAMPLE/receipt.json
```

If the SDK binds a source-rebuilt dependency receipt, the project helper checks
that exact receipt/status/recipe input and uses its prefix throughout configure,
inventory and runtime children. Both receipt hashes appear in the consumer
receipt. The actual Linux source chain, codec/module-origin checks and full
Node regression pass locally; fresh OS/distro/CI and RDP/device/release gates
remain separate. [Complete consumer evidence](history/iterations/251-300.md#iteration-254).

The same source dependency → SDK chain is available on Windows:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-dependencies
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-freerdp `
  -DependencyReceipt build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

Use the actual generated relative receipt path. Run Windows native wrappers
sequentially so their temporary ASCII drive aliases cannot outlive one another.
The dependency selector refuses other tasks and traversal/absolute paths before
toolchain setup. Existing binary caches are disabled and source downloads are
refused; the Windows host itself is not network isolated. The first sandboxed
MSBuild FileTracker access failure and successful authorized repeat are retained
in [dependency evidence](history/iterations/251-300.md#iteration-255). The new pinned SDK's module origins,
static inventory, consumer CTest and receipt binding pass
[separately](history/iterations/251-300.md#iteration-256). Use its receipt with `clean-bundled` as above.

Source-only linked consumers pass their verified SDK source `LICENSE` through
`BRIDGE_FREERDP_LICENSE_FILE`. Ordinary builds retain `.deps/FreeRDP/LICENSE`
as the default. Linked packaging requires this input and the generated
`build/native-features.json` at configure time; it installs both even when the
source-only fixture contains no copied SDK CMake cache. New Linux install/ELF
closure/TGZ/restricted native-only runtime and Windows install/ZIP checks pass
[with the new source-built chain](history/iterations/251-300.md#iteration-258). To verify a particular TGZ,
pass its actual project-local path to `prepare-native-runtime-check.mjs`; the
default archive may belong to an older release cohort.

Windows Ninja dependency verification follows the SDK actually selected by the
worker's CMake cache. It checks the SDK's own matching install prefix and C-only
GDI/H.264 object dependencies after rebasing its cached ASCII alias. Both the
ordinary prepared and isolated source-built SDK layouts pass; unknown layouts
refuse. [Verification correction and full regression](history/iterations/251-300.md#iteration-261).

For Windows native-build verification, keep CMake's temporary ASCII alias alive
but run Node tests with physical project, entry-file and binary paths. The
source-only driver uses `fs.realpathSync.native()` for this Node phase because
pnpm junctions resolve to the physical drive. Mixing alias and physical module
URLs can instantiate error classes twice and break constructor checks.
Source/SDK receipt paths keep their original namespace. The bounded SUBST/pnpm
identity regression and complete Windows/Linux checks pass
[in iteration 266](history/iterations/251-300.md#iteration-266). A full tracked-source Windows export with
offline install/build/relocation/production deploy also passes
[in iteration 265](history/iterations/251-300.md#iteration-265).

The current required GNU target is GCC 8.3.0 for Astra Linux 1.7.5, while RED OS
7.3/GCC 11 remains mandatory. The compiler port retains C++20 language mode and
uses the limited bridge compatibility subset where the stock library lacks it.
See [current acceptance scope](COMPILER_SUPPORT.md) before treating a source
version check as complete platform support. Use a fresh build tree for each
compiler and rebuild all C++ dependencies rather than mixing their ABI/runtime
closures. Node 24 and CMake >=3.24 requirements are unchanged.

The separate [exact GCC 8.3 foundation workflow](../.github/workflows/gcc83.yml)
uses the pinned compiler image and hash-checked offline build tools. Follow the
[container instructions](../tests/fixtures/gcc83/README.md) to repeat it without
installing an OS VM. It tests foundation compilation/CTest; the linked private
runtime and actual RDP checks remain separate. [Local verification](history/iterations/401-450.md#iteration-413).

The following historical sanitizer profile uses GCC 12 with its C++20 library. The local
Ubuntu builder now includes g++-12; select it explicitly in a new output tree:

```sh
cmake --preset sanitizers -B build/sanitizers-gcc12-check \
  -DCMAKE_CXX_COMPILER=g++-12 -DFETCHCONTENT_FULLY_DISCONNECTED=ON \
  -DFETCHCONTENT_SOURCE_DIR_CATCH2=/catch2-src
cmake --build build/sanitizers-gcc12-check --parallel 2
ctest --test-dir build/sanitizers-gcc12-check --output-on-failure --timeout 30
```

`/catch2-src` is the prepared public source in the native Ubuntu verifier.
Keep an executable bounded build tmpfs, noexec /tmp, read-only root, UID1000,
network none and the other restrictions from iteration 262. Do not add non-PIE
flags or change ASLR/seccomp. GCC 12.4 CTest 16/16 and eleven Clang 18 bounded
PIE fuzz smokes pass locally; CI explicitly selects these compiler profiles and
budgets but remains unrun. Fuzz seed generation additionally needs Node 24 and
the built protocol JS (or its already generated public corpus).
[Current results and remaining symbolizer/upstream scope](history/iterations/251-300.md#iteration-264).
