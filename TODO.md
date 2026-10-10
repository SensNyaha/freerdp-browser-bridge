# TODO — implementation plan

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

Scope decision — 2026-10-09: **one primary monitor at 100% desktop/device scale
is sufficient**, using the existing orientation 0. Multimonitor and other RDP
scale/layout profiles are excluded from current required work by explicit user
instruction; they are not unfinished acceptance gates. [Accepted ADR-011](docs/adr/ADR-011-single-display-100-percent.md).
All other requirements, including confirmed resize, input, audio, devices,
platforms, resource limits and soak verification, remain.

## Implementation status — 2026-10-10

Lifecycle and the Stage 2 fake-backend gate are verified on **Windows x64**.
The experimental Stage 3 core has connected to the authorized XRDP lab. Stage 4
now renders real 1080p XRDP through H.264/WebCodecs and the JPEG fallback in Edge.
Stages 0/1/3/4/5 remain **IN PROGRESS**. Physical input and release ownership are
implemented and tested with native/fake/Edge fixtures; actual XRDP input is verified
for motion only. Independent cursor extraction/overlay and XRDP shape replay are
verified; broader cursor gates, Unicode/IME, audio, platforms and devices remain open.

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). Current bundled `pnpm check`: 139/139 Node tests;
  CTest/Catch2: 25 IPC/input/state cases / 478 assertions, 2 AVC cases / 19 assertions,
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
- **DONE on Windows:** exact FreeRDP/WinPR 3.32.1, local ZLIB 1.3.2, OpenSSL 3.6.5 and libusb
  1.0.30 build and link. Private native ZIP contains runtime DLLs, release CRT, licenses and
  dependency metadata. Relocation test checks actual loaded ZLIB/FreeRDP paths and static
  channel inventory without dependency PATH. JPEG now also ships privately and is encoded/decoded
  in the relocated runtime probe. OpenH264 encoding, AVCC and FreeRDP AVC420 decoding are verified natively.
  Current native ZIP is approximately 5.6 MiB, 14.2 MiB installed, excluding Node.js and future
  audio/hardware providers. [Iteration 5](docs/ITERATION_005.md), [iteration 6](docs/ITERATION_006.md).
  Implementation commits: `7757d44`, `b1c779d`; local lab helper: `55e22cc`.
- **BLOCKED acceptance:** no Linux runtime/Clang compiler or Windows RDP lab is available
  in this session. The XRDP lab has passed strict certificate rejection and explicitly
  user-approved session-only trust, activation, heartbeat and cleanup checks.
  [Iteration 4](docs/ITERATION_004.md). Linux SOCK_SEQPACKET remains unimplemented. Linux CI, ASan/UBSan and libFuzzer
  jobs are prepared but have not run; they are not counted as passing integration gates.

Wire details: [IPC foundation](docs/IPC_FOUNDATION.md). Audit and iteration report:
[contract audit](docs/CONTRACT_AUDIT.md), [iteration 1](docs/ITERATION_001.md), [iteration 2](docs/ITERATION_002.md).

## Stage 0 — repository and reproducible build

- [x] DONE — Create pnpm monorepo layout from `STACK.md` (core packages/apps/native; future component directories are created with their implementations). `9517003`.
- [x] DONE — Add TypeScript strict config, lint/format, CI skeleton. `pnpm check`; `9517003`.
- [x] DONE — Add CMake/Ninja native workspace. MSVC x64 build + CTest; `9517003`, `1672590`.
- [x] DONE on Windows — Pin FreeRDP **3.32.1** source/build and record commit/checksum. Source commit verified as `bf217a504e54cc719880c228e82353382cd7d4fa`; libraries built locally, linked CLI reports 3.32.1, archive SHA-256 generated. [Lock metadata](native/dependencies.json), [verification](docs/ITERATION_002.md). Linux build/fresh-checkout gate remains open.
- [~] IN PROGRESS — Enable required client channels; emit build feature report. Windows cache inventory matches actual static addins in the relocated bundle; CLI and REST expose it. Upstream 3.32.1 has no Windows serial/parallel clients; these are OFF explicitly. Linux inventory and all runtime device gates remain pending.
- [x] DONE — Add `rdp-worker --version --capabilities`. Native CLI and handshake reports agree; absent library reported as null, RDP false. [Integration test](tests/integration/worker.test.mjs); `1672590`, `316cdc0`.
- [x] DONE — Add Node `/v1/build` backed by real worker/build information. Fastify injection + native handshake/CLI comparison; `316cdc0`.
- [~] IN PROGRESS — Add debug ASan/UBSan native CI job. [Workflow](.github/workflows/ci.yml) is configured; execution and sanitizer acceptance pending Linux CI.

**Gate:** clean build from fresh checkout/container; exact FreeRDP version visible; no UI required.

## Stage 1 — native worker process and IPC

