# TODO — implementation plan

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

DONE applies to the named component and its explicit platform/test scope. A
verified component can be DONE while the containing stage remains IN PROGRESS.
An entire stage becomes DONE only when its requirements and **Gate** pass;
fixture/SDK integration does not substitute for actual RDP/device acceptance.
Iteration reports are evidence/history, not newly added unfinished stages.
Status clarification and preserved history: [iteration 173](docs/ITERATION_173.md).

Current stage acceptance:

| Stage | Current status | What prevents full DONE |
| --- | --- | --- |
| 0 — build | IN PROGRESS | Fresh-checkout/distro matrix, CI execution and standard PIE sanitizer environment; linked Linux CTest, ELF closure and independent Bookworm native runtime pass |
| 1 — worker/IPC | IN PROGRESS | Primary/fallback Release IPC lifecycle passes on Linux/Windows; connected output/release/resource, addon sanitizer, configured capacity, broader isolation and abnormal cleanup remain |
| 2 — session/API | DONE for Windows fake-backend gate | Accepted lifecycle/WS gate; real RDP and platform acceptance belongs to the corresponding stages |
| 3 — connection | IN PROGRESS | Windows RDP lab, remaining settings/auth/trust history, errors and reconnect |
| 4 — graphics | IN PROGRESS | Remaining GFX/resource/interactive cases, Windows server and investigation of an intermittent soak failure; one XRDP 30-minute observation passes |
| 5 — input | IN PROGRESS | Actual keyboard/layout/IME, buttons/wheel/touch and no-stuck-input acceptance |
| 6 — audio | IN PROGRESS | Real audible output/recording, ready-source recovery and measured LAN queue target |
| 7 — clipboard/drives | TODO | Implementation and remote CRUD/clipboard gate |
| 8 — devices | TODO | Implementation and per-advertised-device integration matrix |
| 9 — advanced settings | IN PROGRESS | Categories beyond accepted single-display resize and their integration tests |
| 10 — release | IN PROGRESS | Deployment/installers, resource/network/concurrency soak and complete regression |
| 11 — extensions | OPTIONAL TODO | Separate capability-gated extensions; not required for v1 |

Scope decision — 2026-10-09: **one primary monitor at 100% desktop/device scale
is sufficient**, using the existing orientation 0. Multimonitor and other RDP
scale/layout profiles are excluded from current required work by explicit user
instruction; they are not unfinished acceptance gates. [Accepted ADR-011](docs/adr/ADR-011-single-display-100-percent.md).
All other requirements, including confirmed resize, input, audio, devices,
platforms, resource limits and soak verification, remain.

## Implementation status — 2026-10-15

Linux API/private-native service runtime now passes independent non-root /
read-only/no-network HTTP, default authorization refusal and synthetic host /
native lifecycle/cleanup. Production Node deployment retains pinned versions
and excludes source/devDependencies. The final runtime image is built; fresh
source/distro/CI, installers and actual RDP/device/load gates remain open.
[Iteration 211](docs/ITERATION_211.md), [deployment](docs/CONTAINER_RUNTIME.md).

Current Linux native archive again passes the independent non-root/read-only /
no-network runtime smoke. A bounded private-stdin microphone inventory helper
is available without physical capture or sample submission. Actual XRDP input
verification is currently blocked by host TCP timeout; the worker reports
RDP_CONNECT_TIMEOUT and cleans up normally. [Iteration 210](docs/ITERATION_210.md).

Guarded Linux virtual PCM/Opus microphone selection now follows the existing
typed HELLO/CLI/Node/public capability contract. Twelve actual process/TLS cases
cover both IPC carriers and all input/output combinations; focused microphone
tests pass 46/46. This verifies activation/refusal/cleanup without physical
capture; ready AUDIN/recording/LAN acceptance remains open.
[Iteration 209](docs/ITERATION_209.md).

Actual Linux producer / Windows Edge now passes PCM/Opus packet decode and
AudioWorklet sample rendering with the 200 ms native profile, video resize /
restoration and fresh-token replay. Opus replay observes one actual scheduled
native reset and source epoch 8→10. First Opus admission attempt failed; repeats
pass. This is the named E2E smoke, not human audible/latency/quality/soak or all
audio-stage acceptance. [Iteration 208](docs/ITERATION_208.md).

Linux primary idle/assembly deadline separation now has a failing-before /
passing-after socket regression, repeated idle heartbeats and Release/sanitizer
checks. Actual primary XRDP receives PCM/Opus with ready reset/fresh config/data;
one Opus protocol failure remains unexplained. Browser/audio quality, latency and
resource/soak acceptance remain open. [Iteration 207](docs/ITERATION_207.md).

Guarded Linux amd64 PCM/Opus output, native reset and 120/200 ms selection are
activated through the primary and framed priority writers. Eight native/TLS
profile cases and full Node/native/relocation/independent archive checks pass.
Actual XRDP receives Formats but Linux has no samples yet, including one
RDP_PROTOCOL_ERROR; the Windows control receives active Opus. Linux source /
browser/audio acceptance remains open pending negotiation diagnosis.
[Iteration 205](docs/ITERATION_205.md).

Actual Linux producer/API/primary IPC now renders XRDP in Windows Edge through
both H.264/WebCodecs and JPEG/canvas. Nonblank 1080p, public confirmed resize /
restoration with fresh configs/IDRs and fresh-token reattachment replay pass;
joined server/worker cleanup leaves an empty runtime. This adds the named browser
smoke, not a Linux-browser/platform/audio or sustained resource gate.
[Iteration 202](docs/ITERATION_202.md).

Controlled actual Linux/XRDP loss now passes after real media and resize in both
primary and explicit framed IPC: exact RDP_DISCONNECTED, continued heartbeat and
empty-runtime/relay cleanup. This accepts the named private connected loss case;
remote held-input/device release, browser failure state, reconnect and sustained
resource acceptance remain open. [Iteration 203](docs/ITERATION_203.md).

Actual Linux amd64/XRDP now passes strict certificate rejection and the previously
approved session-only fingerprint over automatically selected primary IPC.
1920×1080 JPEG/H.264 IDR, confirmed 1280×720 resize/restoration with fresh IDRs,
heartbeat and empty-runtime cleanup pass. This is private Node/native RDP
integration; browser, audio/devices and sustained resource/soak acceptance remain
open. [Iteration 201](docs/ITERATION_201.md). Earlier Linux build-only statements
below describe their historical evidence and are superseded only for this slice.

Current IPC evidence: Linux automatically selects paired private RWS1
SOCK_SEQPACKET and keeps explicit/legacy framed fallback. Actual Node/native
100-worker lifecycles, parent/worker death, cancellation, independent deadlines,
private settings/secret, descriptor joins and installed/independent archive checks
pass. Full Node: Windows 537 passed / 25 platform skips; Linux 487 passed / 75
platform skips, 562 cases, zero failures. [Iteration 200](docs/ITERATION_200.md).
This completes the named Release transport component, not all Stage 1:
configured-capacity admission, addon sanitizer baseline, broader isolation /
abnormal cleanup and connected-RDP/resource gates remain explicitly open.

Lifecycle and the Stage 2 fake-backend gate are verified on **Windows x64**.
Actual Linux amd64 foundation now passes ASan/UBSan CTest 8/8, seven bounded
libFuzzer smoke targets and Node check (439 passed / 83 skipped / zero failures).
One hundred sequential workers and parent-death cleanup pass on Linux framed
pipes. Windows Node check passes 522/522. The local sanitizer placement workaround,
retained failed PIE runs and platform boundaries are recorded in
[iteration 184](docs/ITERATION_184.md); no linked Linux RDP/device acceptance is claimed.
Linked Linux Release FreeRDP/worker now passes CTest 20/20 and full Node check
(453 passed / 75 skipped / zero failures, 528 total). Private eudev/libusb and
complete staged ELF closure pass; canonical relocation passes 1/1. Windows Node
check passes 528/528. [Current closure evidence](docs/ITERATION_189.md),
[build evidence](docs/ITERATION_187.md). No actual Linux RDP/device
acceptance or clean-machine portability is claimed.
The experimental Stage 3 core has connected to the authorized XRDP lab. Stage 4
now renders real 1080p XRDP through H.264/WebCodecs and the JPEG fallback in Edge.
Stages 0/1/3/4/5/6 remain **IN PROGRESS**. Physical input and release ownership are
implemented and tested with native/fake/Edge fixtures; actual XRDP input is verified
for motion only. Independent cursor extraction/overlay and XRDP shape replay are
verified; broader cursor gates, Unicode/IME, audio, platforms and devices remain open.
Stage 6 has guarded static RDPSND PCM/Opus worker activation, public media
negotiation and gesture/decoder/Worklet admission ownership on Windows. Actual
linked channel data tests use simulated SVC transport; browser PCM fixtures use
synthetic samples and Opus fixtures use the pinned SDK. Active actual XRDP now
delivers PCM and Opus through Node and browser Worklet admission after padded
Training, identical format-table and large-callback corrections. Frequent epoch
changes and large-burst discard remain quality gaps. Private ready-source reset
passes for both codecs on this lab. The user hears Opus but reports interruptions;
uninterrupted audio, broader recovery, microphone and
latency/resource/platform acceptance remain open.
[Actual source evidence](docs/ITERATION_175.md).
The user accepts current Opus output quality for local development: the explicit
200 ms profile sounds smoother, with remaining interruptions. A slow tunnel is
the user's hypothesis, not a measured cause. Native 120/200 ms selection, actual
PCM/Opus reception and ready reset pass; uninterrupted quality, measured latency
and the remaining audio gates are not waived. [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md),
[current evidence](docs/ITERATION_179.md).

