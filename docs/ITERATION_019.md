# Iteration 19 — public Display Control and browser media epochs

Date: 2026-10-09. Implements SPECIFICATION §2.3 / §2.10, PROTOCOL §3–5,
MEDIA_PIPELINE §10, ARCHITECTURE §4 and accepted ADR-003 / ADR-008 / ADR-009.
Original requirements remain retained. Scope is the experimental single-primary,
100%-scale Display Control path; global usable `rdp` remains false.
Implementation commit: `78fbb67`.

## Delivered

- NativeSessionWorker forwards observed display metadata and typed resize results.
  SessionManager validates u64 epochs, dirty floors, geometry and session opt-in,
  caches copied state, replays it on attachment and rejects invalid backend state.
- A current control lease can reserve one resize; media/stale leases cannot.
  Previously accepted input drains, then tracked input resets before dispatch.
  New non-reset input receives nonfatal `INPUT_DISPLAY_TRANSITION`; reset/detach
  remain available. Authority is rechecked after every async pre-dispatch step
  and after completion. Replacement controllers see pending/actual state but
  cannot dispatch overlapping layouts. A seven-second hung-backend deadline fails
  the session before reservation release. Typed native timeout preserves geometry;
  late observations remain authoritative.
- Additive public v1 `display.resize.request`, correlated `display.resize.result`,
  `display.info` / `display.resize` replay and `input.paused`. The bounded control
  envelope/rates and strict schemas remain. Request scale is a ratio fixed at 1;
  state exposes percentages 100, orientation 0 and BGRA8. Unsupported scale or
  layout fields receive explicit invalid results. Media metadata requires explicit
  `media.hello.data.display=true`; legacy consumers retain binary-only updates after
  negotiation while internal epoch protections still apply. No native IPC/RWB1 header change.
- Media generation changes retain already transmitted ACK/reset credit and deadline.
  A capture from an older generation is dropped before sequence/credit allocation;
  revision-floor/geometry checks reject stale results. Next capture forces
  DISCONTINUITY configuration and AVC IDR even for a same-size framebuffer reset.
  Caps/pending-only changes do not reset video. One timer/capture/credit stays bounded.
- Reference harness width/height controls and `bridgeViewer.resize()` consume
  authoritative state, change canvas only on config, complete previous decode/ACK
  before replacing the decoder and pause input until rendered epoch/geometry match.
  Separate control/media socket order is not assumed. The ordered receive queue
  remains bounded at five messages / 8 MiB + 8 KiB, including display metadata.
  Cursor shape credit remains independent; local pointer/hotspot mapping is refreshed
  on canvas resize, and obsolete server-only coordinates are hidden.
- Local browser helper explicitly opts in, tests both codecs, restoration, no-op /
  invalid results and display/cursor reattachment. It checks decoded nonuniform
  pixels at each new resolution and attempts restoration on failure. Credentials
  stay in authorized ignored `.local-tests/` files and private IPC; only motion/reset
  input reaches the operational lab desktop.

Contracts: [public protocol](../PROTOCOL.md#experimental-display-control-v1-additive-extension),
[Display Control](DISPLAY_CONTROL.md), [cursor](CURSOR.md),
[launch instructions](DEVELOPMENT.md#xrdp-browser-resize-check).

## Verification

- Bundled `pnpm check`: **100/100**, no skips/cancellations, **94.01 s**. Typecheck, lint, formatting,
  native lifecycle tests and the sequential 100-worker cleanup gate pass.
- Nine new pure/fake-backend cases cover metadata bounds, rendered-input readiness,
  earlier-input drain/reset, reservation/input pause, authority loss before dispatch
  and during native wait, absent opt-in, invalid scale/geometry, timeout/late
  observation, false applied/reused epoch, nonfatal native input pause and a hung
  backend deadline. These do not establish remote RDP behavior.
- Four new fake WS/media cases cover both codecs, changed/same-sized epochs while
  previous credit is stalled, config/IDR after the exact old ACK, unsent old-frame
  rejection without sequence/credit consumption, replay and correlated busy/invalid /
  applied replies with nonfatal input pause, plus binary-only legacy media after
  resize without display negotiation. JPEG/AVC transport bytes in these
  fixtures are explicit sentinels, not browser decoder or RDP acceptance.
- Actual Edge cursor DOM fixture checks a stationary local pointer and hotspot
  through 640×480 → 320×240 → 640×480 with constant CSS dimensions, plus existing
  visibility, pixels, malformed shape and detach assertions.
- Existing native public-callback/GDI/codec fixtures remain required separately:
  bundled CTest **8/8**, foundation CTest **3/3**; native code/wire is unchanged.

One initial new control fixture accidentally sent an unsupported pointer shape;
the strict existing input schema rejected it. Correcting the fixture to
`action: "move"` made the narrow and full suites pass without relaxing validation.

## Separate actual XRDP / Edge integration

The authorized lab at 192.168.21.149:3389 used its previously approved exact
session-only certificate fingerprint. Actual public control/media browser paths:

- H.264 with injected initial decoder failure recovered once, then displayed
  **1280×720 generation 3** (config count 3, keyframes 14) and restored
  **1920×1080 generation 4** (configs 4, keyframes 15). New-size decoded pixels were
  nonuniform; no additional decoder recovery was needed across resize. Before
  resize it rendered 41 frames, decode mean 3.12 ms / p95 2.40 ms.
- JPEG independently rendered the same requested/restored dimensions with new
  config generations (2 then 3) and decoded nonuniform pixels. Before resize it
  rendered 48 frames, decode mean 16.66 ms / p95 21.20 ms. Exact no-op returned unchanged
  and odd width returned invalid without disconnecting either codec's viewer.
- Both checks reattached using fresh tokens and verified actual display generation /
  rendered generation agreement, 1920×1080 and cursor shape replay; motion resumed,
  only one motion and four resets were sent, and runtime directories were empty.

The counts are measurements of these local runs, not throughput/FPS or LAN latency
guarantees. Native/fake delayed-ACK tests separately establish credit ownership;
these actual browser runs do not deterministically stall a native resize ACK or
exercise held remote keys/buttons/wheel.

Ignored logs: `build/iteration-019-{check,h264,jpeg,foundation,bundled}.log`.

## Retained acceptance

Windows RDP server and Linux/browser portability, full Display Control DVC resource
audit, scale/rotation/multimonitor layouts, automatic viewport resize policy, broader
GFX variants, adaptive quality and the 30-minute interactive/resize soak remain open.
Stage 4 and Stage 9 dynamic-resolution items remain IN PROGRESS; no original gate
is checked off solely because the XRDP/browser slice passed.
