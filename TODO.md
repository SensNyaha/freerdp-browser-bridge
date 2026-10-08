# TODO — implementation plan

Legend: `[ ]` TODO, `[~]` IN PROGRESS, `[!]` BLOCKED, `[x]` DONE (accepted). Do not mark complete solely because code compiles.

## Implementation status — 2026-10-08

The first lifecycle slice is implemented and verified on **Windows x64**. Stage 0 and Stage 1
are **IN PROGRESS**, not fully accepted. No RDP connection, media or device capability is claimed.

- **DONE:** strict pnpm workspace, CMake/Ninja C++20 worker, bounded RWI1 framing, HELLO,
  heartbeat/watchdog, graceful/forced shutdown, crash isolation and private-directory cleanup.
- **DONE:** initial TypeBox configuration contract and recursive redaction; real worker-backed
  build/capability REST endpoints; reusable Node worker API and lifecycle example.
- **Evidence:** [Node integration tests](tests/integration/worker.test.mjs),
  [protocol tests](tests/unit/protocol.test.mjs), [configuration tests](tests/unit/config.test.mjs),
  [native tests](native/ipc/tests.cpp). `pnpm check`: 16/16 Node tests; CTest/Catch2:
  4 native cases / 43 assertions. The 100 sequential worker test passes with no processes or
  runtime directories leaked. MSVC /analyze, /W4 /WX and clang-format checks pass.
- **Commits:** `9517003` build, `1672590` IPC/native lifecycle, `3610524` configuration,
  `316cdc0` Node supervisor/API/integration. Original blueprint is preserved in `3065f2d`.
- **BLOCKED:** pinned FreeRDP configure fails on `ZLIB_LIBRARY` / `ZLIB_INCLUDE_DIR` on this
  host. See [dependency profile](native/freerdp-profile.cmake) and
  [build instructions](docs/DEVELOPMENT.md). Remaining dependency inventory is unverified.
- **BLOCKED acceptance:** no Linux runtime/Clang compiler or Windows RDP/XRDP lab is available
  in this session. Linux SOCK_SEQPACKET remains unimplemented. Linux CI, ASan/UBSan and libFuzzer
  jobs are prepared but have not run; they are not counted as passing integration gates.

Wire details: [IPC foundation](docs/IPC_FOUNDATION.md). Audit and iteration report:
[contract audit](docs/CONTRACT_AUDIT.md), [verified results](docs/ITERATION_001.md).

## Stage 0 — repository and reproducible build

- [x] DONE — Create pnpm monorepo layout from `STACK.md` (core packages/apps/native; future component directories are created with their implementations). `9517003`.
- [x] DONE — Add TypeScript strict config, lint/format, CI skeleton. `pnpm check`; `9517003`.
- [x] DONE — Add CMake/Ninja native workspace. MSVC x64 build + CTest; `9517003`, `1672590`.
- [~] IN PROGRESS — Pin FreeRDP **3.32.1** source/build and record commit/checksum. Source commit verified as `bf217a504e54cc719880c228e82353382cd7d4fa`; actual library build blocked by ZLIB. [Lock metadata](native/dependencies.json).
- [!] BLOCKED — Enable required client channels; emit build feature report. Required-channel profile exists; linked libraries/channels unverified because FreeRDP configure stops at missing ZLIB.
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

- [ ] Fastify server, TypeBox schemas, pino redaction.
- [ ] Implement `POST/GET/DELETE /v1/sessions`.
- [ ] Add attach-token generation/TTL/scope.
- [ ] Add control/media WebSocket upgrade authorization and Origin checks.
- [ ] Add per-session/global limits.
- [~] IN PROGRESS — Add worker crash supervision. Process-level isolation/watchdog implemented and tested (`316cdc0`); session registry state/error mapping remains TODO.
- [ ] Add Prometheus baseline metrics.
- [ ] Add session state/error model.

**Gate:** fake worker can drive complete lifecycle and WS attach tests.

## Stage 3 — FreeRDP connect core

- [ ] Create custom `RDP_CLIENT_ENTRY_POINTS` client context.
- [ ] Map target/auth/security settings through public FreeRDP settings APIs.
- [ ] Implement auth callback/prompt path without logging secrets.
- [ ] Implement strict certificate callback and prompt/TOFU flow.
- [ ] Load addins and establish Windows RDP + XRDP sessions.
- [ ] Normalize disconnect reasons.
- [ ] Implement graceful disconnect/reconnect skeleton.
- [ ] Never pass password/hash/PIN in argv/env.

**Gate:** CLI-less worker connects to Windows and XRDP, reports state, rejects changed certificate correctly.

## Stage 4 — graphics, cursor and browser video

- [ ] Initialize headless FreeRDP GDI/framebuffer.
- [ ] Register paint/resize/surface callbacks.
- [ ] Dirty-region/revision tracker.
- [ ] Cursor shape/hotspot/position extraction.
- [ ] `FrameScheduler` latest-state logic.
- [ ] H.264 encoder interface and one software provider.
- [ ] AVCC config/access-unit packetization.
- [ ] Worker→Node binary media forwarding.
- [ ] Browser harness WebCodecs decoder + canvas rendering.
- [ ] Cursor overlay in harness.
- [ ] JPEG/WebP fallback path.
- [ ] Backpressure/drop/keyframe recovery.
- [ ] Instrument encode/queue latency.

**Gate:** stable 1080p interactive Windows/XRDP desktop for 30 min, resize safe, cursor smooth, no unbounded queue growth.

## Stage 5 — keyboard, mouse, wheel and touch

- [ ] Browser `KeyboardEvent.code` → RDP scancode mapping.
- [ ] Modifier state synchronization.
- [ ] Unicode text fallback/IME pathway.
- [ ] Absolute pointer and all primary/extra buttons.
- [ ] Vertical/horizontal wheel.
- [ ] Coalesce only pointer move.
- [ ] Release pressed keys/buttons on blur/detach.
- [ ] Touch contacts via RDPEI when available.
- [ ] Pen capability placeholder/implementation if supported.

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
- [ ] Dynamic resolution through DisplayControl.
- [ ] Multimonitor policy where browser/future UI can represent it.
- [ ] Quality profiles mapped to FreeRDP performance flags.
- [ ] Smart sizing/scales/orientation.
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
- [ ] TODO — Secret-material/config IPC classes and zeroization where practical. Stage 3 must deliver secrets after handshake through private IPC; foundation currently sends no session credentials.
- [ ] TODO — Explicit restricted Windows runtime ACLs and multi-user isolation acceptance. Traces to ARCHITECTURE §2 and SECURITY §2/6.
- [ ] TODO — Reclaim directories after simultaneous parent/worker hard kill, including stale ownership records. Normal close, worker-only crash and parent-only death are verified; simultaneous hard kill is not. Traces to SPECIFICATION §3.1 and Stage 10 watchdog cleanup.
- [ ] TODO — Package worker + exact FreeRDP/WinPR/runtime dependencies for Windows x64 and Linux x64 without requiring a system FreeRDP install. Development foundation profile is deliberately lifecycle-only; Stage 0/10 packaging gates remain open.
