# TODO — implementation plan

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

Scope decision — 2026-10-09: **one primary monitor at 100% desktop/device scale
is sufficient**, using the existing orientation 0. Multimonitor and other RDP
scale/layout profiles are excluded from current required work by explicit user
instruction; they are not unfinished acceptance gates. [Accepted ADR-011](docs/adr/ADR-011-single-display-100-percent.md).
All other requirements, including confirmed resize, input, audio, devices,
platforms, resource limits and soak verification, remain.

## Implementation status — 2026-10-11

Lifecycle and the Stage 2 fake-backend gate are verified on **Windows x64**.
The experimental Stage 3 core has connected to the authorized XRDP lab. Stage 4
now renders real 1080p XRDP through H.264/WebCodecs and the JPEG fallback in Edge.
Stages 0/1/3/4/5/6 remain **IN PROGRESS**. Physical input and release ownership are
implemented and tested with native/fake/Edge fixtures; actual XRDP input is verified
for motion only. Independent cursor extraction/overlay and XRDP shape replay are
verified; broader cursor gates, Unicode/IME, audio, platforms and devices remain open.
Stage 6 has guarded static RDPSND PCM/Opus worker activation, public media
negotiation and gesture/decoder/Worklet admission ownership on Windows. Actual
linked channel data tests use simulated SVC transport; browser PCM fixtures use
synthetic samples and Opus fixtures use the pinned SDK. Actual XRDP viewers pass
with idle/waiting audio. Audible RDP, ready-source reset, microphone and
latency/resource/platform acceptance remain open.

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). Current bundled `pnpm check`: 276/276 Node tests;
  CTest/Catch2: 72 IPC/input/state/audio-codec/output/capture cases / 61,347 assertions, 2 AVC cases / 19 assertions,
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

- [~] IN PROGRESS — Typed PCM backend events now pass scalar manager validation
  to one current media lease subscriber; detached samples are discarded, metadata
  is copied, and cleanup/stale unsubscribe/consumer faults preserve ownership.
  Fake backend SDK fixtures pass; no public audio negotiation/WS route or audible
  acceptance is added. [Evidence](docs/ITERATION_067.md).

- [~] IN PROGRESS — Windows guarded static PCM selection is opt-in through private
  settings v5/HELLO and typed Node source/config/sample events. LoadChannels runs
  after actual core channel replacement; pre-GDI TLS rejection/cancellation and
  bounded retirement/cleanup pass. Actual idle XRDP connects, reports waiting,
  captures a desktop and closes, with no audio packets observed. Public media,
  audible/browser and transport/latency/resource gates remain open. [Evidence](docs/ITERATION_066.md).

