# TODO — implementation plan

Legend: `[ ]` not started, `[~]` in progress, `[x]` accepted. Do not mark complete solely because code compiles.

## Stage 0 — repository and reproducible build

- [ ] Create pnpm monorepo layout from `STACK.md`.
- [ ] Add TypeScript strict config, lint/format, CI skeleton.
- [ ] Add CMake/Ninja native workspace.
- [ ] Pin FreeRDP **3.32.1** source/build and record commit/checksum.
- [ ] Enable required client channels; emit build feature report.
- [ ] Add `rdp-worker --version --capabilities`.
- [ ] Add Node `/v1/build` backed by real worker/build information.
- [ ] Add debug ASan/UBSan native CI job.

**Gate:** clean build from fresh checkout/container; exact FreeRDP version visible; no UI required.

## Stage 1 — native worker process and IPC

- [ ] Implement worker process entrypoint with no RDP connection yet.
- [ ] Implement versioned `RWI1` IPC envelope.
- [ ] Linux `SOCK_SEQPACKET` transport + framed-stream abstraction/fallback.
- [ ] HELLO/HELLO_ACK capability negotiation.
- [ ] Heartbeat and graceful shutdown.
- [ ] Length limits and parser unit tests.
- [ ] libFuzzer target for IPC envelope.
- [ ] Parent-death handling and private runtime directory cleanup.

**Gate:** Node test supervisor can spawn 100 sequential workers, exchange heartbeats, kill/restart without leaked processes/files.

## Stage 2 — Node session manager and public API

- [ ] Fastify server, TypeBox schemas, pino redaction.
- [ ] Implement `POST/GET/DELETE /v1/sessions`.
- [ ] Add attach-token generation/TTL/scope.
- [ ] Add control/media WebSocket upgrade authorization and Origin checks.
- [ ] Add per-session/global limits.
- [ ] Add worker crash supervision.
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
