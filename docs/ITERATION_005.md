# Iteration 5 — native JPEG and browser transport

Date: 2026-10-08. Implements SPECIFICATION 2.3, MEDIA_PIPELINE diagnostic fallback,
ADR-003 encoding before Node and ADR-010 private native dependencies.

Headless classic GDI paint/resize callbacks now maintain a desktop revision.
One pull request encodes the latest framebuffer inside the worker; equal revisions
return metadata only. JPEG output is capped at 8 MiB with provider reallocation
disabled. Native and WebSocket requests are bounded to one frame. Browser render
ACK returns credit; slow viewers pause encoding and coalesce changes. Invalid/missing
ACK and provider errors close media without closing the RDP session.

Private vcpkg adds libjpeg-turbo 3.2.0#1 and its libspng 0.7.4#1 dependency. Runtime
DLLs and licenses ship in the native ZIP. The relocation probe encodes/decodes JPEG
and reports the loaded TurboJPEG module path, checked inside the relocated bundle
with dependency PATH removed. Current native archive: 5,459,296 bytes; installed
files: 13,949,393 bytes. Node.js and future AVC/audio providers are excluded.

## Verification

- MSVC /W4 /WX /analyze: foundation and bundled builds pass.
- CTest: 7 IPC cases / 113 assertions, plus 1 JPEG case / 13 assertions in bundled.
- Bundled pnpm check: 48/48 Node tests; build, lint and format pass.
- Foundation profile: 41 passing / 7 linked-connection cases skipped.
- Unit vectors independently check FRAME/RWB1 byte order and allocation bounds.
- Explicit fake media tests verify one frame of credit, static suppression,
  latest revision, resize config, stale ACK, provider isolation and ACK deadline.
  Registry unit tests reject pending delivery and new requests from released leases.
- Actual XRDP local capture: 1024x768, 41 requests, 6 changed / 35 unchanged,
  695,067 JPEG bytes; heartbeat and cleanup pass.
- Actual XRDP → C++ JPEG → local authenticated WebSocket → Edge canvas:
  1920x1080, 18 images / 2,606,935 JPEG bytes in the initial check, actual canvas
  image variation verified. Screenshot is ignored .local-tests/xrdp-browser.png.
  Credentials stay in the authorized ignored lab file and private worker IPC.
- Follow-up actual browser check: 26 images / 4,054,642 JPEG bytes, still connected;
  fresh control/media tokens reattach to the same native session and render a new full frame.
- Relocation test passes; dependency audit reports no known vulnerabilities.

The actual test uses the already user-approved exact certificate fingerprint.
It sends no keyboard, pointer or other remote application input.

## Remaining gates

The JPEG fallback is working, but Stage 4 is not accepted as a complete desktop.
H.264 provider/AVCC/WebCodecs, cursor, input/audio, modern GFX, actual dynamic resize,
configurable FPS/quality and encode/queue latency instrumentation remain pending.
No Windows RDP server, Linux integration, sanitizer/fuzzer execution or 30-minute
interactive desktop soak is claimed. Shared-pipe priority scheduling is pending.

Contracts: MEDIA_JPEG.md and IPC_FOUNDATION.md. Test entry point:
scripts/test-xrdp-viewer.mjs with the previously verified fingerprint.

Implementation commits: 50fb8b0 (native/IPC/private JPEG), d08777b
(WebSocket credit, reference canvas and real browser test).