- [~] IN PROGRESS — Guarded static browser/PCM sink is selected by opt-in Windows worker/public settings, with bounded production ingress and serialized teardown. Actual native TLS cleanup and synthetic linked channel fixtures pass. Actual remote samples/negotiation and audible output remain open. [Private activation](docs/ITERATION_066.md), [public viewer](docs/ITERATION_071.md).
- [~] IN PROGRESS — Public pinned RDPSND device callback adapter feeds the bounded PCM pipeline, applies stereo volume, resets on loss and retires owner resources before delayed host Free. Native ABI/lifecycle fixtures pass; worker registration, upstream resource audit and actual server/browser audio remain open. [Contract](docs/AUDIO_PCM.md#public-rdpsnd-device-adapter), [evidence](docs/ITERATION_038.md).
- [~] IN PROGRESS — Scoped public rdpsnd/browser loader binds one synchronous context and preserves other addins. Actual pinned static RDPSND with fake SVC registers the backend, negotiates PCM and dispatches Wave2 into the sink. Upstream reassembly/DSP limits and Close/timestamp gaps are recorded; worker activation and actual remote/browser audio remain open. [Evidence](docs/ITERATION_039.md), [audit](docs/AUDIO_PCM.md#scoped-rdpsnd-backend-loading).
- [~] IN PROGRESS — Fixed 64 KiB SVC assembly and bounded RDPSND PDU validation run ahead of the actual static channel in fake-SVC fixtures, including legacy Wave. Oversized advertised record/count claims are refused before upstream dispatch. Production callback placement, earlier core/DSP limits, raw flags and stream-clock/reset remain open. [Evidence](docs/ITERATION_040.md).
- [~] IN PROGRESS — Public static SVC callback adapter now places ingress limits ahead of actual RDPSND, handles raw flags and Close/reset, bounds outgoing confirmations and retires before delayed host Terminated. Actual linked channel/fake-SVC fixtures pass. Top-level provider/worker selection, real transport lifetime/close faults, earlier core/DSP limits and timestamp gaps remain open. [Evidence](docs/ITERATION_041.md).
- [~] IN PROGRESS — Scoped general addin loader now selects the guarded static browser/PCM path with fixed internal arguments and refuses unprotected dynamic/legacy paths. Actual linked channel/fake-SVC tests cover full loader dispatch and completion-bound provider lifetime. Supported PCM offer policy, worker selection, clocks, close faults, earlier core limits and actual audio acceptance remain open. [Evidence](docs/ITERATION_042.md).
- [~] IN PROGRESS — Guarded static negotiation now filters offers to consistent supported PCM8/PCM16 mono/stereo 8..48 kHz in fixed storage and checks selected client indices before Wave dispatch. Mixed PCM24/PCM16 and no-common-format behavior pass actual linked channel/fake-SVC tests. Broader formats, worker activation, clocks, close faults, earlier core limits and actual remote/browser audio remain open. [Evidence](docs/ITERATION_043.md).
- [ ] PCM normalization/resampling layer.
- [~] IN PROGRESS — Guarded baseline keeps one negotiated PCM table per connection and explicitly refuses replacements before upstream mutation. Initial-table source switching from 48 kHz stereo PCM16 to 8 kHz mono PCM8/PCM16 passes actual linked channel/fake-SVC conversion/reset checks. Broader renegotiation, bursts, worker/browser and actual audio acceptance remain open. [Evidence](docs/ITERATION_047.md).
- [~] IN PROGRESS — Guarded RDPSND retirement retains failed host handles/status, drains confirmations and retries one close per later owner call before finishing pinned public cleanup. Status/exception/repeated/duplicate/owner recovery fixtures pass with actual linked channel/fake SVC. Real transport shutdown and finite worker deadlines remain open. [Evidence](docs/ITERATION_045.md).
- [~] IN PROGRESS — RDPSND volume now uses a documented perceptual -60..0 dB nonzero scale, exact mute/full identity and independent stereo Q30 gains computed only at volume changes. Exhaustive portable and actual linked channel/fake-SVC checks cover the law; worker/browser audible acceptance remains open. [Evidence](docs/ITERATION_044.md).
- [~] IN PROGRESS — Isolated native PCM8/PCM16 mono/stereo 8..48 kHz normalization to S16LE 48 kHz stereo, rational phase, fixed output capacity and atomic rejection are implemented. Wider/higher-rate formats, pipeline/backend integration and actual audio acceptance remain open. [Contract](docs/AUDIO_PCM.md), [evidence](docs/ITERATION_036.md). Stage 5 hardware/remote gates remain open.
- [ ] PCM media transport + AudioWorklet playback.
- [~] IN PROGRESS — Typed backend/media lease ownership and one-record PCM delivery credit are implemented. Status/config/samples share one exact ACK, scalar metadata and one copied latest 3,840-byte sample packet; stop/reset clears unsent samples and attachment starts discontinuously. Pure/fake-backend fixtures pass. Public WS selection, browser admission ACK, gesture activation and actual audible/latency acceptance remain open. [Lease evidence](docs/ITERATION_067.md), [record credit](docs/ITERATION_068.md).
- [~] IN PROGRESS — Opt-in PCM hello/ready, ordered stream-3 forwarding and independent audio ACK are implemented for typed backends. Real local WebSocket/fake-backend tests verify credit, latest/stop/recovery, bounded ACK/rate deadlines and listener cleanup. Public native selection, browser Worklet admission/gesture integration and actual audible RDP remain open. [Socket evidence](docs/ITERATION_069.md).
- [~] IN PROGRESS — Browser PCM record-credit mode acknowledges status/config/samples only after the corresponding accepted Worklet command. Pure and real Edge synthetic PCM fixtures verify exact deferred ACK, stats independence, Close clearing and context-loss cleanup. Harness gesture/routing, public native selection and actual audible RDP remain open. [Worklet evidence](docs/ITERATION_070.md).
- [~] IN PROGRESS — Reference harness PCM opt-in stages attachment until an explicit user gesture prepares AudioContext/Worklet, then routes ordered stream 3 independently of video decode and sends only admission ACKs. Public NativeSessionWorker selection is activated. Actual Edge/socket/Worklet synthetic fixtures, native strict TLS/cleanup and fake legacy refusal pass. Actual audible RDP and broader gates remain open. [Current viewer evidence](docs/ITERATION_071.md).
- [~] IN PROGRESS — Private pinned libopus 1.6.1 encoder accepts fixed 20 ms stereo PCM,
  exposes queried lookahead and bounded packets, and preserves prediction/output on
  invalid input. Real SDK stereo decode/reset/boundary tests and private DLL relocation
  pass. Worker/publisher/framing, browser decode/priming, Linux/resource and audible
  acceptance remain open; public Opus selection is still explicitly unsupported.
  [Contract](docs/AUDIO_OPUS.md), [evidence](docs/ITERATION_073.md). Encoder: `6cc179b`.
  [Stable Windows build environment evidence](docs/ITERATION_074.md) verifies repeat
  dependency builds without transient caller PATH invalidation; fresh-checkout/Linux
  gates remain open.
- [~] IN PROGRESS — Versioned native/TypeScript Opus payloads and RWI1 kind 36 now
  bound one stereo 20 ms frame before body allocation/copy. Independent vectors,
  exhaustive TOC/boundary/fragmentation and actual encoder compatibility pass;
  current PCM-only output lane refuses Opus without retaining it. No Opus HELLO,
  settings, publisher, public media or browser path is activated; those gates and
  actual audible/platform/resource acceptance remain open. [Payload contract](docs/AUDIO_OPUS_WIRE.md),
  [evidence](docs/ITERATION_075.md). Opus SDK: 6 cases / 990 assertions.
- [~] IN PROGRESS — Fixed Opus source state and bounded RWB1 state/config/packet
  encoders plus an isolated browser parser pass independent vectors and malformed
  profile/TOC/clock/sequence checks. The viewer does not import the parser yet;
  decoder, publisher, negotiation and audible acceptance remain open.
  [Wire evidence](docs/ITERATION_076.md).
- [~] IN PROGRESS — Isolated browser Opus decoder owns one decode/admission credit,
  closes AudioData and retires decoder/Worklet/context on failure. Real Edge decodes
  pinned SDK stereo tones with queried-delay correlation and Worklet ACKs; source,
  malformed-output, late-callback and timeout fixtures pass. The reference viewer
  does not select it yet; publisher/negotiation, audible RDP and broader gates remain
  open. [Browser contract](docs/AUDIO_OPUS_BROWSER.md), [evidence](docs/ITERATION_077.md).
- [~] IN PROGRESS — Isolated Opus publisher reuses PCM capture/epoch/reset ownership
  and one fixed encoded retry cache. Actual SDK/native source fixtures verify
  no re-encoding on blocked retry, latest discontinuous replacement, ordered
  state/config and reset barriers. Worker/queue/public selection and audible
  acceptance remain open. [Publisher contract](docs/AUDIO_OPUS_PUBLISHER.md),
  [evidence](docs/ITERATION_078.md).
- [~] IN PROGRESS — Explicit immutable Opus queue/dispatcher mode shares bounded
  slots and refuses a second pending encoded packet. Portable output and actual
  source/SDK publisher-to-queue tests verify copied ownership, profile refusal,
  clock/reset/priority and fresh prediction recovery. Production mode remains
  PCM; codec selection, public negotiation and audible acceptance remain open.
  [Output contract](docs/AUDIO_OPUS_OUTPUT.md), [evidence](docs/ITERATION_079.md).
- [~] IN PROGRESS — Native AudioSession selects exactly one PCM/Opus publisher
  with shared sink/provider and retirement ownership. Actual linked RDPSND/fake-SVC
  verifies Opus Wave2 publication and cancelled-confirmation Close, plus unknown
  mode refusal/default PCM counters. Worker still selects PCM; IPC/Node/public
  selection and audible acceptance remain open. [Session contract](docs/AUDIO_SESSION_CODECS.md),
  [evidence](docs/ITERATION_080.md).
- [~] IN PROGRESS — Default native output owners permit one PCM/Opus startup
  choice before accepted audio, preserving queued/in-flight control and video.
  Constructor choice and accepted audio permanently lock the mode; refusal,
  full admission and discard do not bypass ownership. Production worker still
  uses PCM; private/public activation and audible acceptance remain open.
  [Evidence](docs/ITERATION_081.md).
- [~] IN PROGRESS — Private connection schema 6 prepares an explicit Opus bit
  with mutually exclusive PCM/Opus and preserved legacy masks. Native/TypeScript
  parsers remain bounded; current worker refuses Opus before secret/connect.
  No HELLO/public activation is advertised. Node selection, browser negotiation
  and audible acceptance remain open. [Evidence](docs/ITERATION_082.md).
- [~] IN PROGRESS — Shared typed Node audio source ownership preserves existing
  PCM behavior and prepares an isolated Opus profile. Scalar-only snapshots,
  codec-specific admission and common readiness/epoch/clock/reset guards are
  verified by source/delivery fixtures. No worker/public Opus activation yet.
  [Contract](docs/AUDIO_SOURCE_OWNERS.md), [evidence](docs/ITERATION_083.md).
- [~] IN PROGRESS — Guarded Windows worker accepts raw schema-6 Opus, selecting
  matching output/session profiles before activation. Actual local TLS/native
  lifecycle verifies strict certificate rejection, codec-1 Close and healthy
  control/shutdown; foundation selection is refused. HELLO/high-level Node/public
  selection and audible acceptance remain open. [Evidence](docs/ITERATION_084.md).
- [~] IN PROGRESS — Experimental private Opus capability, CLI/HELLO/REST and
  typed WorkerProcess selection are wired. Old peer/settings refusal, mixed
  profiles, ordered Close and actual local native TLS retirement pass. Public
  startup remains gated pending compressed delivery/attachment recovery. Current
  XRDP Opus idle-source activation/heartbeat/capture/Close now pass after access
  restoration in Iteration 88; no audio packets were observed and no audible
  acceptance is claimed. [Activation evidence](docs/ITERATION_085.md),
  [restored-lab evidence](docs/ITERATION_088.md).
- [~] IN PROGRESS — Serialized AudioSession reset selects its PCM/Opus publisher,
  clears prepared storage and schedules the existing discard/new-epoch barrier.
  Actual linked source/fake-SVC checks verify blocked-output ownership, waiting /
  fresh-Play order and exact fresh-encoder Opus recovery. Foreign/reentrant /
  retiring/failed reset is refused. IPC/public selector remains open.
  [Evidence](docs/ITERATION_086.md).
- [~] IN PROGRESS — Fixed private audio reset request/result codecs, nonzero epoch /
  correlation, header preallocation limits and existing bounded control FIFO are
  verified natively and in TypeScript. Both worker variants return explicit
  unavailable while heartbeat/shutdown stay healthy. RDP-thread dispatch, private
  Node API and public compressed recovery remain open; no reset capability is
  advertised. [Contract](docs/AUDIO_RESET.md), [evidence](docs/ITERATION_087.md).
- [~] IN PROGRESS — Raw native reset now uses one fixed request slot, published
  ready-epoch checks, a one-second service deadline and RDP-thread AudioSession
  ownership. Pending epoch/lifetime/clock changes and duplicate scheduling are
  refused; shutdown cancels before retirement. Portable and linked RDPSND/fake-SVC
  checks pass for PCM/Opus. Private capability/API and public recovery remain open.
  [Evidence](docs/ITERATION_088.md).
- [~] IN PROGRESS — Guarded private audioReset capability and typed
  WorkerProcess.resetAudio(expectedEpoch) now preserve one pending request,
  correlation and scheduled-epoch suppression. PCM/Opus fake-peer recovery,
  legacy/invalid/reply fault and cleanup fixtures pass. Actual XRDP idle PCM/Opus
  lifecycle passes; waiting-source reset is locally unavailable. Native ready-source
  and public compressed recovery/audible acceptance remain open.
  [Evidence](docs/ITERATION_089.md).
- [~] IN PROGRESS — Isolated Opus sender now owns one bounded packet and shared
  receiver credit, preserves bytes/PTS/flags and requests native new-epoch recovery
  for active-source attachment or skipped prediction. Old ACK survives recovery;
  finite deadline/sequence/source/cleanup fixtures and fake private IPC reset
  handoff pass. Public lease/WebSocket/browser activation and actual recovery /
  audible acceptance remain open. [Contract](docs/AUDIO_OPUS_DELIVERY.md),
  [evidence](docs/ITERATION_090.md).
- [~] IN PROGRESS — Server media lease now reserves one expected-epoch backend
  reset, checks current authority before/after completion and preserves reservation
  across detach. Invalid/exception/deadline faults retire uncertain backend
  ownership; PCM native-adapter/private fake IPC handoff passes. Browser command /
  managed Opus/socket activation and actual recovery/audible acceptance remain open.
  [Contract](docs/AUDIO_RESET_LEASE.md), [evidence](docs/ITERATION_091.md).
- [~] IN PROGRESS — Fixed typed managed PCM/Opus source profiles expose copied
  codec/state/config metadata and refuse mixed packets before source progression.
  Backend/lease contracts carry the explicit union; current managed creation and
  socket remain PCM with public Opus startup gated. Isolated and existing PCM
  fixtures pass; socket/browser activation and actual audio remain open.
  [Contract](docs/SESSION_AUDIO.md), [evidence](docs/ITERATION_092.md).
- [~] IN PROGRESS — Preparatory Opus socket owner connects one native epoch-reset
  promise to compressed prediction recovery, preserving transmitted ACK and
  bounding retry/deadline/late completion. Seven synthetic socket cases and PCM
  regression pass. Public negotiation/harness activation and actual recovery /
  audible acceptance remain open. [Contract](docs/AUDIO_OPUS_SOCKET.md),
  [evidence](docs/ITERATION_093.md).
- [~] IN PROGRESS — Public Opus creation, exact codec-matched media negotiation,
  one-record ACK/native reset recovery, separate fixed metrics and gesture-gated
  reference harness are implemented. Fake private IPC/real WebSocket, actual
  linked strict TLS and Edge pinned-SDK decode/Worklet fixtures pass. Restored
  XRDP H.264/Opus viewer/reattachment passes with waiting/zero audio; audible and
  actual ready-source reset acceptance remain open.
  [Contract](docs/AUDIO_OPUS_PUBLIC.md), [evidence](docs/ITERATION_094.md).
- [~] IN PROGRESS — Protected fixed-cardinality PCM record/byte counters, receiver-credit/in-flight and pending-sample gauges, replacement/reset/retirement counts and forwarding/valid-ACK timing histograms are implemented. Real socket/fake-backend and pure failure fixtures verify exact accounting and zeroed cleanup. Native/browser jitter/underflow export and measured LAN acceptance remain open. [Evidence](docs/ITERATION_072.md).
- [~] IN PROGRESS — Fixed 120 ms native PCM handoff ring, packet-atomic overflow, counted underflow silence, reset discontinuity and saturating lifetime counters are implemented. Worker/transport/browser integration, public metrics and actual LAN latency acceptance remain open. [Evidence](docs/ITERATION_037.md).
- [ ] Implement custom `audin-browser` source.
- [~] IN PROGRESS — Isolated virtual microphone PCM source has exact epoch/time /
  boundary validation, fixed 120 ms newest-data queue, capped prebuffer, counted
  underflow/silence, signed mono projection and wipe-on-stop. Six pure cases pass;
  public AUDIN backend/provider, worker/IPC/browser permission/capture and actual
  microphone remain open. [Contract](docs/AUDIO_CAPTURE.md),
  [evidence](docs/ITERATION_095.md).
- [~] IN PROGRESS — Public IAudinDevice adapter copies supported PCM16 48 kHz
  mono/stereo formats, opens fresh capture epochs, emits bounded PCM/silence and
  retires resources before delayed host Free. Owner-thread/reentrancy and callback
  failure fixtures pass; channel/provider, worker/IPC/browser microphone and actual
  remote acceptance remain open. [Contract](docs/AUDIO_AUDIN_ADAPTER.md),
  [evidence](docs/ITERATION_096.md).
- [~] IN PROGRESS — Scoped public audin/browser backend loading validates exact
  owner/context/arguments, consumes uncertain handoffs once and composes with
  RDPSND. Actual pinned AUDIN/fake-DVC fixtures project stereo/mono PCM and cover
  reopen, write failure and delayed termination. General AUDIN channel loading
  stays refused pending ingress/lifetime guards; worker/browser microphone and
  actual acceptance remain open. [Contract](docs/AUDIO_AUDIN_PROVIDER.md),
  [evidence](docs/ITERATION_097.md).
- [~] IN PROGRESS — Allocation-free AUDIN PDU/offer filtering bounds whole
  records, format claims/extras, complete Open preference, selected indices and
  100 ms callbacks. Pure and actual linked AUDIN/fake-DVC placement fixtures pass;
  dedicated sanitizer/fuzzer CI is prepared but unrun. Production DVC lifetime /
  non-forward refusal, worker/IPC/browser microphone and actual acceptance remain
  open. [Contract](docs/AUDIO_AUDIN_INGRESS.md),
  [evidence](docs/ITERATION_098.md).
- [~] IN PROGRESS — Public AUDIN DVC callback places bounded ingress ahead of
  the linked parser, checks negotiation replies and exact Incoming/Data pairs,
  catches detached false success and preserves callback ownership through owner
  retirement. Actual linked AUDIN/fake-DVC cases pass; plugin/listener/provider
  selection, reopen/cadence/resources, worker/browser microphone and actual
  acceptance remain open. [Contract](docs/AUDIO_AUDIN_DVC.md),
  [evidence](docs/ITERATION_099.md).
- [~] IN PROGRESS — Scoped pinned AUDIN plugin/listener ownership selects the
  guarded public DVC path with fixed arguments, rejects reentry/foreign calls,
  retires before delayed host termination and retains failed listener handles
  for one retry per later owner close. Actual linked AUDIN/fake-DVC fixtures pass;
  same-plugin reopen, finite worker teardown/cadence/resources, IPC/browser capture
  and actual microphone acceptance remain open. [Contract](docs/AUDIO_AUDIN_PLUGIN.md),
  [evidence](docs/ITERATION_100.md).
- [~] IN PROGRESS — Rational 48 kHz capture cadence emits at most one checked
  AUDIN PCM pair per due owner poll, skips missed deadlines without bursts and
  discards bounded old queue samples. Portable and linked AUDIN/fake-DVC fixtures
  pass; production callback/CPU and wakeup budgets, worker/IPC/browser capture and
  actual microphone/LAN acceptance remain open. [Contract](docs/AUDIO_CAPTURE_CADENCE.md),
  [evidence](docs/ITERATION_101.md).
- [~] IN PROGRESS — Native capture reset wipes PCM and advances the exact current
  input epoch while preserving the negotiated AUDIN receiver for silence/fresh
  input. Stale, foreign and reentrant resets preserve ownership; deadline snapshots
  reject previous-epoch cadence. Public device and linked AUDIN/fake-DVC fixtures
  pass; worker/lease/permission/rate limits, IPC/browser and actual remote reset
  acceptance remain open. [Contract](docs/AUDIO_CAPTURE_RESET.md),
  [evidence](docs/ITERATION_102.md).
- [~] IN PROGRESS — Fixed schema-1 microphone PCM codec and correlated RWI1
  kinds 39/40 enforce exact captured-frame metadata and body bounds before
  allocation. Native/TypeScript boundary/framing and real-worker unavailable /
  heartbeat/shutdown fixtures pass; worker handoff/admission, capability, current
  lease/permission, public browser transport and actual microphone remain open.
  [Contract](docs/MICROPHONE_PCM_WIRE.md), [evidence](docs/ITERATION_103.md).
- [~] IN PROGRESS — Single-slot native microphone handoff copies exact PCM once,
  rechecks epoch/readiness and a 20 ms dispatch deadline, protects callback borrows
  and wipes completed/drained samples. Portable and linked AUDIN/fake-DVC producer /
  RDP-owner fixtures pass; worker wakeup/completions/status, finite shutdown,
  Node/lease/permission/browser capture and actual LAN acceptance remain open.
  [Contract](docs/AUDIO_CAPTURE_HANDOFF.md), [evidence](docs/ITERATION_104.md).
- [~] IN PROGRESS — Private microphone status codec/kind 41 and latest-candidate
  publisher distinguish actual source state from transport-admitted input authority.
  Native/Node and linked AUDIN/fake-DVC backpressure/reset fixtures pass; worker
  emission/mutex/wakeup/deadlines, capability/lease/permission/browser/Opus input
  and actual remote/LAN acceptance remain open. [Contract](docs/MICROPHONE_STATE.md),
  [evidence](docs/ITERATION_105.md).
- [~] IN PROGRESS — RDP-owner MicrophoneSession composes guarded AUDIN loading,
  scheduled capture, admitted status authority and epoch reset. Finite retirement,
  failed listener retry, publication failure, reverse provider ordering and
  delayed host cleanup pass actual linked AUDIN/fake-DVC fixtures. Worker
  snapshot/mutex/wakeup/selection, production callback CPU budget, live-handle
  expiry and real microphone acceptance remain open.
  [Contract](docs/MICROPHONE_SESSION.md), [evidence](docs/ITERATION_106.md).
- [~] IN PROGRESS — Microphone owner selects 10..100 ms AUDIN callbacks;
  valid smaller Open gets a checked HRESULT refusal before device/upstream Open,
  with negotiated-table retention for a compatible retry. Portable and actual
  linked AUDIN/fake-DVC boundary, cadence and write-failure checks pass. Owner
  deadline snapshots require admitted readiness/actual epoch. Worker wakeup,
  global CPU/resource and real microphone acceptance remain open.
  [Contract](docs/AUDIO_AUDIN_PROFILE.md), [evidence](docs/ITERATION_107.md).
- [~] IN PROGRESS — Raw private schema-7 PCM input opt-in now selects the guarded
  AUDIN owner in Windows worker. One mutex couples admitted status with producer
  authority; one 20 ms slot rechecks actual source/epoch before root-thread queue
  admission. Wakeup/deadline scheduling and reverse finite cleanup are wired.
  Actual native TLS-refusal/lifetime cases pass with output off/PCM/Opus; no
  physical capture or negotiated remote microphone is claimed. Normal Node /
  HELLO/public selection, reset, connected-worker latency and real transport /
  microphone acceptance remain open. [Contract](docs/MICROPHONE_WORKER.md),
  [evidence](docs/ITERATION_108.md).
- [~] IN PROGRESS — Guarded Windows/AUDIN advertises independent PCM input.
  Private WorkerProcess selects schema 7, validates ordered authority and sends
  one packet at a time without sample retry. Fake IPC and actual native TLS
  refusal/lifetime fixtures pass; public creation still refuses non-off input.
  Reset, lease/permission/capture, resampling/Opus input, real remote/physical /
  LAN/platform acceptance remain open. [Contract](docs/MICROPHONE_NODE.md),
  [evidence](docs/ITERATION_109.md).
- [~] IN PROGRESS — Private microphone reset has fixed epoch/result records and
  bounded versioned HELLO extension decoding, preserving old peers as unsupported.
  Worker validates and replies unavailable; owner execution and Node API remain
  pending. Parser/native refusal evidence is separate from actual capture.
  [Contract](docs/MICROPHONE_RESET.md), [evidence](docs/ITERATION_110.md).
- [~] IN PROGRESS — Private microphone reset now runs on RDP owner ahead of PCM
  handoff, with separate fixed deadline/correlation and fresh admitted authority.
  Versioned capability gates private Node reset; one-flight and scheduled-epoch
  pause prevent sending across reset. Synthetic linked/fake IPC and native TLS
  fixtures are separate from physical/remote acceptance. Public lease/permission /
  transport and measured connected-worker/LAN/platform gates remain open.
  [Contract](docs/MICROPHONE_RESET.md), [evidence](docs/ITERATION_111.md).
- [~] IN PROGRESS — Browser/Node MIC_PACKET PCM codec has fixed direction /
  stream, input epoch/sequence/time and exact 20 ms sample bounds. Independent
  vectors and all-truncation/ownership fixtures pass; no public socket or capture
  activation is claimed. Lease/reset/credit/permission/resampling/Opus input and
  actual remote/physical/LAN/platform gates remain open.
  [Contract](docs/MICROPHONE_WIRE.md), [evidence](docs/ITERATION_112.md).
- [~] IN PROGRESS — Isolated microphone ingress has one owned PCM slot and one
  backend flight, sequence/continuity checks, permanent grant revocation and
  source/lease recheck after completion. Portable and synthetic-process private
  projection/drain/reset fixtures pass; public finite retirement/ownership,
  socket/ACK, permission/capture and remote/physical/LAN gates remain open.
  [Contract](docs/MICROPHONE_INGRESS.md), [evidence](docs/ITERATION_113.md).
- [~] IN PROGRESS — Isolated exclusive microphone ownership revokes immediately,
  drains one operation and requires native reset/new epoch before transfer under
  one finite deadline. Late replies cannot revive expired ownership; failure
  requests termination once. Portable and synthetic-process fixtures pass;
  public host cleanup/lease/socket integration, permission/capture and actual
  remote/physical/LAN gates remain open. [Contract](docs/MICROPHONE_OWNERSHIP.md),
  [evidence](docs/ITERATION_114.md).
- [~] IN PROGRESS — Restored actual XRDP accepts private PCM input with output
  off/PCM/Opus; heartbeat, 1080p JPEG and empty-runtime cleanup pass in all three
  modes. Input remains waiting/epoch 0, so no ready or remote capture acceptance
  is claimed. The reproducible inventory helper sends no PCM or remote input.
  Public activation and remote/physical/LAN gates remain open.
  [Evidence](docs/ITERATION_115.md).
- [ ] Browser microphone capture and packet transport.
- [ ] Underflow/silence behavior that does not block RDP loop.
- [ ] Audio reconnect/discontinuity reset.
- [~] IN PROGRESS — Guarded static PCM detects epoch/gap/block/format/type changes before Open/Play, resets stale queue/interpolation, preserves ordinary timestamp/block wraps and validates whole-frame/100 ms preparation budgets. Pure clocks and actual linked channel/fake-SVC fixtures cover recovery; larger packet splitting, server table renegotiation, browser PTS and actual audio acceptance remain open. [Evidence](docs/ITERATION_046.md).
- [~] IN PROGRESS — The initial PCM table is fixed for one connection; replacement tables fail before upstream mutation. Source rate/layout/width changes within that table pass actual linked channel/fake-SVC tests. [Evidence](docs/ITERATION_047.md); `2713056`. Broader renegotiation remains open.
- [~] IN PROGRESS — RDPEI and guarded RDPSND now compose in either binding order through a fixed eight-record owner/context scope stack. Cached public entries and delayed confirmation ownership pass actual linked addin/simulated transport tests; outer close fails before retiring resources beneath an attached child. Worker audio activation and real transport/audio acceptance remain open. [Evidence](docs/ITERATION_048.md).
- [~] IN PROGRESS — Fixed 20 ms PCM packetization now uses the common worker-clock input, counts underflow silence, skips expired FIFO intervals without catch-up bursts, and preserves monotonic PTS across source resets. Pure and actual linked RDPSND/fake-SVC fixtures pass; worker scheduling, transport, AudioWorklet and actual audible/latency acceptance remain open. [Evidence](docs/ITERATION_049.md). Provider composition: `7842b32`.
- [~] IN PROGRESS — Fixed versioned PCM config/packet codecs now agree in native/TypeScript, with envelope limits before allocation, epoch/silence/PTS validation and raw-sample RWB1 stream 3 encoding. This is codec preparation, with no new advertised audio capability or worker/browser activation. [Evidence](docs/ITERATION_050.md). PCM packetization: `ff49604`.
- [~] IN PROGRESS — Isolated browser S16LE stereo queue and AudioWorklet now use fixed 120 ms capacity, 40 ms prebuffer, counted silence and newest-data overflow policy. Pure fixtures and actual Edge offline sample rendering/live port acknowledgments pass. Production port ownership/parser, worker/Node delivery and audible RDP/microphone/latency acceptance remain open. [Evidence](docs/ITERATION_051.md). PCM codecs: `655ef81`.
- [~] IN PROGRESS — Browser PCM RWB1 parser and exclusive AudioContext/MessagePort owner now bound one posted command and one latest pending packet, force discontinuity on drops and retire on ACK/deadline/context loss. Pure fault/burst tests and actual Edge credit/epoch/cleanup fixtures pass; reference-viewer activation, worker/Node streaming, audible remote audio/microphone and latency gates remain open. [Evidence](docs/ITERATION_052.md). AudioWorklet foundation: `4563327`.
- [~] IN PROGRESS — Native PCM publisher now offers one fixed latest IPC packet/config through nonblocking credit, with epoch/config ordering and sink revision checks that discard prepared PCM on Close/reset before fresh samples. Pure owner/fault tests and actual linked RDPSND/fake-SVC Close/restart pass. Prioritized native writer, worker/Node activation and real audio gates remain open. [Evidence](docs/ITERATION_053.md). Browser port ownership: `7f44b97`.
- [~] IN PROGRESS — Native output queue foundation now bounds 64 control FIFO slots, one audio config/latest PCM, cursor shape/latest metadata and one correlated video response. Typed admission, epoch discard, discontinuity, exact maxima and ownership fixtures pass; writer thread, source invalidation, pipe shutdown/fairness and worker/Node activation remain open. [Evidence](docs/ITERATION_054.md). PCM publisher: `a30e9a9`.
- [~] IN PROGRESS — Shared native producer/writer dispatcher now offers try-lock credit, one owned in-flight record and separate fixed-header/body writing outside the queue mutex. Stalled-writer, reentry, drain, abort and callback-fault fixtures pass; OS writer thread/cancellation/wakeups, worker/Node activation and actual audio remain open. [Evidence](docs/ITERATION_055.md). Bounded lanes: `76c66fd`.
- [~] IN PROGRESS — Windows pipe driver now owns writer/watchdog threads, private event wakeups, whole-record deadlines and synchronous cancellation with retained in-flight spans. Actual anonymous-pipe stall/drain/broken-reader and twenty-driver handle-count fixtures pass. Worker selection/regression, Linux, unsupported OS cancellation/reclamation, source-reset barriers and actual audio remain open. [Evidence](docs/ITERATION_057.md). Dispatcher: `46245b2`; registry force completion: `120c5b1`.
- [~] IN PROGRESS — Windows foundation/bundled workers now select bounded priority output, join connection producers before writer drain and refuse full/failed admission without blocking on pipe writes. Actual lifecycle/parent flood and XRDP H.264 reset/JPEG resize/restoration/replay pass. Audio source barriers/config/provider and Node/browser delivery remain open; audio stays disabled, Linux priority and resource/soak gates remain pending. [Evidence](docs/ITERATION_058.md). Windows driver: `6636e32`.
- [~] IN PROGRESS — Native PCM publisher now requires consumer-discard credit on initial ownership/source revision/reset before fresh sample reads or sends. Pure credit/reentry/fault and actual linked RDPSND/fake-SVC Close tests clear accepted unsent PCM and resume with a new epoch. In-flight/browser reset/status, worker config/provider and Node/browser activation remain open; audio is still disabled. [Evidence](docs/ITERATION_059.md). Worker output: `604bd10`.
- [~] IN PROGRESS — Versioned fixed PCM source-status IPC codec now represents opt-in/availability/revision/epoch/worker time without samples. Native/TypeScript vectors, invalid fields/ranges, fragmented framing and typed control-queue priority pass. Status owner/reservation, worker selection, Node/browser reset and actual audio remain open; workers emit no status/audio yet. [Evidence](docs/ITERATION_060.md). Source discard barrier: `844ee44`.
- [~] IN PROGRESS — Native RDPSND source snapshots distinguish samples from open-device ownership and track Close, raw suspend/resume, invalid ingress, overflow and unavailable offers. Pure/public-ABI and actual linked channel/fake-SVC cases pass; status/epoch ownership, worker/browser delivery and actual audio remain open. [Evidence](docs/ITERATION_061.md). Status codec: `e77a0e0`.
- [~] IN PROGRESS — Native PCM publisher now reserves epochs and offers independent latest source status before config/samples, including Close without fresh PCM. Source reset and packetizer skips clear older unsent consumer audio before status. Owner/queue and actual linked RDPSND/fake-SVC cases pass; worker selection, public framing, Node/browser reset and actual audio remain open. [Evidence](docs/ITERATION_062.md). Source snapshots: `d577699`.
- [~] IN PROGRESS — Preparatory public PCM source state is fixed RWB1 type 0x09/stream 3 with matched worker clocks and bounded audio sequence. Independent Node/browser vectors and malformed-record regression pass. Status-aware playback, Node listeners/replay, negotiated worker selection and actual audio remain open; no worker/API emits this extension. [Evidence](docs/ITERATION_063.md). Native status owner: `7b921d5`.
- [~] IN PROGRESS — Opt-in isolated browser source-status ownership now clears pending PCM/config and orders coalesced Worklet reset before fresh ready/config/samples. Pure bounds/progress/bypass and actual Edge no-sample Close/recovery/replay cleanup pass with synthetic PCM. Worker/provider selection, Node listeners/media negotiation and audible remote audio remain open. [Evidence](docs/ITERATION_064.md). Public state codec: `91578d0`.
- [~] IN PROGRESS — Serialized native audio session pairs guarded provider and source publisher with bounded retirement policy; cancelled confirmations, close/output/deadline faults and continued native cleanup after publication failure pass linked RDPSND/fake-SVC fixtures. Actual public core registration/disconnect/later-thread context teardown passes without a socket. Worker selection, real transport/resource faults, Node/browser delivery and audible audio remain open. [Evidence](docs/ITERATION_065.md), [pinned core audit](docs/RDPSND_UPSTREAM_AUDIT.md). Browser source mode: `1e28cd8`.

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
- [ ] Actual drdynvc host preallocation/decompression limits and lost-transport terminal release acceptance. The source audit identifies allocations before the public RDPEI gate and a NOT_CONNECTED-to-OK write path; current bridge bounds do not establish upstream bounds or remote release. [Audit and required follow-up](docs/RDPEI_UPSTREAM_AUDIT.md).
- [ ] FreeRDP return values checked.
- [ ] Unsupported feature is explicit capability state, not a crash.
- [ ] Documentation and schema match actual code.
- [ ] Focused commits made during implementation, not one giant final commit.

## Additional foundation tasks and retained requirements

- [x] DONE — Initial typed SessionCreate schema, unknown-field/range checks, safe privilege policy and recursive secret redaction. [Config tests](tests/unit/config.test.mjs); `3610524`. Traces to SPECIFICATION §2.1/3.2, CONFIG_SCHEMA, SECURITY §3/5. This is contract validation, not RDP feature support.
- [~] IN PROGRESS — Separate bounded config/secret IPC classes now deliver credentials after HELLO; transport copies and the active FreeRDP password setting are overwritten. Upstream/immutable JS copies and future secret classes remain open. [Contract](docs/CONNECTION_CORE.md).
- [ ] TODO — Explicit restricted Windows runtime ACLs and multi-user isolation acceptance. Traces to ARCHITECTURE §2 and SECURITY §2/6.
- [ ] TODO — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. Normal close, worker-only crash and parent-only death are verified; simultaneous hard kill is not. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup.
- [~] IN PROGRESS — Registry now retains capacity through native forced-termination completion with a separate bounded deadline; filesystem/HELLO cancellation guards prevent late spawn/readiness. Pure completion/fault tests, compiled fake-worker/native-adapter join and actual linked unsupported-config cleanup pass. Forced-deadline expiry, legacy void backends, OS/filesystem failures and orphan acceptance remain open. [Evidence](docs/ITERATION_056.md). Observed race: [iteration 55](docs/ITERATION_055.md), `46245b2`.
- [~] IN PROGRESS — Package worker + exact FreeRDP/WinPR/runtime dependencies for Windows x64 and Linux x64 without requiring a system FreeRDP install. Windows native ZIP and relocation are verified; [manual bundled CI](.github/workflows/bundled-native.yml) is prepared, not run. Linux, Node.js distribution, MSI/EXE/DEB/RPM installer integration and clean-machine tests remain open.
