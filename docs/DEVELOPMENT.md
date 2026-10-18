# Building the foundation

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
require a connected/no-error result. [Result-classification evidence](ITERATION_299.md).

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
[Host policy](WORKER_MEMORY_POLICY.md), [evidence](ITERATION_298.md).

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
[Actual evidence](ITERATION_115.md).

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
unexpected startup. [Evidence and remaining acceptance](ITERATION_128.md).

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
budget or interrupted run is not acceptance. [Scope](ITERATION_174.md).

The separate transport-loss mode uses one loopback relay to the configured lab
IP, waits for real decoded desktop pixels, then breaks only that test connection.
It requires an explicit RDP failure, closed viewer and ordinary cleanup. Extra
peers are refused; no payloads are recorded or device permissions requested.
Run it after the soak, not during another timing observation. [Verified scope](ITERATION_183.md).

The private `test-xrdp-audio.mjs $fingerprint pcm` (or `opus`) now observes ten
seconds of real source data and makes at most one reset attempt while ready.
Subsequent fresh config/packet evidence is distinct from merely scheduled reset.
It emits scalar counts and a PCM nonzero indicator, never recordings/sample data.
Dedicated lab viewer `--audio-manual` / `--audio-opus-manual` performs the output
activation button click so certificate approval cannot expire while waiting for
it. The product viewer retains its gesture gate; this does not request microphone
permission. Audible quality remains a user check. [Current XRDP corrections](ITERATION_175.md).

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

The recovery modes require real active output before and after browser detach/
reattach, and fail for an idle source. Opus also requires an observed native
reset result and a fresh epoch. Leave audio playing on the authorized lab; the
helper does not start remote applications or record audio. [Verified scope](ITERATION_181.md).

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
[Build evidence](ITERATION_187.md), [closure boundaries](ITERATION_189.md).

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
[Actual evidence](ITERATION_201.md).

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
[Browser evidence](ITERATION_202.md).

Active Linux audio checks use `--audio-pcm` or `--audio-opus` instead of `--form`
on `test-linux-xrdp-viewer.mjs`. These explicitly select the 200 ms output profile
and activation gesture, require actual ready packets/Worklet rendering, then
check replay. Opus additionally requires a native reset/new epoch. Leave sound
playing in the authorized XRDP session; an idle source fails the audio gate.
No microphone or audio recording is requested. [Evidence](ITERATION_208.md).

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
[Actual result and bounds](ITERATION_220.md).

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
[Evidence and current network gap](ITERATION_210.md).

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
no host libraries. [Actual restricted native-runtime evidence](ITERATION_190.md).

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
acceptance. [Exact evidence and retained first helper error](ITERATION_243.md).

New clean-native receipts also include `buildProfile.v = 1`: the actual Ninja
generator, configured build type, CMake version and C++ compiler ID/version/path.
The helper requests CMake's versioned `toolchains-v1` File API reply, follows
the newest reply index and checks the requested build type against the cache.
Incomplete compiler evidence or a mismatched configuration fails verification.
Only the selected scalar fields enter the receipt; existing historical receipts
are preserved. This records the existing Debug/foundation or Release/linked
selection and does not change either build configuration.

On Windows x64, after preparing the ordinary foundation/Catch2 source, use:

```powershell
powershell -NoProfile -File scripts/native-build.ps1 -Task clean-foundation
```

The wrapper supplies the MSVC environment and temporary ASCII workspace alias
through the entire new build/CTest/Node lifecycle run. It uses the same source
copy/hash checks and platform-specific Windows pipe/private-directory inventory.
It copies no old object or binary. This is local foundation source evidence;
linked FreeRDP/dependencies, clean-machine/distro and actual CI remain separate.
[Windows/Linux receipts](ITERATION_244.md).

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
[Exact Linux scope and results](ITERATION_245.md).

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
device acceptance. [Windows linked receipt and scope](ITERATION_246.md).

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
[Exact scope, hashes and retained first failure](ITERATION_247.md).

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
[Results and scope](ITERATION_248.md).

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
[Windows result and retained first probe failure](ITERATION_249.md).

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
remain reused. [Current Windows/Linux acceptance](ITERATION_250.md).

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
[Results and provenance](ITERATION_252.md).

Use the completed source dependency receipt for a new Linux FreeRDP SDK:

```sh
node scripts/build-freerdp.mjs --clean-local \
  build/dependencies-source-clean-EXAMPLE/installed/bridge-dependency-build.json
```

The SDK helper verifies the receipt/settings/current recipes/status, uses its
exact dependency root for configure/link/runtime and feature inspection, then
binds the unchanged dependency receipt hash into the new SDK receipt. Omitting
this argument retains the ordinary prepared dependency input. Neither path
replaces the ordinary installed SDK. [Verified handoff](ITERATION_253.md).

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
remain separate. [Complete consumer evidence](ITERATION_254.md).

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
in [dependency evidence](ITERATION_255.md). The new pinned SDK's module origins,
static inventory, consumer CTest and receipt binding pass
[separately](ITERATION_256.md). Use its receipt with `clean-bundled` as above.

Source-only linked consumers pass their verified SDK source `LICENSE` through
`BRIDGE_FREERDP_LICENSE_FILE`. Ordinary builds retain `.deps/FreeRDP/LICENSE`
as the default. Linked packaging requires this input and the generated
`build/native-features.json` at configure time; it installs both even when the
source-only fixture contains no copied SDK CMake cache. New Linux install/ELF
closure/TGZ/restricted native-only runtime and Windows install/ZIP checks pass
[with the new source-built chain](ITERATION_258.md). To verify a particular TGZ,
pass its actual project-local path to `prepare-native-runtime-check.mjs`; the
default archive may belong to an older release cohort.

Windows Ninja dependency verification follows the SDK actually selected by the
worker's CMake cache. It checks the SDK's own matching install prefix and C-only
GDI/H.264 object dependencies after rebasing its cached ASCII alias. Both the
ordinary prepared and isolated source-built SDK layouts pass; unknown layouts
refuse. [Verification correction and full regression](ITERATION_261.md).

For Windows native-build verification, keep CMake's temporary ASCII alias alive
but run Node tests with physical project, entry-file and binary paths. The
source-only driver uses `fs.realpathSync.native()` for this Node phase because
pnpm junctions resolve to the physical drive. Mixing alias and physical module
URLs can instantiate error classes twice and break constructor checks.
Source/SDK receipt paths keep their original namespace. The bounded SUBST/pnpm
identity regression and complete Windows/Linux checks pass
[in iteration 266](ITERATION_266.md). A full tracked-source Windows export with
offline install/build/relocation/production deploy also passes
[in iteration 265](ITERATION_265.md).

The GNU compiler minimum is GCC 12 with a matching C++20 library. The local
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
[Current results and remaining symbolizer/upstream scope](ITERATION_264.md).