Microphone foundations now include private Windows worker dispatch/reset,
bounded Node ingress and exclusive control/media session ownership. Restored
XRDP private off/PCM/Opus output combinations pass waiting-source inventory;
ready input, native selection/permission/capture and remote microphone acceptance
remain open. [Current session ownership](docs/MICROPHONE_SESSION.md),
[actual XRDP inventory](docs/ITERATION_115.md).
Explicit PCM microphone media routing is verified over actual loopback sockets
with fake RDP backends; this is separate from capture/RDP acceptance.
An isolated browser PCM sender now enforces local permission tokens, one issued
ACK correlation and one expiring latest unsent block. Capture/device ownership
and viewer activation remain open. [Sender contract](docs/MICROPHONE_SENDER.md).

Current explicit PCM/Opus microphone viewer, permission/Worklet/client and typed
native selection are implemented and verified with synthetic browser/socket
fixtures. Iteration 144 supersedes historical unactivated/PCM-only descriptions
below; actual authorized XRDP selection still reports waiting epoch 0 with no
capture. Ready AUDIN/device/recording/LAN/platform acceptance remains open.
[Current viewer](docs/ITERATION_144.md).

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). Latest bundled Windows `pnpm check`:
  **528/528**. Bounded browser fixture ports resolve the random 2049 refusal;
  focused Edge/socket 6/6 and full repeat pass. Earlier failures are preserved in
  [iteration 186](docs/ITERATION_186.md) and [iteration 188](docs/ITERATION_188.md).
  Recorded native assertion baseline: 72 IPC/input/state/audio-codec/output/capture cases / 61,347 assertions, 2 AVC cases / 19 assertions,
  2 cursor conversion cases / 11 assertions, 2 JPEG cases / 26 assertions and
  5 H.264 cases / 224 assertions. Dirty state adds 4 cases / 696 assertions;
  public GDI integration adds 5 cases / 9,199 assertions; GFX public callback fixtures
  add 7 cases / 27,160 assertions (combined GDI/GFX: 12 / 36,359), including
  actual incoming AVC420 decoder callbacks and malformed-command guards.
  [Cursor block evidence](docs/ITERATION_012.md), [dirty tracking evidence](docs/ITERATION_013.md),
  [GFX binding evidence](docs/ITERATION_014.md), [incoming AVC420 evidence](docs/ITERATION_015.md).
  GFX implementation commit: `90285bb`.
  Incoming AVC420 and incremental build corrections: `d5b1a0a`.
  [Quality/FPS profile evidence](docs/ITERATION_016.md): actual XRDP H.264/reset
  and JPEG report a configured 5 FPS cap; direct native capture intervals stay
  above 200 ms independently of Node pacing. Broader performance/soak gates remain open.
  Quality/FPS implementation commit: `bd8659b`.
  [Native Display Control foundation](docs/ITERATION_017.md): 8 cases / 280 assertions
  cover caps, layout bounds, pending/observed state, timeout and teardown. Actual public
  GDI realloc and resized AVC/JPEG decoding pass; public browser requests remain
  open. Windows foundation helper correction: `d295264`.
  Native Display Control/resize implementation commit: `4cc44d2`.
  [Private Display Control IPC evidence](docs/ITERATION_018.md): opt-in/capability,
  bounded request/result correlation, observed display generations and Node supervision pass.
  Actual XRDP negotiated caps, accepted 1920×1080 → 1280×720 → 1920×1080 and delivered
  fresh AVC IDRs plus resized JPEG. Public browser resize/lease/media ownership remains open.
  Private Display Control IPC implementation commit: `098ddab`.
  [Public Display Control/browser evidence](docs/ITERATION_019.md): current control-lease
  resize, typed results, actual display replay, input pause, media epoch/ACK preservation,
  same-size reset and stale unsent-frame rejection pass native/fake/Edge checks.
  Actual XRDP browser resize/restoration passes in H.264 and JPEG; Windows-server,
  resource limits and soak acceptance remain open. Broader display layouts are
  excluded from current scope by ADR-011.
  Public Display Control/browser implementation commit: `78fbb67`.
  [Modifier/focus synchronization evidence](docs/ITERATION_020.md): eight new pure /
  Edge-fake cases verify bounded modifier recovery, observed physical sides,
  lock ordering, composition and reset during a resize pause. Native tracking
  preserves both modifier sides across synchronize calls. Actual remote keyboard /
  layouts remain unverified; no broader input acceptance is claimed.
  Modifier/focus synchronization implementation commit: `236f1a1`.
  [Committed Unicode/IME fallback evidence](docs/ITERATION_021.md): bounded UTF-16BE,
  server capability refusal, old-peer gating, ordered Unicode down/up and release
  retry, text-rate budget and Edge preedit/explicit submission pass fixtures.
  Actual remote text/OS IME and direct canvas IME remain open.
  Committed Unicode/IME fallback implementation commit: `60e3ee4`.
  [Fractional wheel evidence](docs/ITERATION_022.md): bounded per-axis DOM
  pixel/line/page accumulation, gesture context/idle/reset handling and Edge
  ordering pass. Real wheel/trackpad sensitivity acceptance remains open.
  Fractional wheel implementation commit: `c5d9ec3`.
  [Native touch foundation evidence](docs/ITERATION_023.md): ten-contact bounded
  state, correct terminal coordinate ordering, API failure/cleanup ownership and
  public RDPEI projection pass 10 state cases / 13,114 assertions and 9 RDPEI cases /
  370 assertions. Five RDPEI cases use the actual linked addin with fake DVC
  transport; they are not remote touch acceptance. Worker suspension/contact
  cleanup, IPC/control, browser capture and real touch integration remain open.
  Native touch foundation implementation commit: `69e1717`.
- [Observable RDPEI transport evidence](docs/ITERATION_024.md): public-DVC
  SC_READY/CS_READY completion and periodic-frame suspension gate pass native
  tests. RDPEI suite now has 23 cases / 9,789 assertions, including ten actual-addin
  cases with fake transport. Transport resume is separate from contact/lease
  readiness; plugin/worker activation and end-to-end touch remain open.
  RDPEI transport gate implementation commit: `fb8643f`.
- [Public RDPEI ownership evidence](docs/ITERATION_025.md): pinned static addin
  registration, wrapped listener/gate, partial creation cleanup and lifecycle
  tests pass. RDPEI now has 34 cases / 10,127 assertions, including fourteen
  actual-addin/fake-DVC cases. Connection/contact drain, private IPC/browser and
  actual remote/physical touch remain open; no touch capability is advertised.
  Public RDPEI registration implementation commit: `af8b99e`.
- [Terminal contact drain evidence](docs/ITERATION_026.md): ten native/external
  contact pairs remain owned until terminal transport writes. Suspended native
  UP records survive periodic consumption, then drain before input readiness;
  resume-before-pump, reset, write/deadline failure and bounded parser cases pass.
  RDPEI has 51 cases / 12,314 assertions, including twenty-three actual-addin/fake
  transport cases. Timestamp-remoting/v1.0 compatibility and worker/IPC/browser
  activation remain open.
  Terminal contact drain implementation commit: `d38afe1`.
- [Scoped RDPEI provider/lifetime evidence](docs/ITERATION_027.md): Connection binds
  a public provider on the RDP thread after context creation, retires delegated
  resources before joining, and preserves the wrapper for later host termination.
  Other channels retain their previous provider. Touch loading/capability stays
  disabled until IPC/control/browser dispatch; actual remote RDPEI remains open.
  RDPEI: 62 cases / 12,612 assertions; bundled CTest 10/10, foundation 4/4,
  Node 124/124 and actual XRDP H.264 reset/resize/restoration pass.
  Scoped RDPEI provider/lifetime implementation commit: `1072e58`.
- [Bounded touch IPC codec evidence](docs/ITERATION_028.md): separate fixed
  versioned 16-byte record validates in native/TypeScript before body allocation.
  Portable touch is 14 cases / 14,182 assertions; current workers explicitly refuse
  dispatch and advertise no touch capability. Worker/control/browser wiring and
  remote touch acceptance remain open.
  Bundled Node 129/129, CTest 10/10, foundation CTest 4/4 and relocation 1/1 pass.
  Bounded touch IPC codec implementation commit: `156b5d4`.
  The 100 sequential worker test passes with no processes or
  runtime directories leaked. MSVC /analyze, /W4 /WX and clang-format checks pass.