- [x] DONE — Implement worker process entrypoint with no RDP connection yet. Real C++ executable, not a fake RDP client; `1672590`.
- [x] DONE — Implement versioned `RWI1` IPC envelope. [Native](native/ipc/tests.cpp) and [Node](tests/unit/protocol.test.mjs) boundary/golden/fragmentation tests; `1672590`.
- [~] IN PROGRESS — Linux `SOCK_SEQPACKET` transport + framed-stream abstraction/fallback. Framed inherited pipes verified on Windows; primary Linux transport remains TODO and needs Linux integration.
- [x] DONE — HELLO/HELLO_ACK capability negotiation. Real worker capability/CLI checks; incompatible version/required-feature native tests; `1672590`, `316cdc0`.
- [x] DONE — Heartbeat and graceful shutdown. Real-worker and adversarial fake-worker deadline/watchdog tests; `316cdc0`.
- [x] DONE — Length limits and parser unit tests. Header checked before body allocation; malformed/truncated inputs fail without input disclosure. `1672590`.
- [~] IN PROGRESS — libFuzzer target for IPC envelope. [Target](native/ipc/fuzz.cpp) and seeded CI job exist; compile/run blocked locally by absent Clang compiler, not counted as fuzz verification.
- [~] IN PROGRESS — Parent-death handling and private runtime directory cleanup. Windows EOF/cleanup test passes, including independent hidden worker process; Linux PDEATHSIG code awaits Linux verification. Explicit Windows private ACL policy remains TODO.

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

## Stage 4 — graphics, cursor and browser video

- [x] DONE on Windows/XRDP — Initialize headless FreeRDP GDI/framebuffer. Native JPEG roundtrip and real 1080p browser rendering verified; [evidence](docs/ITERATION_005.md).
- [~] IN PROGRESS — Classic BeginPaint/EndPaint/DesktopResize and synchronous public GFX binding wired. Native GFX frame-end/inter-frame pixels, AVC420 IDR/predictive decode, reset, bounded surface/cache/command guards and teardown fixtures pass; actual XRDP browser regression passes. Actual negotiated GFX, AVC444/other compressed codecs, true scaled-output mapping, decoder resource limits and dynamic server resize remain open. [Contract](docs/GFX.md), [binding evidence](docs/ITERATION_014.md), [AVC420 evidence](docs/ITERATION_015.md).
- [~] IN PROGRESS — Native Display Control binds negotiated caps and one bounded layout; private IPC/Node and public control leases expose opt-in, typed results, server-observed generations and deadlines. Actual XRDP browser resize/restoration, display replay, fresh AVC IDRs/JPEG configs, nonfatal input pause and transmitted media ACK preservation pass. The single-primary layout at 100% scale satisfies ADR-011; Windows-server, DVC resource audit and soak acceptance remain open. Automatic viewport policy is optional follow-up; wider layouts are outside current scope. [Contract](docs/DISPLAY_CONTROL.md), [native evidence](docs/ITERATION_017.md), [IPC/XRDP evidence](docs/ITERATION_018.md), [public/browser evidence](docs/ITERATION_019.md).
- [~] IN PROGRESS — Rectangle accumulation uses a fixed 64-region set, conservative union/collapse, clipped revision changes and snapshot consumption after successful encode/send. Native coverage and public GDI/GFX callback tests pass; actual XRDP regression is recorded in [iteration 13](docs/ITERATION_013.md) and [iteration 14](docs/ITERATION_014.md). Partial-region encoding and actual negotiated GFX tracking remain pending; AVC/JPEG continue encoding full frames per ARCHITECTURE §4. [Contract](docs/DIRTY_REGIONS.md).
- [x] DONE on Windows/XRDP — Public pointer callbacks extract bounded RGBA shape, hotspot, position and visibility; native conversion/state/parser tests and actual XRDP shape delivery/replay pass. [Contract](docs/CURSOR.md), [evidence](docs/ITERATION_012.md). Exact mono inversion and broader server/platform cases remain retained gaps.
- [~] IN PROGRESS — JPEG/AVC latest-state scheduling shares one pending capture with render credit. Configurable FPS caps and quality/bitrate profiles reach native encoders; effective ceilings remain 20 JPEG / 30 AVC FPS. Native/fake and actual XRDP cap checks pass. Provider selection and adaptive congestion remain pending. [Contract](docs/VIDEO_QUALITY.md), [evidence](docs/ITERATION_016.md).
- [x] DONE on Windows — H.264 encoder interface and private OpenH264 software provider; real encode/decode, forced IDR, GOP and resize tests pass. [Contract](docs/MEDIA_H264.md), [evidence](docs/ITERATION_006.md). Linux/hardware selection pending.
- [x] DONE on Windows/XRDP — AVCC config/access-unit packetization, IPC/RWB1 bounds and actual browser decode verified; [evidence](docs/ITERATION_007.md).
- [x] DONE on Windows/XRDP — Encoded JPEG/AVC worker→Node RWI1 and browser RWB1 forwarding, without raw frames in JS.
- [x] DONE in Edge/Windows — Reference harness checks WebCodecs support, renders actual 1080p AVC/JPEG and closes VideoFrames/ImageBitmaps. Other browsers/platforms remain unverified.
- [x] DONE in Edge/Windows — Independent binary shape stream and transparent overlay; local movement, CSS-scaled hotspot, hide/default and disposal tested. Actual XRDP shape and browser reattachment replay pass. [Evidence](docs/ITERATION_012.md). Full desktop soak remains open.
- [x] DONE on Windows/XRDP — Native JPEG fallback and browser canvas path, private libjpeg-turbo, bounded allocation and relocation verified. [Contract](docs/MEDIA_JPEG.md).
- [~] IN PROGRESS — Single-frame credit, ACK deadline, stale lease/ACK/reset rejection, static/latest revision and dimension config verified. Actual WebCodecs decoder-error recovery forces config/IDR; adaptive bitrate/drop policy remains pending.
- [~] IN PROGRESS — Bounded native encode/read counters, browser decode/draw timings and a deterministic 1080p encoder benchmark implemented. Protected Node capture/write/render-credit histograms, queued frame/byte counters and credit occupancy now distinguish consumer stalls from capture time. Full dirty-to-send/queue-delay and performance gates remain open. [Encoder evidence](docs/ITERATION_009.md); `06233ce`, build tracking `be42b9d`. [Node timing evidence](docs/ITERATION_011.md).

