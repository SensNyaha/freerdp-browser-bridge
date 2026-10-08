# Iteration 12: independent cursor extraction and browser overlay

Native/IPC implementation commit: `ec828d1`.

Requirement: SPECIFICATION §2.4, MEDIA_PIPELINE cursor handling, PROTOCOL cursor
events and ADR-004. The user accepted current screen responsiveness and asked to
continue the development algorithm; this block completes the next Stage 4 cursor
items without introducing additional video performance tuning.

The pinned public FreeRDP pointer callbacks now extract bounded RGBA shapes,
hotspot, visibility and server position. One native current shape and one Node
snapshot are retained. A separate capability and bounded private cursor class
reach a separate RWB1 shape stream; its sequence and writes are independent of
video ACK/credit. The reference harness renders one transparent overlay with
immediate local motion, scaled hotspot, hide/default and detach cleanup.
See [wire contract, memory bounds and gaps](CURSOR.md).

Verification on Windows x64, 2026-10-08:

- Narrow Node cursor/parser and actual Edge DOM tests: 3/3 passed. Bounds,
  malformed metadata, owned pixels and binary shape framing are tested separately
  from overlay transparency, CSS scale, hotspot, sequence rejection and disposal.
- Fake-backend HTTP/WebSocket suite: 14/14 passed, including independent cursor
  and video sequence/credit, current-state replay, media reattachment, legacy
  opt-out and isolation of malformed/replayed backend cursor updates and changed
  geometry under the same shape identity. These are not RDP
  integration tests.
- Foundation CTest: 2/2 passed. Linked bundled CTest: 5/5 passed, adding native
  cursor state/parser and public FreeRDP mask conversion tests. Color row
  orientation/alpha, mono transparent/invert fallback, truncation and image bounds
  are covered. Build uses MSVC /W4 /WX and /analyze; touched C++ is clang-formatted.
  Bundled totals: 17 IPC/input/state cases / 195 assertions, 2 AVC cases / 19,
  2 pointer conversion cases / 11, 1 JPEG case / 13, 4 H.264 cases / 206.
- Linked `pnpm check`: build, lint and formatting passed; 73/73 Node tests passed.
  Native ZIP relocation test passed 1/1 with private FreeRDP/ZLIB and no
  dependency PATH. Node still receives cursor pixels only, never raw desktop frames.
  A later parallel repeat after cleanup/identity hardening hit fixture deadlines
  in Edge, the expanded negative WS scenario and MSVC setup. No production
  transport/session deadlines were extended. The final verification runs all
  files sequentially to avoid simultaneous browser, compiler and native lifecycle
  fixture startup. Initially appending `--test-concurrency=1` after file arguments
  did not configure the Node runner; the workspace test command now places the
  option before all files, so ordinary `pnpm check` uses the intended ordering.
  The Edge timeout was subsequently localized to `browser.close`, after all
  cursor assertions had completed. Explicit page closure and HTTP connection
  cleanup passed a direct isolated run in 3.2 seconds, but graceful browser
  shutdown under pnpm still exceeded the original 15-second total fixture budget.
  Its total budget is now 45 seconds to include Windows process cleanup;
  launch/navigation remain bounded to five seconds and operations to three.
  Timeout phase is recorded. The existing 30-second MSVC fixture deadline is
  retained; its isolated pnpm run passed in 8.9 seconds. These fixture budgets
  do not change production/session/input/media deadlines.
  The final correctly ordered ordinary `pnpm check` passed all 73 tests with
  zero failures, cancellations or skips in 179.7 seconds. Edge cursor passed
  in 8.9 seconds and MSVC setup in 8.7 seconds in that run.
- Actual authorized XRDP plus Edge: 1920×1080 H.264 rendering passed; the initial
  desktop supplied no custom shape before motion. One motion caused three native
  cursor state updates and one custom shape, received by the browser. The helper
  now requires a custom shape within three seconds and another shape after
  browser detach/reattach, verifying cache replay without requiring a new server
  shape. This stricter run passed, with 64 video frames, zero decoder resets,
  one pointer move, input release reset and clean worker/runtime shutdown.
  No buttons, wheel or keys were sent to the operational lab desktop. Live visual
  artifacts stay in ignored `.local-tests/`; no lab credentials enter commits.

The exact XOR appearance of mono invert pixels remains unsupported: the pinned
converter emits its checker fallback. Linux, Windows RDP server, actual large
and palette cursor negotiation, modern GFX/dynamic resize and the complete
30-minute desktop acceptance remain open. The usable-desktop capability remains
false. Stage 4 as a whole is not claimed complete.
