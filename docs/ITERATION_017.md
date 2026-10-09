# Iteration 17 — native Display Control and confirmed GDI resize

Date: 2026-10-09. Scope: SPECIFICATION §2.3 / §2.10, MEDIA_PIPELINE §10,
ARCHITECTURE §4 and accepted ADR-003 / ADR-008 / ADR-009. Original requirements
retained. This completes a native foundation block, not end-to-end dynamic
resolution acceptance.

## Delivered

- Public DispClientContext binding through FreeRDP ChannelConnected /
  ChannelDisconnected, compiled-channel gating and synchronous RDP-thread
  ownership. Caps are server-negotiated, not inferred from plugin defaults.
  Connect failure, normal disconnect and RAII teardown remove callback ownership.
- Fixed-size native request state for one even-sized primary monitor,
  200..3840 × 200..2160, within the current AVC/JPEG provider intersection.
  The server monitor-area product includes monitor count and saturates safely
  for full-width u32 limits. Requests fail before the public sender can clamp
  dimensions. Scale/rotation/multimonitor remain retained work.
- One pending native layout request, a five-second deadline, unchanged/busy/
  unavailable/send-failure results and separate actual/requested dimensions.
  A write never reallocates GDI or changes desktop settings. Only a matching
  subsequent successful GDI observation clears pending confirmation. Zero
  server limits disable resizing while preserving the desktop connection.
- The shared server-resize guard bounds dimensions before actual gdi_resize,
  preserves the latest revision after its EndPaint flush and marks the entire
  new desktop dirty. Worker encoders reset after success, including same-size
  graphics resets, so the next lazy AVC encoder begins with IDR.
- Existing public paint/GFX fixtures now use gdi_GetDC before attaching their
  own window metadata. gdi_CreateDC already creates a window; replacing that
  pointer leaked the fixture's initial window allocation. This corrects test
  ownership, not the retained production RSS/resource gate.
- Windows foundation build helper now keeps Catch2 FetchContent paths on the
  temporary ASCII alias. MSVC had compiled Unicode paths but misread UTF-8
  absolute object names in the library response file. The helper's new
  foundation mode configures, builds and runs CTest through the existing
  static MSVC batch environment. Build fix commit: `d295264`.

Contract: [Display Control](DISPLAY_CONTROL.md). RWI1, HELLO and browser wire
contracts are unchanged. No browser dynamic-resolution capability is advertised.

## Verification

Windows x64 / MSVC C++20 `/W4 /WX /analyze`:

- Display public callback/request fixtures: **8 cases / 280 assertions**.
  Checks readiness ordering, independent layout fields, no settings mutation,
  geometry/provider boundaries, all three area factors/overflow, write failures,
  exact timeout boundary, unrelated/late observations, callback ownership,
  pending cancellation on zero caps, synchronous settings, wrong-thread rejection
  with an outstanding request and destructor/rebind cleanup.
  The transport write is a fixture; this is not an actual DVC/server test.
- New linked GDI resize narrow checks: **2 cases / 88 assertions**. Public GDI
  objects initialize a primary bitmap; actual gdi_resize frees/reallocates it.
  The test verifies EndPaint + resize revision ordering, complete dirty coverage,
  changed AVC config/IDR, existing/fresh decoder dimensions and bottom-right
  pixels, actual resized JPEG decompression and same-size dirty discontinuity.
  Invalid server extents preserve buffer dimensions/pointer/revision. This is
  not full gdi_init or remote desktop integration.
- Full linked GDI/GFX suite: **12 cases / 36,359 assertions**. Existing incoming
  AVC420 malformed/incomplete-command fixtures remain passing.
- Bundled CTest **8/8**; foundation CTest **3/3**. The new regular PowerShell
  foundation helper also passes **3/3** after reconfiguration.
- Bundled `pnpm check`: **76/76**, no skipped/cancelled tests, **62.5 s**; typecheck, lint
  and format pass. Native lifecycle, fake-worker/API and browser fixtures remain
  distinct from actual RDP integration. Sequential 100-worker cleanup passes.
- Private native ZIP relocation **1/1**, including actual private dependency
  loading and JPEG/OpenH264/FreeRDP AVC420 roundtrip probes.

Ignored logs: `build/display-{native-narrow,final-native,bundled,foundation,
foundation-helper,pnpm-check,relocate}.log`. The foundation log contains expected
upstream diagnostics from malformed GFX codec fixtures; all assertions pass.

## Separate actual XRDP / Edge regression

The existing authorized lab and exact session-only certificate fingerprint were
used. Credentials stayed in ignored local helper files and private IPC. Input
was limited to one motion and one release/reset; no keys/buttons/wheel were sent.

- H.264/reset: **37 rendered frames**, 1920×1080, configured ceiling 30 FPS,
  **1 decoder reset**, 38 encoded frames and 39 paints. Browser decoding,
  nonuniform pixels, one extracted cursor shape, replay and reattachment pass.
- JPEG: **36 rendered frames**, 1920×1080, configured ceiling 20 FPS,
  36 encoded frames and 37 paints. Nonuniform desktop pixels, one extracted
  cursor shape, cursor replay and browser reattachment pass.

Both helpers delete the session and check runtime cleanup. Logs:
`build/display-xrdp-h264.log`, `build/display-xrdp-jpeg.log`.
These regressions establish normal media connectivity with the new binding code.
They do not establish negotiated Display Control/GFX or a real server accepting
a changed monitor layout; no layout request was sent by these helpers.

## Retained work

Public per-session resize opt-in, HELLO/IPC negotiation and typed request/result
events, Node control-lease authority and deadlines, observed display/scale state
and replay, browser display.resize.request and actual XRDP/Windows layout
acceptance remain open. Input/cursor coordinates and pending media/ACK ownership
across a remote resize need dedicated integration checks. Multimonitor, rotation,
scale metadata, codec/DVC resource audit, Linux and 30-minute desktop soak remain
open. Stage 4 remains IN PROGRESS and usable `rdp` remains false.