- **Commits:** `9517003` build, `1672590` IPC/native lifecycle, `3610524` configuration,
  `316cdc0` Node supervisor/API/integration. Original blueprint is preserved in `3065f2d`.
- **Recent input commits:** private touch dispatch `6a34e2f`, public controller/browser `06b2527`, actual
  readiness/replay `1f73a98`, honest pen placeholder `26688c5`, terminal cleanup
  ordering `ff5fcdf`. [Current touch evidence](docs/ITERATION_031.md).
- **DONE on Windows:** exact FreeRDP/WinPR 3.32.1, local ZLIB 1.3.2, OpenSSL 3.6.5 and libusb
  1.0.30 build and link. Private native ZIP contains runtime DLLs, release CRT, licenses and
  dependency metadata. Relocation test checks actual loaded ZLIB/FreeRDP paths and static
  channel inventory without dependency PATH. JPEG now also ships privately and is encoded/decoded
  in the relocated runtime probe. OpenH264 encoding, AVCC and FreeRDP AVC420 decoding are verified natively.
  Current native ZIP is approximately 6.0 MiB, 14.9 MiB installed (47 files),
  including the private Opus runtime and excluding Node.js and future hardware
  providers/installers. Measured archive: 6,266,183 bytes; installed files:
  15,621,256 bytes. Earlier footprints remain in their historical reports.
  [Iteration 5](docs/ITERATION_005.md), [iteration 6](docs/ITERATION_006.md).
  Implementation commits: `7757d44`, `b1c779d`; local lab helper: `55e22cc`.
- **Retained acceptance:** Windows RDP lab is unavailable. Linux runtime/Clang
  are now available and portable checks pass in iteration 184; linked Linux
  FreeRDP/private dependency and primary IPC Release checks now pass locally;
  actual Linux RDP/device and broader platform/resource gates remain.
  The XRDP lab has passed strict certificate rejection and explicitly
  user-approved session-only trust, activation, heartbeat and cleanup checks.
  [Iteration 4](docs/ITERATION_004.md) records the historical absent-Linux scope;
  primary Linux IPC is implemented and verified in [iteration 200](docs/ITERATION_200.md).
  CI jobs are prepared but have not run; local sanitizer/fuzz execution is separate
  evidence and does not establish CI or linked Linux integration acceptance.

Wire details: [IPC foundation](docs/IPC_FOUNDATION.md). Audit and iteration report:
[contract audit](docs/CONTRACT_AUDIT.md), [iteration 1](docs/ITERATION_001.md), [iteration 2](docs/ITERATION_002.md).

## Stage 0 — repository and reproducible build

- [x] DONE for clean Linux Node workspace — New source-only fixture has no dist /
  node_modules; frozen offline installation, all four TypeScript builds and fresh
  production deployment/import pass with unchanged lockfile. Native fresh-checkout
  and distro matrix remain open. [Evidence](docs/ITERATION_213.md).

- [x] DONE for independent Linux native archive smoke — Pinned Node 24 Bookworm
  verifier uses only TGZ/probe, with no SDK/system FreeRDP/libudev, UID 1000,
  read-only root, no network and bounded tmpfs. Six private loaded modules,
  codec/libudev context roundtrips, exact HELLO/heartbeat/shutdown and worker
  directory cleanup pass. Full Node service image, distro/fresh-build/installer
  gates remain separate. [Evidence](docs/ITERATION_190.md). ELF closure: `8a51dc3`.

- [x] DONE for current Linux native ELF profile — Private eudev 3.2.14 keeps
  libusb udev enabled. Pre-CPack bounded canonical dependency/origin-path checks
  pass 33 ELF files / 268 edges, plus codec/libudev-context/lifecycle relocation
  1/1. Four portable ownership/parser cases pass. Independent clean-runtime,
  fresh-checkout/CI and actual device/platform gates remain separate.
  [Evidence](docs/ITERATION_189.md). Prior linked build: `a825c18`;
  IPC exact allocation: `4152919`; browser port correction: `194562d`.

- [x] DONE for local Linux dependency compilation — Pinned private ZLIB/OpenSSL/
  libusb/JPEG/libspng/OpenH264/Opus build, plus required Linux-only Kerberos 1.22.2
  and ICU 78.3, now CUPS 2.4.20, libfuse 3.18.3 and numactl 2.0.19. Exact
  FreeRDP/worker Release build and CTest 20/20 pass; private discovery, metadata,
  licenses and codec relocation are verified. eudev closure now passes in
  iteration 189; fresh-build and actual remote/device gates remain open.
  [Build evidence](docs/ITERATION_187.md),
  [previous reboot checkpoint](docs/ITERATION_186.md).
- [x] DONE — Create pnpm monorepo layout from `STACK.md` (core packages/apps/native; future component directories are created with their implementations). `9517003`.
- [x] DONE — Add TypeScript strict config, lint/format, CI skeleton. `pnpm check`; `9517003`.
- [x] DONE — Add CMake/Ninja native workspace. MSVC x64 build + CTest; `9517003`, `1672590`.
- [x] DONE on Windows — Pin FreeRDP **3.32.1** source/build and record commit/checksum. Source commit verified as `bf217a504e54cc719880c228e82353382cd7d4fa`; libraries built locally, linked CLI reports 3.32.1, archive SHA-256 generated. [Lock metadata](native/dependencies.json), [verification](docs/ITERATION_002.md). Linux build/fresh-checkout gate remains open.
- [~] IN PROGRESS — Enable required client channels; emit build feature report. Windows cache inventory matches actual static addins in the relocated bundle; CLI and REST expose it. Upstream 3.32.1 has no Windows serial/parallel clients; these are OFF explicitly. Linux inventory and all runtime device gates remain pending.
- [x] DONE — Add `rdp-worker --version --capabilities`. Native CLI and handshake reports agree; absent library reported as null, RDP false. [Integration test](tests/integration/worker.test.mjs); `1672590`, `316cdc0`.
- [x] DONE — Add Node `/v1/build` backed by real worker/build information. Fastify injection + native handshake/CLI comparison; `316cdc0`.
- [x] DONE for portable local Linux verification — Add debug ASan/UBSan job and execute native foundation: CTest 8/8 in the documented non-PIE Docker environment. [Workflow](.github/workflows/ci.yml) remains prepared; actual CI and standard PIE environment acceptance are open. [Evidence](docs/ITERATION_184.md).

**Gate:** clean build from fresh checkout/container; exact FreeRDP version visible; no UI required.

## Stage 1 — native worker process and IPC

- [x] DONE for Linux default IPC capacity — 32 concurrent actual native workers,
  automatic/manual heartbeat, refused pre-spawn 33rd owner, sixteen-slot
  replacement and joined process/FD/runtime cleanup pass. This is unconnected
  lifecycle evidence, separate from larger configured limits and 30+ connected
  RDP soak. [Evidence](docs/ITERATION_212.md).

- [x] DONE for Linux worker bounded stream lifecycle slice — Foundation/linked
  stdout now uses fixed priority lanes and finite nonblocking writer ownership.
  Actual paused-parent flood exits natively and cleans runtime; lifecycle 13/13,
  linked CTest 21/21, local non-PIE ASan/UBSan foundation 9/9, full Node 453 pass /
  75 skip and independent restricted TGZ pass. Primary seqpacket, actual connected
  media/release and broader resource/soak remain open. Driver: `9b4618f`.
  [Evidence](docs/ITERATION_192.md).

- [x] DONE for isolated Linux stream writer — Fixed dispatcher lanes, eventfd /
  one-thread nonblocking FIFO/Unix-stream writes, whole-record/drain deadlines,
  flags/SIGPIPE ownership and FD cleanup pass six real descriptor cases / 174
  assertions in Release and local ASan/UBSan. Linked CTest 21/21 passes. Worker
  selection/connected faults, primary seqpacket and broader gates remain open.
  [Contract](docs/LINUX_STREAM_OUTPUT.md), [evidence](docs/ITERATION_191.md).

