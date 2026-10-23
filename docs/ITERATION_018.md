# Iteration 18 — private Display Control IPC and actual XRDP resize

Date: 2026-10-09. Scope: SPECIFICATION §2.3 / §2.10, MEDIA_PIPELINE §10,
ARCHITECTURE §4 and accepted ADR-003 / ADR-008 / ADR-009. Original requirements
retained. This completes the private native/Node request block; public browser
dynamic-resolution acceptance remains open.
Implementation commit: `098ddab`.

## Delivered

- Experimental HELLO bit 9 (`displayControl`) gated by compiled DISP. Remote
  readiness is separate from the build capability and per-session authorization.
  CONFIGURE v3 adds an explicit dynamic-resolution flag after the quality fields.
  v1/v2 retain disabled defaults; false/absent opt-in preserves older workers.
  Explicit true against an old worker fails before CONFIGURE/SECRET.
- Fixed-size DISPLAY_UPDATE / DISPLAY_RESIZE / DISPLAY_RESIZE_RESULT classes.
  Metadata includes actual dimensions, successful framebuffer generation/reset,
  its dirty-revision floor and negotiated provider/area limits. Exact envelope
  lengths are checked before body allocation; reserved/unknown fields fail.
- One bounded IPC request slot and one RDP-thread confirmation, mutually
  exclusive. Only matching successful GDI observation yields applied, with the
  metadata delivered first. Other outcomes are unchanged, unavailable, invalid,
  busy, send-failed, timeout and disconnected. Caps loss/teardown resolve pending
  requests without inventing desktop dimensions.
- Before layout submission, native tracking releases held input. Non-reset
  input is rejected while queued/active and never replayed afterwards. Reset and
  lifecycle IPC remain available. The Node low-level API recognizes this as a
  nonfatal operation error.
  Input resumes before the completion reply, so the parent cannot race that reply
  against a still-paused native queue.
- WorkerProcess emits/caches copyable observed display state, limits resize to
  one in-flight command, and rejects changed geometry with a reused generation
  or applied without a matching newer observation. Its resize transport deadline
  is at least 6.5 seconds, allowing the native five-second timeout to arrive.
  A typed timeout preserves a healthy worker; late observations remain authoritative.
  Successful replies are validated when received, so an immediately following
  remote disconnect cannot invalidate an already observed completion.
- A separate local lab helper checks negotiated Display Control, actual resize,
  fresh AVC IDR/JPEG dimensions and restoration. Credentials remain in authorized
  ignored local files and private IPC; output contains only sanitized test metadata.

Wire contract: [IPC foundation](IPC_FOUNDATION.md#display-control-payloads).
Native contract and gaps: [Display Control](DISPLAY_CONTROL.md).

## Verification

Windows x64 / MSVC C++20 `/W4 /WX /analyze`:

- Native IPC/config/input/cursor: **20 cases / 357 assertions**, including
  independent display vectors, exact class bounds before allocation, v3 truncation,
  flags/trailing bytes and disabled v1/v2 compatibility. Fuzz dispatch includes
  display requests; Linux/libFuzzer execution remains unverified.
- Bundled CTest **8/8**, foundation CTest **3/3**. Existing Display Control public
  callbacks (8 cases / 280 assertions), real GDI realloc and codec resize fixtures
  remain passing; these are linked native fixtures, not remote protocol integration.
- Bundled `pnpm check`: **87/87**, no skips/cancellations, **82.1 s**. Typecheck,
  lint and format pass; sequential 100-worker lifecycle/cleanup remains passing.
- Nine explicit fake IPC peer cases distinguish this supervisor coverage from
  RDP: delayed confirmation over the ordinary IPC deadline, heartbeat while waiting,
  input rejection/reset, busy/no-op/invalid results, disabled/unnegotiated sessions,
  timeout and late observation, reused generation, false applied, older-worker
  opt-in rejection, pending shutdown/cleanup and disconnect immediately after
  valid observation/completion. One preceding full run cancelled an existing
  missing-media-ACK test at its 10-second deadline. That test passed separately
  in 5.6 seconds; the final full run passed all 87. Its deadlines were not relaxed.

## Separate actual XRDP check

The authorized lab at 192.168.21.149 negotiated Display Control with the already
approved exact session-only certificate fingerprint. `test-xrdp-display.mjs`:

- Initial observed state: generation **2**, framebuffer revision **2**, **1920×1080**,
  opt-in true, negotiated true, local maximum **3840×2160 / 8,294,400 pixels**.
- Server accepted **1280×720**: applied result followed generation **3**, revision
  **5** observation; next AVC capture was IDR at the new size and JPEG also reported
  **1280×720**. Capture revision was at least the observation's dirty revision.
- Exact no-op returned unchanged; odd requested width returned invalid.
- Restored **1920×1080**: applied after generation **4**, revision **11**, followed
  by a fresh AVC IDR. Input reset and heartbeat passed, then worker closed.

A repeat temporarily failed before activation with RDP_CONNECT_TIMEOUT; a separate
TCP probe to port 3389 also timed out. After the user restored access, the final
check above passed again. The helper now records only a fixed phase and decoded
numeric/state diagnostic on failure, without upstream text or credentials.

This verifies an actual XRDP layout write/desktop observation through the private
native/Node path. The helper does not render resized frames in a browser, exercise
physical keyboard/buttons/wheel, or establish Windows-server acceptance. It checks
IDR and encoded dimensions; existing native codec fixtures separately decode
resized pictures. The 30-minute desktop/resize soak and DVC resource audit remain open.

Separate actual Edge regression (initial 1080p, no browser layout requests):
H.264/reset **47 rendered frames**, one decoder reset, cursor replay/reattachment;
JPEG **46 rendered frames**, cursor replay/reattachment. Each helper sent only
one motion and one reset; existing browser rendering and cleanup remained passing.
These regressions do not establish resized-browser rendering.

Ignored logs: `build/display-ipc-{unit,supervisor,native-build,foundation,pnpm-check,
pnpm-final,ack-narrow,xrdp-final,browser-h264,browser-jpeg}.log`.

## Retained next block

SessionManager/NativeSessionWorker forwarding, current control-lease authority,
public display info/resize events and replay, browser `display.resize.request`,
logical/device scale policy, and media config/discontinuity/ACK/generation ownership.
In-flight old frames and coordinate/cursor state require explicit browser integration
before enabling the public command. Global usable `rdp` remains false and TODO
Stages 3/4/5/9 remain open. No original requirement is removed.
