# Iteration 16 — configurable native quality and FPS caps

Date: 2026-10-09. Scope: SPECIFICATION §2.3 / §2.10, ARCHITECTURE §4,
MEDIA_PIPELINE §3–4 and accepted ADR-003. Original requirements retained.
Implementation commit: `bd8659b`.

## Delivered

- Non-secret quality resolution for low-bandwidth, balanced, LAN and custom
  profiles, including FPS override and explicit target/maximum H.264 rates.
  Defaults remain 30 AVC / 20 JPEG FPS, JPEG quality 80 and 4 Mbit/s target/max.
- Native capture and Node pull scheduling use the configured effective cap;
  media.ready reports that cap, including browser reattachment. Single-frame
  credit, latest revision and lazy session-owned encoding are retained.
- OpenH264 receives distinct target/max rates; JPEG receives profile quality.
  Out-of-provider bitrate requests and unimplemented remote appearance flags
  fail explicitly. Current transport/provider ceilings remain 30/20 FPS;
  a requested maximum of 60 is a cap, not a demand or promise of 60 rendered FPS.
- CONFIGURE v2 adds a bounded 12-byte non-secret quality extension, gated by
  HELLO capability bit 8. New native workers still accept v1 defaults, and new
  Node readers accept older workers without the new bit. Explicit quality then
  fails before CONFIGURE/SECRET. Older Node readers rejecting unknown bits need
  to be upgraded with the worker. RWI1/media record versions remain unchanged.
- The reference harness validates and exposes the selected FPS ceiling in its
  diagnostics. The XRDP helper's optional --quality-test also checks native
  pacing directly after media detach, independently of Node's scheduling.
- Development instructions now reflect the existing authorized ignored
  plaintext lab exception rather than an obsolete pending credential step.

Contract: [video quality](VIDEO_QUALITY.md), [wire](IPC_FOUNDATION.md).

## Verification

Windows x64 / MSVC C++20 `/W4 /WX /analyze`:

- Native v1/v2 configuration narrow tests: **2 cases / 125 assertions**, with
  independent vectors, historical defaults, all truncations, reserved bytes,
  count/rate/quality bounds and no trailing payloads.
- JPEG: **2 cases / 26 assertions**, including actual quality-dependent encoded
  size and real decoding of both quality outputs. Invalid quality is rejected
  before allocating encoder storage.
- H.264: **5 cases / 224 assertions**, including real decode at 1 FPS / 100 kbit/s
  target / 200 kbit/s maximum and invalid maximum-rate rejection.
- Node narrow config/protocol/media/native TLS integration: **36/36**. Fake
  media checks enforce a 2 FPS cap after immediate ACK for both codecs. Actual
  native CONFIGURE v2 is accepted before a strict certificate rejection on the
  synthetic TLS endpoint; this is not a remote desktop test.
- Bundled `pnpm check`: **76/76**, no skipped/cancelled tests, **64.1 s**;
  typecheck, lint and format pass. The sequential 100-worker lifecycle gate passes.
- Bundled CTest **7/7**, foundation CTest **3/3**. Full IPC suite is now
  **18 cases / 266 assertions**; GDI/GFX remains **10 cases / 36,271 assertions**.
- Native ZIP relocation **1/1**, including private JPEG/H.264 and FreeRDP AVC420
  decoder probes. `clang-format --dry-run --Werror` and `git diff --check` pass.

Ignored logs: `build/quality-{native-narrow,node-narrow,bundled,foundation,
pnpm-check,relocate}.log`.

## Separate actual XRDP / Edge regression

The previously authorized lab and exact session-only certificate trust were
used. Credentials remained in ignored local helper files and private IPC.
Input stayed limited to one motion and one release/reset, without keys/buttons/wheel.
Quality was low-bandwidth with explicit **5 FPS / 750 kbit/s target / 1000 kbit/s
maximum**; JPEG profile quality was 60.

- H.264/reset: **43 rendered frames**, 1920×1080, selected cap **5 FPS**,
  **1 decoder reset**, 44 encoded frames before direct capture checks.
  Three consecutive direct native forced-IDR captures had a minimum timestamp
  interval of **203,065 µs**, above the configured 200 ms interval.
- JPEG: **42 rendered frames**, 1920×1080, selected cap **5 FPS**,
  42 encoded frames before direct capture checks. Three direct native captures
  had a minimum timestamp interval of **215,239 µs**.
- Both paths verify nonuniform desktop pixels, cursor delivery/replay and
  browser reattachment, then delete the session and verify runtime cleanup.

Ignored logs: `build/quality-xrdp-h264.log`, `build/quality-xrdp-jpeg.log`.
These checks establish the cap and real codec paths on this lab. They do not
establish a maximum achievable FPS, scene-change latency, exact instantaneous
bitrate or full desktop soak. Incoming negotiated GFX is a separate gate.

## Retained work

Provider/hardware selection, adaptive congestion and bitrate/FPS control,
broader appearance flags, actual GFX/scaling/dynamic resize, resource audit and
30-minute Windows/XRDP soak remain open. Stage 4 stays IN PROGRESS, and the
overall usable `rdp` capability remains false.