- [x] DONE — Implement worker process entrypoint with no RDP connection yet. Real C++ executable, not a fake RDP client; `1672590`.
- [x] DONE — Implement versioned `RWI1` IPC envelope. [Native](native/ipc/tests.cpp) and [Node](tests/unit/protocol.test.mjs) boundary/golden/fragmentation tests; `1672590`.
- [x] DONE for Linux amd64 Release IPC lifecycle — Primary `SOCK_SEQPACKET`/RWS1, automatic verified-bundle selection and framed legacy/explicit fallback. Actual 100-worker Node/native runs, parent/worker death, startup cancellation, pre-secret identity/refusal, independent record deadlines, bounded queue/output and joined cleanup pass. Installed RPATH pairing, relocation and independent archive smoke pass. This is transport acceptance; larger configured-capacity admission, addon sanitizer, connected RDP/resource and broader platform gates remain separately tracked. [Contract](docs/LINUX_SEQPACKET.md), [owner](docs/ITERATION_198.md), [explicit activation](docs/ITERATION_199.md), [default/packaging](docs/ITERATION_200.md).
- [x] DONE — HELLO/HELLO_ACK capability negotiation. Real worker capability/CLI checks; incompatible version/required-feature native tests; `1672590`, `316cdc0`.
- [x] DONE — Heartbeat and graceful shutdown. Real-worker and adversarial fake-worker deadline/watchdog tests; `316cdc0`.
- [x] DONE — Length limits and parser unit tests. Header checked before body allocation; malformed/truncated inputs fail without input disclosure. `1672590`.
- [x] DONE for bounded local Linux smoke — libFuzzer IPC target and seeded run: 2,074,807 executions in 21 seconds with ASan/UBSan and zero failure. Six other portable parser targets also pass. Extended/upstream fuzzing and actual CI remain open. [Target](native/ipc/fuzz.cpp), [evidence](docs/ITERATION_184.md).
- [~] IN PROGRESS — Parent-death handling and private runtime directory cleanup. Windows and actual Linux framed-pipe parent-death/cleanup and 100 sequential worker tests pass. Windows private ACL creation/startup is implemented; broader multi-user isolation and simultaneous hard-kill cleanup remain open. [Linux evidence](docs/ITERATION_184.md).

**Gate:** Node test supervisor can spawn 100 sequential workers, exchange heartbeats, kill/restart without leaked processes/files.

## Stage 2 — Node session manager and public API

- [x] DONE — Fastify, TypeBox and Pino. Recursive credential/log tests pass.
- [x] DONE — POST/GET/DELETE /v1/sessions. Owner-scoped lifecycle tests pass with explicit fake backend.
- [x] DONE — Attach-token generation/TTL/scope. Hash-only storage, bounded TTL/count, replay/expiry/channel tests pass.
- [x] DONE — Control/media WebSocket authorization and Origin checks. Actual socket tests pass; JPEG media is now implemented in Stage 4.
- [x] DONE — Per-session/global limits. Startup/cleanup/retention/rate/body/token/socket bounds tested.
- [x] DONE — Registry crash supervision. Isolation/state/error tests pass; native connection adapter remains Stage 3.
- [x] DONE — Prometheus baseline metrics. Protected endpoint and bounded label tests pass.
- [x] DONE — Session state/error model. Transition, deadline, abort and shutdown tests pass.

**Gate:** fake worker can drive complete lifecycle and WS attach tests.
**Accepted on Windows:** eight manager and eight API tests; full pnpm check passes 32/32.
The CLI denies protected routes until hosting authentication is configured; without
a native backend creation returns 501. [Contract](docs/SESSION_API.md),
[evidence](docs/ITERATION_003.md). Linux and actual RDP acceptance remain open.

## Stage 3 — FreeRDP connect core

- [x] DONE on Windows — Custom RDP_CLIENT_ENTRY_POINTS and bridge context, headless connection callbacks, WinSock initialization; actual XRDP activation and native lifecycle tests pass.
- [~] IN PROGRESS — Public settings mapper supports host/port, password credentials, auto/NLA/TLS, minimum TLS, initial display, deadlines and native video quality/FPS profiles. Broader settings remain explicit unsupported errors. [Quality contract](docs/VIDEO_QUALITY.md).
- [~] IN PROGRESS — Supplied credentials/auth callback are implemented; interactive replacement prompts remain TODO.
- [~] IN PROGRESS — Strict chain/name validation and one-session certificate prompts pass native/HTTP/WS tests. Persistent trust/TOFU and changed-certificate history remain TODO.
- [~] IN PROGRESS — Load addins and connect: XRDP activation/heartbeat verified; Windows RDP server lab remains unavailable.
- [~] IN PROGRESS — Stable connect/auth/certificate/timeout/disconnect failures implemented; richer remote disconnect categorization remains TODO.
- [~] IN PROGRESS — Graceful disconnect and cancellation verified; reconnect remains unsupported.
- [x] DONE for current connection slice — Password is delivered through a separate private IPC class after HELLO, with transport copies overwritten. No per-session secrets enter argv/env; unsupported hash/PIN modes are rejected.

**Gate:** CLI-less worker connects to Windows and XRDP, reports state, rejects changed certificate correctly.

- [x] DONE on Windows/XRDP — Named active transport-loss case: real decoded
  desktop, controlled loss of only the test connection, `RDP_DISCONNECTED`, failed
  public session, closed viewer and empty runtime after joined cleanup. Broader
  error categories, reconnect and remote input/device release remain open.
  [Evidence](docs/ITERATION_183.md).

## Stage 4 — graphics, cursor and browser video

- [x] DONE for supported-settings/manual WEB connection example (2026-10-14):
  manual RDP host/port, username/domain/password, supported connection/display /
  quality/media settings, explicit session-only certificate decision and connect /
  disconnect actions. Hosting authentication stays separate from RDP credentials;
  no password/profile persistence. Other Remmina-like functions follow their
  backend stages and must show explicit unsupported state until implemented.
  Form/schema, authorization refusal, secret clearing, late-create cancellation
  and actual Edge/HTTP fixtures pass. Real Linux/XRDP H.264/JPEG creation through
  the form, session-only certificate click, resize/replay and cleanup pass;
  empty Windows launcher smoke passes. This accepts the named UI example, not
  the pending backend functions. [Contract/run](docs/WEB_CONNECTION_EXAMPLE.md),
  [evidence](docs/ITERATION_204.md).

Current actual soak attempt stopped with `RDP_PROTOCOL_ERROR` after its last
successful sample at 22 minutes 9 seconds. Memory/queue samples were within
bounds. A full repeat now passes; the first failure's cause remains unverified.
[Failure evidence and diagnostics](docs/ITERATION_180.md),
[completed 30-minute repeat](docs/ITERATION_182.md).

- [x] DONE on Windows/XRDP — Named single-viewer H.264 1080p 30-minute observation,
  sampled bounded queues/worker memory, resize/restoration, cursor/attachment replay
  and empty-runtime cleanup. This does not close broader interactive, Windows-server,
  resource or intermittent-failure acceptance. [Evidence](docs/ITERATION_182.md).

- [x] DONE on Windows and local Linux amd64/XRDP — Initialize headless FreeRDP GDI/framebuffer. Native codec tests and real 1080p Edge rendering verified; [Windows evidence](docs/ITERATION_005.md), [Linux producer evidence](docs/ITERATION_202.md). Broader server/platform/resource acceptance remains open.
- [~] IN PROGRESS — Classic BeginPaint/EndPaint/DesktopResize and synchronous public GFX binding wired. Native GFX frame-end/inter-frame pixels, AVC420 IDR/predictive decode, reset, bounded surface/cache/command guards and teardown fixtures pass; actual XRDP browser regression passes. Actual negotiated GFX, AVC444/other compressed codecs, true scaled-output mapping, decoder resource limits and dynamic server resize remain open. [Contract](docs/GFX.md), [binding evidence](docs/ITERATION_014.md), [AVC420 evidence](docs/ITERATION_015.md).
- [~] IN PROGRESS — Native Display Control binds negotiated caps and one bounded layout; private IPC/Node and public control leases expose opt-in, typed results, server-observed generations and deadlines. Actual XRDP browser resize/restoration, display replay, fresh AVC IDRs/JPEG configs, nonfatal input pause and transmitted media ACK preservation pass. The single-primary layout at 100% scale satisfies ADR-011; Windows-server, DVC resource audit and soak acceptance remain open. Automatic viewport policy is optional follow-up; wider layouts are outside current scope. [Contract](docs/DISPLAY_CONTROL.md), [native evidence](docs/ITERATION_017.md), [IPC/XRDP evidence](docs/ITERATION_018.md), [public/browser evidence](docs/ITERATION_019.md).
- [~] IN PROGRESS — Rectangle accumulation uses a fixed 64-region set, conservative union/collapse, clipped revision changes and snapshot consumption after successful encode/send. Native coverage and public GDI/GFX callback tests pass; actual XRDP regression is recorded in [iteration 13](docs/ITERATION_013.md) and [iteration 14](docs/ITERATION_014.md). Partial-region encoding and actual negotiated GFX tracking remain pending; AVC/JPEG continue encoding full frames per ARCHITECTURE §4. [Contract](docs/DIRTY_REGIONS.md).
- [x] DONE on Windows/XRDP — Public pointer callbacks extract bounded RGBA shape, hotspot, position and visibility; native conversion/state/parser tests and actual XRDP shape delivery/replay pass. [Contract](docs/CURSOR.md), [evidence](docs/ITERATION_012.md). Exact mono inversion and broader server/platform cases remain retained gaps.
- [~] IN PROGRESS — JPEG/AVC latest-state scheduling shares one pending capture with render credit. Configurable FPS caps and quality/bitrate profiles reach native encoders; effective ceilings remain 20 JPEG / 30 AVC FPS. Native/fake and actual XRDP cap checks pass. Provider selection and adaptive congestion remain pending. [Contract](docs/VIDEO_QUALITY.md), [evidence](docs/ITERATION_016.md).
- [x] DONE on Windows — H.264 encoder interface and private OpenH264 software provider; real encode/decode, forced IDR, GOP and resize tests pass. [Contract](docs/MEDIA_H264.md), [evidence](docs/ITERATION_006.md). Linux/hardware selection pending.
- [x] DONE on Windows/XRDP — AVCC config/access-unit packetization, IPC/RWB1 bounds and actual browser decode verified; [evidence](docs/ITERATION_007.md).
- [x] DONE on Windows and local Linux amd64/XRDP — Encoded JPEG/AVC worker→Node RWI1 and browser RWB1 forwarding, without raw frames in JS. Linux primary IPC/public API/Windows Edge smoke passes [iteration 202](docs/ITERATION_202.md); sustained resource/platform gates remain open.
- [x] DONE in Edge/Windows — Reference harness checks WebCodecs support, renders actual 1080p AVC/JPEG and closes VideoFrames/ImageBitmaps. Other browsers/platforms remain unverified.
- [x] DONE in Edge/Windows — Independent binary shape stream and transparent overlay; local movement, CSS-scaled hotspot, hide/default and disposal tested. Actual XRDP shape and browser reattachment replay pass. [Evidence](docs/ITERATION_012.md). Full desktop soak remains open.
- [x] DONE on Windows/XRDP — Native JPEG fallback and browser canvas path, private libjpeg-turbo, bounded allocation and relocation verified. [Contract](docs/MEDIA_JPEG.md).
- [~] IN PROGRESS — Single-frame credit, ACK deadline, stale lease/ACK/reset rejection, static/latest revision and dimension config verified. Actual WebCodecs decoder-error recovery forces config/IDR; adaptive bitrate/drop policy remains pending.
- [~] IN PROGRESS — Bounded native encode/read counters, browser decode/draw timings and a deterministic 1080p encoder benchmark implemented. Protected Node capture/write/render-credit histograms, queued frame/byte counters and credit occupancy now distinguish consumer stalls from capture time. Full dirty-to-send/queue-delay and performance gates remain open. [Encoder evidence](docs/ITERATION_009.md); `06233ce`, build tracking `be42b9d`. [Node timing evidence](docs/ITERATION_011.md).