**Gate:** stable 1080p interactive Windows/XRDP desktop for 30 min, resize safe, cursor smooth, no unbounded queue growth.

## Stage 5 — keyboard, mouse, wheel and touch

Manual local Edge viewing: `test-xrdp-viewer.mjs ... h264 --manual`.
[Launch commands](docs/DEVELOPMENT.md#manual-windowsxrdp-viewer).

- [~] IN PROGRESS — Physical set-1 mapping and extended left/right/numpad events implemented; native/Node/Edge fixture tests pass. Remote keyboard-layout gate pending. [Contract](docs/INPUT.md), [evidence](docs/ITERATION_008.md).
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

- [ ] Implement custom `rdpsnd-browser` virtual sink.
- [ ] PCM normalization/resampling layer.
- [ ] PCM media transport + AudioWorklet playback.
- [ ] Opus encoder + browser decode path.
- [ ] Audio queue/jitter/backpressure metrics.
- [ ] Implement custom `audin-browser` source.
- [ ] Browser microphone capture and packet transport.
- [ ] Underflow/silence behavior that does not block RDP loop.
- [ ] Audio reconnect/discontinuity reset.

**Gate:** remote audio audible and microphone usable with bounded <150 ms queue target in LAN test.

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

- [ ] Non-root multi-stage Docker image.
- [ ] Read-only root filesystem deployment example.
- [ ] Optional USB/DRI/serial/PCSC device mappings documented.
- [ ] seccomp/AppArmor recommendation and tested baseline profile if feasible.
- [ ] Resource watchdogs and cleanup on abnormal exit.
- [ ] 5–10% packet-loss/latency backpressure test.
- [ ] 30+ concurrent idle session soak (environment permitting).
- [ ] 4+ simultaneous active media session soak.
- [ ] Secret scanning/log snapshot tests.
- [ ] Dependency/SBOM generation.
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

- [ ] No new secret in logs/argv/env.
- [ ] No unbounded queue introduced.
- [ ] Public protocol change is versioned/documented.
- [ ] Native parser change has boundary tests/fuzz coverage where relevant.
- [ ] FreeRDP return values checked.
- [ ] Unsupported feature is explicit capability state, not a crash.
- [ ] Documentation and schema match actual code.
- [ ] Focused commits made during implementation, not one giant final commit.

## Additional foundation tasks and retained requirements

- [x] DONE — Initial typed SessionCreate schema, unknown-field/range checks, safe privilege policy and recursive secret redaction. [Config tests](tests/unit/config.test.mjs); `3610524`. Traces to SPECIFICATION §2.1/3.2, CONFIG_SCHEMA, SECURITY §3/5. This is contract validation, not RDP feature support.
- [~] IN PROGRESS — Separate bounded config/secret IPC classes now deliver credentials after HELLO; transport copies and the active FreeRDP password setting are overwritten. Upstream/immutable JS copies and future secret classes remain open. [Contract](docs/CONNECTION_CORE.md).
- [ ] TODO — Explicit restricted Windows runtime ACLs and multi-user isolation acceptance. Traces to ARCHITECTURE §2 and SECURITY §2/6.
- [ ] TODO — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. Normal close, worker-only crash and parent-only death are verified; simultaneous hard kill is not. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup.
- [~] IN PROGRESS — Package worker + exact FreeRDP/WinPR/runtime dependencies for Windows x64 and Linux x64 without requiring a system FreeRDP install. Windows native ZIP and relocation are verified; [manual bundled CI](.github/workflows/bundled-native.yml) is prepared, not run. Linux, Node.js distribution, MSI/EXE/DEB/RPM installer integration and clean-machine tests remain open.