**Gate:** stable 1080p interactive Windows/XRDP desktop for 30 min, resize safe, cursor smooth, no unbounded queue growth.

## Stage 5 — keyboard, mouse, wheel and touch

Current integration evidence: [private/native touch](docs/ITERATION_029.md),
[public lease/browser](docs/ITERATION_030.md), [actual XRDP readiness/replay](docs/ITERATION_031.md),
[pen placeholder](docs/ITERATION_032.md), [terminal cleanup](docs/ITERATION_033.md),
[international keyboard positions](docs/ITERATION_034.md). The historical foundation
records above do not describe today's activation state. Actual touch/application
and other remote acceptance gates remain open.

Manual local Edge viewing: `test-xrdp-viewer.mjs ... h264 --manual`.
[Launch commands](docs/DEVELOPMENT.md#manual-windowsxrdp-viewer).

- [~] IN PROGRESS — Physical set-1 mapping, extended left/right/numpad and eight international physical positions implemented; native/Node/Edge fixtures pass. Symbols are not used for mapping, composition stays local and reset releases held positions. Remote keyboard-layout/IME/hardware gate remains pending. [Contract](docs/INPUT.md), [initial evidence](docs/ITERATION_008.md), [international positions](docs/ITERATION_034.md).
- [~] IN PROGRESS — Browser modifiers reconcile before focused input; observed left/right sides survive canvas focus/resize pauses, missed releases are repaired, and Caps/Num/Scroll Lock synchronize after physical lock edges. Bounded pure/native and Edge/fake-control fixtures pass; actual remote layouts, AltGraph portability and no-stuck-key acceptance remain open. [Contract](docs/INPUT.md), [evidence](docs/ITERATION_020.md).
- [~] IN PROGRESS — Explicit committed Unicode/IME textarea, bounded UTF-16BE private IPC and FreeRDP Unicode events implemented; native, pure, fake IPC/control and Edge composition fixtures pass. Server Unicode negotiation is required; no automatic retry of partial/uncertain delivery. Actual remote application text/OS IME, supplementary/line-ending behavior and direct canvas IME remain unverified. [Contract](docs/INPUT.md#committed-unicode-text), [evidence](docs/ITERATION_021.md).
- [~] IN PROGRESS — Absolute coordinates and five buttons implemented; Edge captured-drag and native tracking tests pass. Real XRDP motion ACK verified; actual remote buttons pending.
- [~] IN PROGRESS — Both wheel axes and bounded fractional DOM pixel/line/page accumulation implemented; pure/Edge/control fixtures pass. Gesture context, focus/reset/resize pauses and idle gaps discard stale fractions; no new timer/queue or wire change. Actual remote wheel sensitivity and physical trackpad acceptance remain open. [Contract](docs/INPUT.md#fractional-wheel-and-trackpad-accumulation), [evidence](docs/ITERATION_022.md).
- [x] DONE in Edge/fake fixture — Only adjacent pointer moves are coalesced; transitions flush preceding motion. Independent remote cursor display now passes XRDP/Edge; measured latency and desktop soak gates remain open.
- [~] IN PROGRESS — Native pressed-state reset and retry, blur/disposal, transport loss and stale lease cancellation verified. Graceful close resets input; actual remote no-stuck-key gate pending.
- [~] IN PROGRESS — Native state, public RDPEI projection/registration and observable handshake gate implemented. Terminal IDs remain owned through transport writes; suspended native UP records drain before readiness in the RDPEI 1.0.1+/disabled-timestamp profile. Scoped public provider/retirement now follows Connection's RDP-thread lifecycle. Pure/public-call and actual-addin/fake-DVC tests pass. Contact dispatch/reset/resize/control wiring, timestamp-remoting/v1.0 compatibility, bounded IPC, browser capture and actual remote/physical touch remain open. Same-plugin DVC reopening is unimplemented. No touch capability is advertised. [Contract](docs/INPUT.md#terminal-contact-ownership-and-drain), [state](docs/ITERATION_023.md), [transport](docs/ITERATION_024.md), [registration](docs/ITERATION_025.md), [drain](docs/ITERATION_026.md), [provider/lifetime](docs/ITERATION_027.md).
- [~] IN PROGRESS — Opt-in worker/private Node touch dispatch, generation/readiness checks, fixed mixed FIFO and reset/resize drain are implemented. Native, codec and fake-worker tests pass; actual XRDP reports RDPEI ready with ten contacts, without sending touch. This supersedes the historical no-capability statement above. Public control/browser wiring, physical/remote acceptance and compatibility/resource audits remain open. [Evidence](docs/ITERATION_029.md), [contract](docs/IPC_FOUNDATION.md#generation-bound-touch-dispatch-iteration-29).
- [~] IN PROGRESS — Public touch control lease, queued readiness/generation checks, metadata replay and bounded browser Pointer Events capture are implemented. Node/control and Edge emulated two-contact fixtures pass; physical and remote application acceptance remain open. [Evidence](docs/ITERATION_030.md). Private dispatch implementation: `6a34e2f`.
- [x] DONE (unsupported placeholder) — `penInput=false` in HELLO decoding, native CLI and capability REST; owned RDPEI does not negotiate multi-pen, and browser pen Pointer Events produce no mouse/touch fallback. Native/public-context, actual-addin/fake-DVC and Edge fixtures pass. This is not pen support; optional future implementation/device acceptance remains. [Evidence](docs/ITERATION_032.md).

**Gate:** keyboard-layout test set, mouse/wheel, touch smoke; no stuck keys after disconnect.

## Stage 6 — audio output and microphone

- [x] DONE for Linux amd64 producer / Windows Edge PCM/Opus output smoke —
  Real XRDP packets, Opus decode, Worklet played samples, 200 ms profile, video
  resize/restoration, fresh-token replay and observed native Opus reset/new epoch
  pass. Native source/TLS/IPC, private relocation and cleanup are verified.
  Human audible quality, latency, intermittent protocol-failure diagnosis,
  prolonged resource/soak and remaining platform/microphone gates stay open.
  [Evidence](docs/ITERATION_208.md), [deadline fix](docs/ITERATION_207.md).

**Overall: IN PROGRESS.** Windows PCM/Opus output and input paths are implemented;
fixtures exercise their composition. Actual XRDP output now supplies real PCM/Opus
and browser decoder/Worklet admission. The user accepts smoother Opus output
with the 200 ms profile for local development; uninterrupted quality, recording
and the measured LAN queue gate remain open. Synthetic
browser samples and linked SDK channels with simulated transport establish
component behavior, not remote or physical-device acceptance.

### Accepted components

DONE below applies only to the stated component/profile and test scope. Linux,
broader format profiles and end-to-end acceptance are separate open work.

| Component | Status and accepted scope | Evidence |
| --- | --- | --- |
| PCM normalization/resampling | DONE — bounded native PCM8/PCM16 mono/stereo 8..48 kHz to S16LE 48 kHz stereo, portable fixtures | [36](docs/ITERATION_036.md), [47](docs/ITERATION_047.md) |
| Volume mapping | DONE — independent stereo perceptual gains, mute/full identity, exhaustive and linked fake-SVC fixtures | [44](docs/ITERATION_044.md) |
| Native PCM queue and packetization | DONE — fixed 120 ms ring and 20 ms publication, underflow/overflow/reset fixtures | [37](docs/ITERATION_037.md), [49](docs/ITERATION_049.md), [62](docs/ITERATION_062.md) |
| Native output buffer selection | DONE on Windows — immutable 120/200 ms profiles, bounded queue/configuration, legacy refusal, actual XRDP PCM/Opus selection and reset; not total latency acceptance | [179](docs/ITERATION_179.md), [ADR-012](docs/adr/ADR-012-audio-compatibility-buffer.md) |
| Ready output attachment recovery | DONE on Windows/XRDP — actual PCM/Opus 200 ms browser detach/reattach, fresh Worklet samples and scheduled Opus native reset; not general reconnect or loss/latency acceptance | [181](docs/ITERATION_181.md) |
| Private Opus output codec | DONE on Windows — pinned SDK encode/decode/reset/bounds and DLL relocation | [73](docs/ITERATION_073.md), [75](docs/ITERATION_075.md) |
| PCM/Opus record codecs | DONE — bounded native/Node/browser wire vectors and malformed-record fixtures | [50](docs/ITERATION_050.md), [75](docs/ITERATION_075.md), [76](docs/ITERATION_076.md) |
| Browser PCM playback owner | DONE in Edge synthetic fixtures — queue, Worklet admission ACK, gesture and cleanup | [70](docs/ITERATION_070.md), [71](docs/ITERATION_071.md) |
| Browser Opus decoder owner | DONE in Edge pinned-SDK synthetic fixtures — decode/priming, admission and cleanup | [77](docs/ITERATION_077.md) |
| Output record delivery/credit | DONE in fake-backend/actual loopback-WS fixtures — independent bounded PCM/Opus credit and recovery ownership | [69](docs/ITERATION_069.md), [93](docs/ITERATION_093.md), [94](docs/ITERATION_094.md) |
| Native microphone PCM source | DONE — fixed newest-data queue, silence/underflow, epoch and wipe-on-stop portable fixtures | [95](docs/ITERATION_095.md) |
| Private Opus input codec/compensation | DONE on Windows synthetic SDK composition — strict 20 ms decode, pre-skip and bounded reblocking | [129](docs/ITERATION_129.md), [132](docs/ITERATION_132.md) |
| Browser microphone capture/permission owners | DONE in synthetic Edge fixtures — packetizer, Worklet, denied/late permission and cleanup; no physical capture | [121](docs/ITERATION_121.md), [122](docs/ITERATION_122.md), [126](docs/ITERATION_126.md) |
| Explicit PCM/Opus microphone viewer | DONE in synthetic Edge/WS/fake-RDP fixtures — matching selection, gesture, stop/restart, source/controller loss | [143](docs/ITERATION_143.md), [144](docs/ITERATION_144.md) |
| Protected transport telemetry | DONE — fixed-label output/input counters, credit and timing tested with fake RDP/real sockets | [72](docs/ITERATION_072.md), [145](docs/ITERATION_145.md) |

### Remaining implementation and acceptance

- [~] Custom `rdpsnd-browser` virtual sink: selected Windows worker/native/Node/
  viewer PCM/Opus path and guarded static/dynamic ingress are implemented.
  Real XRDP negotiation and PCM/Opus browser admission pass; Opus is audible and
  the user accepts current 200 ms quality for development. Uninterrupted playback,
  burst quality and broader transport/platform recovery remain open. Private
  ready-source reset and public PCM/Opus 200 ms attachment recovery pass on this lab.
  [181](docs/ITERATION_181.md).
  [175](docs/ITERATION_175.md), [94](docs/ITERATION_094.md),
  [167](docs/ITERATION_167.md), [168](docs/ITERATION_168.md).
- [~] Custom `audin-browser` source, browser microphone capture and packet
  transport: selected Windows PCM/Opus AUDIN/worker/Node/viewer path is implemented.
  Actual XRDP input remains waiting epoch 0; negotiated ready input, physical
  permission/device capture and remote application recording remain unverified.
  [144](docs/ITERATION_144.md), [169](docs/ITERATION_169.md).
- [~] PCM normalization/resampling and Opus compatibility beyond the accepted
  fixed profiles: larger callbacks split within fixed storage and identical
  selected tables can repeat. Wider/higher-rate formats, changed server tables,
  callback CPU/quality and other browser/device sample rates remain open.
  Existing explicit profile refusals do not remove these retained requirements.
- [~] Audio queue/jitter/backpressure metrics: transport metrics exist; native/
  browser underflow, jitter, encode and host-queue export and measured LAN queue/
  latency acceptance remain open. [145](docs/ITERATION_145.md).
- [~] Underflow/silence behavior that does not block the RDP loop: bounded native/
  Worklet/capture fixtures pass; connected ready-source scheduling, callback CPU/
  wakeup budgets and real transport behavior remain open.
- [~] Audio reconnect/discontinuity reset: epoch, Close/reset, reattachment and
  ownership barriers pass fixtures; actual XRDP private reset and ready-source
  browser attachment recovery pass for the named profiles. Broader recovery and
  connection reconnect remain open. General reconnect is still unsupported in Stage 3.
- [ ] Actual remote output is audible and microphone recording usable, including
  stop/restart, controller/transport loss and no stale audio after reset.
- [ ] Measure the bounded <150 ms LAN queue target with active real sources.
- [ ] Verify native pool/codec/total RSS and CPU budgets, failure injection,
  lost-transport cleanup, Windows-server and Linux/platform behavior, sanitizer/
  fuzz execution and sustained/concurrent audio use. Prepared jobs are not passes.

The [original Stage 6 iteration records](docs/STAGE_6_HISTORY.md) preserve every
historical item, requirement, gap and test reference. They are not additional
release gates. Current evidence supersedes their earlier inactive-path wording;
unresolved compatibility/resource/device requirements remain required work.

**Gate:** remote audio audible and microphone usable with bounded <150 ms queue target in LAN test.
ADR-012 explicitly permits a 200 ms native output ring in the optional
compatibility profile; it does not establish total latency or waive the ordinary
profile's target, microphone, recovery, resource or platform acceptance.

## Stage 7 — clipboard and managed drives

- [ ] CLIPRDR Unicode text both directions.
- [ ] Clipboard policy directions/size caps.
- [ ] HTML clipboard.
- [ ] Image clipboard where negotiated.
- [ ] Session sandbox and safe path resolver.
- [ ] Streaming file upload/download REST API.
- [ ] RDPDR managed drive redirection.
- [ ] `thinclientDrives` alias mapped to sandbox drive descriptors.
- [ ] Read-only drive enforcement.
- [ ] File clipboard integration or explicit deferred flag.
- [ ] Quota/disk-full handling.

**Gate:** Unicode clipboard + remote file CRUD through redirected drive; traversal/symlink tests pass.

## Stage 8 — printer, smartcard, serial, parallel, USB

- [ ] Capability inventory for CUPS/PCSC/libusb/device nodes.
- [ ] Host printer allowlist and RDPDR printer mapping.
- [ ] Virtual spool printer backend and download event/API.
- [ ] Smartcard reader enumeration and redirection.
- [ ] Smartcard PIN prompt path and redaction.
- [ ] Serial allowlist + RDPDR mapping.
- [ ] Pseudo-TTY loopback integration test.
- [ ] Parallel mapping capability and smoke path.
- [ ] USB inventory + explicit selection.
- [ ] URBDRC redirect/unplug/replug behavior.
- [ ] Audit events for sensitive devices.

**Gate:** each advertised feature passes its hardware/emulator integration test; unsupported features report false rather than failing session creation.

## Stage 9 — advanced connection/Remmina-like settings

- [ ] RDP Gateway with same/separate credentials.
- [ ] Proxy support.
- [ ] IPv4/IPv6 preference/force options.
- [ ] Timeouts/reconnect policy and auto-reconnect cookie where supported.
- [~] IN PROGRESS — Opt-in single-primary DisplayControl at 100% scale satisfies ADR-011 and works through native/private IPC, public control leases and actual XRDP browser H.264/JPEG resize/restoration. Windows-server, DVC resource audit and soak acceptance remain open. [Evidence](docs/ITERATION_019.md).
- OUT OF CURRENT SCOPE — Multimonitor policy: explicitly excluded by the user, ADR-011; not an unimplemented release requirement.
- [ ] Quality profiles mapped to FreeRDP performance flags.
- OUT OF CURRENT SCOPE — Additional RDP smart sizing/scales/orientation profiles: existing orientation 0 and scale 100% are sufficient under ADR-011. Browser CSS sizing/coordinate mapping remains supported independently.
- [ ] RemoteApp/RAIL capability and launch parameters.
- [ ] Custom VC/DVC admin allowlists.
- [ ] Restricted admin/pass-the-hash privileged policy path.
- [ ] Per-session FreeRDP log level/filter with secret redaction.

**Gate:** config schema → FreeRDP settings mapping has unit coverage and at least one integration test per major category.

## Stage 10 — hardening, packaging and performance acceptance

- [x] DONE for Linux foundation runtime smoke — Ordinary GCC CTest 8/8 and
  actual worker suite 12 passed / one Windows skip under UID 1000, read-only
  root, bounded runtime tmpfs, dropped capabilities/default seccomp and Docker
  init. No-init orphan zombie failure is retained; init/reaping is an explicit
  deployment requirement. This is separate from the production service image,
  linked Linux RDP/devices and resource/soak acceptance. [Evidence](docs/ITERATION_185.md).
- [x] DONE — Linux amd64 non-root multi-stage API/native artifact runtime.
  UID1000, production JS/dependency closure, private worker, actual HTTP/build /
  auth refusal and synthetic host/native lifecycle pass with primary IPC.
  Upstream source/fresh-checkout/distro builds and CI execution remain separate
  open gates. [Deployment](docs/CONTAINER_RUNTIME.md), [evidence](docs/ITERATION_211.md).
- [x] DONE — Read-only-root/init/cap-drop/no-new-privileges deployment example
  with bounded private runtime tmpfs passes the actual service fixture. Additional
  device mappings and broader load/resource acceptance remain open. [Evidence](docs/ITERATION_211.md).
- [ ] Optional USB/DRI/serial/PCSC device mappings documented.
- [ ] seccomp/AppArmor recommendation and tested baseline profile if feasible.
- [ ] Resource watchdogs and cleanup on abnormal exit.
- [ ] 5–10% packet-loss/latency backpressure test.
- [ ] 30+ concurrent idle session soak (environment permitting).
- [ ] 4+ simultaneous active media session soak.
- [ ] Secret scanning/log snapshot tests.
- [~] IN PROGRESS — Linux application/native artifact SPDX 2.3 collection is
  generated and root-schema validated: actual Node graph, native versions/source,
  13 original vcpkg documents, 101 runtime files and exact artifact hashes.
  Five portable privacy/boundary/reference cases and full platform Node checks
  pass. Host export is pending a review-service usage limit. Base OS/Node.js,
  Windows CRT/native inventory and precise native dependency edges remain open.
  [Contract](docs/SBOM.md), [evidence](docs/ITERATION_214.md).
- [ ] Performance report against `PERFORMANCE.md` metrics.
- [ ] Full Windows + XRDP regression.

**Gate:** release candidate v1.0.0.

## Stage 11 — optional extended redirection

- [ ] RDPECAM bridge-host capability.
- [ ] Browser-virtual camera adapter.
- [ ] RDPEWA/WebAuthn bridge-host capability.
- [ ] Design companion-agent protocol and separate threat model.
- [ ] Companion USB redirection.
- [ ] Companion smartcard redirection.
- [ ] Companion serial redirection.
- [ ] Evaluate WebRTC media transport behind `IMediaTransport` using measured lossy-network benefit.
- [ ] Evaluate shared-memory media ring only after profiling proves need.

**Gate:** each feature remains capability-gated until E2E test passes.

## Cross-cutting checklist — apply at every stage

The iteration records below retain resource/lifetime audit history. Their scoped
fixtures are verified, but the cumulative remote/platform/resource acceptance
remains open; they are not additional independent release stages.

- [~] IN PROGRESS — Exact AUDIN name now selects 64 KiB message/codec output /
  128 KiB encoded admission before native host assembly/decompression, preserving
  guarded negotiation/capture ownership. Four public cases / 30 assertions and
  two actual linked AUDIN/fake-DVC cases / 61 assertions pass; linked DVC 147 /
  7,909 and bundled CTest 21/21 pass. Actual microphone/core/pool/RSS/CPU/platform/
  fuzz/soak gates remain open. [Iteration 169](docs/ITERATION_169.md).

- [~] IN PROGRESS — Exact audio DVC name now selects 64 KiB message/output /
  128 KiB encoded admission before host assembly/decompression and complete
  RDPSND validation before pool copying. Eight public/actual-linked-fake-SVC
  cases / 120 assertions, linked DVC 143 cases / 7,879 assertions and bundled
  CTest 21/21 pass. Pool/RSS/core/remote/platform/fuzz/soak remain open.
  [Iteration 168](docs/ITERATION_168.md).

- [~] IN PROGRESS — Production static RDPSND receive placement now checks
  complete bounded records before SDK pool/assembly/parser, including audio-off
  fake fallback. Eight public/actual-linked-fake-SVC cases / 189 assertions,
  linked DVC 135 cases / 7,759 assertions and bundled CTest 21/21 pass. Dynamic
  audio, core/pool/RSS/remote/platform/fuzz/soak gates remain open.
  [Iteration 167](docs/ITERATION_167.md).

- [~] IN PROGRESS — Isolated complete RDPSND owner composes fixed 64 KiB /
  4,096-fragment assembly and bounded PDU validation with one nonrenewing deadline
  over fragments and legacy WaveInfo/Wave. Nine portable cases / 8,358 assertions,
  foundation CTest 9/9 and bundled 21/21 pass. Automatic audio-off fake fallback
  placement, core/pool/remote/platform/fuzz/soak gates remain open; no worker
  callback is installed by this block. [Iteration 166](docs/ITERATION_166.md).

- [~] IN PROGRESS — Production Graphics completion now owns bounded decoded
  batch inspection before original metadata parsing, preserves pending-close
  borrows and consumes zero-output messages before the pinned null-buffer
  assertion. Public binding and actual rdpgfx/drdynvc/fake-SVC counter/lifetime
  cases pass. Large literal CPU, total RSS, multiple-channel/remote/platform /
  allocator/fuzzer/soak remain open. [Iteration 165](docs/ITERATION_165.md).

- [~] IN PROGRESS — Isolated owner now decodes bounded ZGFX through public APIs,
  inspects each PDU before target metadata parsing and forwards only inspected
  literal segments with independent dictionary/borrow/retirement ownership.
  Nine native cases and actual SDK AVC/large-literal cost measurements pass;
  production placement, large-batch CPU, codec/RSS/remote/platform/soak remain
  open. [Iteration 164](docs/ITERATION_164.md).

- [~] IN PROGRESS — Scoped DVC selection now distinguishes bare dynamic plugin
  requests from subsystem/type backend ABIs sharing the DYNAMIC flag. This fixes
  actual XRDP `rdpsnd,sys:fake` Open refusal with browser audio off, preserving
  previous backend policy and strict DVC admission. Six provider cases and
  restored H.264 resize/reattachment pass; fake-backend resource, actual audio,
  remote GFX/platform/soak gates remain open. [Iteration 163](docs/ITERATION_163.md).

- [~] IN PROGRESS — Portable decoded GFX batch inspection bounds each PDU before
  array/bitmap count checks, refusing cross-PDU borrowing and excessive AVC420
  metadata. Five portable and one public ZGFX-output cases pass; production
  decoded-message ownership/placement before metadata allocation remains open,
  together with codec/RSS/remote/platform/fuzzer/soak gates.
  [Iteration 162](docs/ITERATION_162.md).

- [~] IN PROGRESS — Allocation-free complete Annex-B SPS/subset-SPS inspection
  now bounds coded dimensions to the public GFX surface before AVC420 decoder
  creation/dispatch. Profiles/scaling/POC/escape/UE and byte/NAL boundaries plus
  actual private SDK prediction/refusal/recovery fixtures cover the new path.
  Total reference/working memory, aggregate surfaces/RSS, remote GFX, platforms,
  sanitizer/fuzzer and soak gates remain open. [Iteration 161](docs/ITERATION_161.md).

- [~] IN PROGRESS — Exact public graphics DVC name selects nested ZGFX inspection
  before the codec callback; malformed/excessive output/count claims are refused
  without decode, with complete-message reservation release and owned close.
  Six public/codec, one required identity-API and two actual rdpgfx/drdynvc/fake-SVC
  cases pass, including 12 MiB codec output and valid CapsConfirm. Dictionary/
  metadata/codec working memory, pool/total RSS and actual remote/platform/soak
  gates remain open. [Iteration 160](docs/ITERATION_160.md).

- [~] IN PROGRESS — Production synchronous scoped DVC provider now selects the
  bounded public entry/plugin/shared-manager/listener/channel ownership chain.
  Worker reserves up to 32 known logical declarations / 64 MiB before host
  allocation, polls own faults/deadlines and retires callbacks before SDK plugin
  teardown. Five provider fixtures and one actual drdynvc/fake-SVC fixture pass;
  total RSS/pool/nested codec, remote/Windows-server and platform/soak gates remain
  open. [Iteration 159](docs/ITERATION_159.md).

- [~] IN PROGRESS — Bounded public DVC entry-point registry captures one pinned
  plugin per entry, publishes stable proxy/name storage after entry success,
  projects GetPlugin back to original objects and shares one bounded manager.
  Failed publication retains an inert late-callback proxy. Seven public/generic
  fixtures and one actual drdynvc/fake-SVC fixture pass; scoped provider/worker,
  allocator-fault and remote aggregate/cached/nested resource gates remain open.
  [Iteration 158](docs/ITERATION_158.md).

- [~] IN PROGRESS — Public DVC plugin lifecycle proxy resolves a shared manager,
  preserves original delegate identity and cleanup notifications, and terminates
  a self-deleting/throwing plugin once without uncertain retry. Six public cases
  and one actual drdynvc/fake-SVC case pass. Production registration/provider,
  shared manager/worker lifetime and remote resource acceptance remain open.
  [Iteration 157](docs/ITERATION_157.md).

- [~] IN PROGRESS — Bounded public DVC listener manager installs accepted callback
  proxies, rejects live duplicate names and slot overflow, defers destruction
  during factory calls and retains uncertain native handles until explicit final
  host unpublication. Actual pinned generic acceptance default is preserved.
  Six public fixtures and one actual drdynvc/fake-SVC fixture pass; production
  addin/plugin/worker and aggregate/cached/nested/remote resource gates remain open.
  [Iteration 156](docs/ITERATION_156.md).

- [~] IN PROGRESS — Public listener factory proxy transfers only explicitly
  accepted live callbacks, preserves ordinary factory refusal, prevents late
  publication on close and keeps uncertain cleanup visible. Seven public-ABI and
  two actual drdynvc/fake-SVC cases pass; production provider/host lifetime,
  aggregate/cached/nested/remote resource acceptance remain open.
  [Iteration 155](docs/ITERATION_155.md).

- [~] IN PROGRESS — Accepted DVC callback handoff closes rejected new targets once,
  preserves separate uncertain cleanup status and refuses shared live callback
  aliases without closing the existing owner. Five fixtures and two actual
  drdynvc/fake-SVC cases pass; production listener/provider handoff and aggregate/
  cached/nested/remote resource acceptance remain open. [Iteration 154](docs/ITERATION_154.md).

- [~] IN PROGRESS — Pinned public manager facade normalizes failed CreateListener
  output to stable fallback without touching a potentially freed native pointer;
  actual generic addin and successful drdynvc/fake-SVC fixtures pass. Production
  provider placement, partial/failed handoff and actual allocator-failure resource
  acceptance remain open. [Iteration 153](docs/ITERATION_153.md).

- [~] IN PROGRESS — Fixed public DVC ID/callback registry reserves DATA_FIRST only
  for registered live channels, retains rejected-target caller ownership and joins
  callback retirement. Seven public-ABI and five actual drdynvc/fake-SVC cases
  pass; production addin/listener handoff, aggregate admission and pool/nested
  memory/resource acceptance remain open. [Iteration 152](docs/ITERATION_152.md).

- [~] IN PROGRESS — Public DVC completion/close proxy preserves callback borrow,
  defers nested close, joins retirement and releases DATA_FIRST reservations only
  after actual callback return or host close. Eight public-ABI and five actual
  drdynvc/fake-SVC cases pass. Production registration, cumulative admission and
  pool/nested memory acceptance remain open. [Iteration 151](docs/ITERATION_151.md).

- [~] IN PROGRESS — Allocation-free cumulative DATA_FIRST reservation foundation
  has fixed 32 slots / 64 MiB aggregate / 16 MiB individual hard caps, original
  deadlines and observed release. Five portable cases and two public WinPR pool
  fixtures pass. Not active in worker: public completion/close wiring, host
  retirement, channel and retained-pool/nested memory limits remain open.
  [Iteration 150](docs/ITERATION_150.md).

- [~] IN PROGRESS — Worker public receive admission now bounds individual outer
  SVC, DATA_FIRST and compressed-DVC claims before pinned host dispatch. Six
  actual-linked drdynvc/fake-SVC cases include compressed decoding, 12 MiB input,
  two logical channels and partial shutdown; RDP-thread polling and callback
  restoration are implemented. Cumulative/pool/nested resource and actual
  hostile/lost-transport acceptance remain open. [Iteration 149](docs/ITERATION_149.md).

- [~] IN PROGRESS — Public ReceiveChannelData adapter normalizes only complete
  inspected drdynvc input, preserves other SVC arguments and validates raw flags,
  notifications, channel-ID lifetime and callback retirement. Seven linked public
  ABI fixture cases pass; actual host/worker activation and remote resource
  acceptance remain open. [Iteration 148](docs/ITERATION_148.md).

- [~] IN PROGRESS — One bounded outer drdynvc SVC message owner now validates
  total before staging allocation and inner claims before synchronous forwarding.
  Whole packets borrow without a copy; exact abandonment/framing/clock/reentrant
  cleanup checks pass portable and linked-codec regression. No production receive
  callback is installed yet; actual host placement, raw flags, cumulative/channel
  budgets, nested GFX/control/codec and hostile/lost-transport/platform/fuzz/soak
  gates remain open. [Evidence](docs/ITERATION_147.md). Headers: `6744bff`.
- [~] IN PROGRESS — Allocation-free DVC DATA_FIRST/ZGFX declared-size/count
  inspection and linked public-codec/large-payload fixtures are implemented.
  Limits are independent of touch size and include SDK output padding. This
  foundation is not installed before the actual host yet; outer/cumulative
  admission, public callback/lifetime placement, nested GFX/control/codec
  allocations, concurrent budgets, actual hostile/lost transport, platforms and
  sanitizer/fuzz/soak acceptance remain open. [Evidence](docs/ITERATION_146.md).
- [ ] No new secret in logs/argv/env.
- [ ] No unbounded queue introduced.
- [ ] Public protocol change is versioned/documented.
- [ ] Native parser change has boundary tests/fuzz coverage where relevant.
- [ ] Actual drdynvc host preallocation/decompression limits and lost-transport terminal release acceptance. The source audit identifies allocations before the public RDPEI gate and a NOT_CONNECTED-to-OK write path; current bridge bounds do not establish upstream bounds or remote release. [Audit and required follow-up](docs/RDPEI_UPSTREAM_AUDIT.md).
- [ ] FreeRDP return values checked.
- [ ] Unsupported feature is explicit capability state, not a crash.
- [ ] Documentation and schema match actual code.
- [ ] Focused commits made during implementation, not one giant final commit.

## Additional foundation tasks and retained requirements

- [x] DONE — Initial typed SessionCreate schema, unknown-field/range checks, safe privilege policy and recursive secret redaction. [Config tests](tests/unit/config.test.mjs); `3610524`. Traces to SPECIFICATION §2.1/3.2, CONFIG_SCHEMA, SECURITY §3/5. This is contract validation, not RDP feature support.
- [~] IN PROGRESS — Separate bounded config/secret IPC classes now deliver credentials after HELLO; transport copies and the active FreeRDP password setting are overwritten. Upstream/immutable JS copies and future secret classes remain open. [Contract](docs/CONNECTION_CORE.md).
- [x] DONE on Windows (component) — Atomic native private-directory creation:
  protected current-user/LocalSystem inheritable ACLs, bounded metadata and
  unchanged existing objects. Five actual filesystem cases / 91 assertions.
  [Iteration 170](docs/ITERATION_170.md); `8aaa379`.
- [x] DONE on Windows (component) — Colocated helper packaging/discovery:
  three actual process cases and explicit relocated execution with minimal PATH.
  [Iteration 171](docs/ITERATION_171.md); `5c75f26`.
- [~] IN PROGRESS — Windows runtime ACL/multi-user isolation acceptance:
  Node now selects the helper before marker/worker spawn and joins normal startup
  cancellation/confirmed cleanup. Trusted root/parent validation, uncertain
  bootstrap outcome reclamation, other filesystems and actual second-account/
  service isolation remain open. Traces to ARCHITECTURE §2 and SECURITY §2/6.
  [Startup contract](docs/WINDOWS_DIRECTORY_STARTUP.md),
  [iteration 172](docs/ITERATION_172.md); `2e30d14`.
- [ ] TODO — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. Normal close, worker-only crash and parent-only death are verified; simultaneous hard kill is not. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup.
- [~] IN PROGRESS — Registry now retains capacity through native forced-termination completion with a separate bounded deadline; filesystem/HELLO cancellation guards prevent late spawn/readiness. Pure completion/fault tests, compiled fake-worker/native-adapter join and actual linked unsupported-config cleanup pass. Forced-deadline expiry, legacy void backends, OS/filesystem failures and orphan acceptance remain open. [Evidence](docs/ITERATION_056.md). Observed race: [iteration 55](docs/ITERATION_055.md), `46245b2`.
- [~] IN PROGRESS — Package worker + exact FreeRDP/WinPR/runtime dependencies for Windows x64 and Linux x64 without requiring a system FreeRDP install. Windows native ZIP and relocation are verified; [manual bundled CI](.github/workflows/bundled-native.yml) is prepared, not run. Linux, Node.js distribution, MSI/EXE/DEB/RPM installer integration and clean-machine tests remain open.
