# Experimental JPEG browser path

This is the diagnostic fallback required by MEDIA_PIPELINE.md, not a replacement for
the primary H.264/WebCodecs path. It is verified on Windows x64 with the authorized
XRDP lab, including actual browser rendering at 1920x1080.

## Frame ownership and bounds

Headless FreeRDP GDI uses BGRA32. BeginPaint clears the invalid-region marker;
EndPaint increments revision when the GDI invalid union is nonempty. Initial
activation and successful resize also increment revision. Encoding runs on the
same thread as RDP updates, so it reads the authoritative framebuffer without a
second raw-desktop buffer. Current tracking is a dirty-union/revision check;
explicit rectangle accumulation and partial-region encoding remain pending.

CAPTURE/FRAME are documented in IPC_FOUNDATION.md. A request holds only the latest
revision, with one request in flight and a native ceiling of 20 FPS. No browser
attachment means no encode requests. An unchanged desktop sends no JPEG/browser
video record. The provider is libjpeg-turbo 3.2.0, quality 80, 4:2:0, fast DCT.
The fixed native JPEG destination is 8 MiB; overflows fail media rather than RDP.
This bounds output, not the separately bounded FreeRDP framebuffer allocation.

The browser transport also permits one unacknowledged video frame, polls no faster
than once per 50 ms, and shares the media backlog limit of 8 MiB + 2,059 + 128 bytes.
It stops requesting while waiting for browser acknowledgement. If decoding/rendering
is slow, RDP updates are coalesced until credit returns; the next image uses the
latest revision. JPEG frames are independent keyframes, so no predictive chain needs
repair. Missing render ACK and initial negotiation each have a 5-second deadline.
Media failure/invalid ACK closes the attachment and preserves the RDP session.

## Negotiation and records

The existing scoped token, exact Origin allowlist and freerdp-bridge-v1 subprotocol
requirements apply. Browser inbound messages remain bounded to 4 KiB / 32 per second.
After upgrade, send:

```json
{"v":1,"type":"media.hello","data":{"codecs":["jpeg"]}}
```

The server replies with the ordinary server envelope, type media.ready, data
codec=jpeg, maxFps=20, maxInFlight=1, maxPayloadBytes=8388608. Errors use media.error
with a fixed code. Negotiation also supports H.264; an explicit JPEG-only offer
keeps this fallback. This experimental
capability appears as jpegCapture=true; usable-desktop rdp remains false.

Binary records use the existing 28-byte RWB1 envelope, network byte order.
StreamId is 1. Sequences start at 0 per attachment and increase across configs
and access units. Timestamps come from the worker monotonic clock.

VIDEO_CONFIG (type 1, DISCONTINUITY flag 2) has an 8-byte JPEG config:
u8 schema=1, u8 codec=2 (AVC uses 1), u16 width, u16 height, u16 reserved=0.
It precedes the initial image and every dimension change.

VIDEO_ACCESS_UNIT (type 2) contains one complete JPEG, with KEYFRAME flag 1 and
DISCONTINUITY flag 2 after configuration. After decoding, drawing and closing the
ImageBitmap, acknowledge the access-unit sequence, not the config sequence:

```json
{"v":1,"type":"media.ack","data":{"sequence":1}}
```

ACKs are connection scoped and accepted exactly once. Premature, duplicate or
incorrect ACKs fail the media attachment. Text ACKs are this JPEG credit extension
to the otherwise binary media stream. Session state and certificate events stay
on control WS.

## Reference harness and local test

apps/reference-harness contains a minimal same-origin consumer. The hosting app
creates the authenticated session and calls window.bridgeViewer.attach(created).
The harness displays certificate decisions, decodes each JPEG with createImageBitmap,
checks actual dimensions, draws to canvas and closes the bitmap before returning
credit. It keeps one decode active and closes on malformed media.

scripts/test-xrdp-viewer.mjs serves those static files on 127.0.0.1:47999, creates
an authenticated native session using the ignored local lab credentials, and runs
headless Edge through pinned Playwright core on Windows. It accepts only the supplied,
previously approved fingerprint. No credentials enter browser/worker argv or env.
The test verifies image variation, 1080p dimensions, clean close and empty runtime;
the canvas artifact stays in ignored .local-tests/xrdp-browser.png. The test does
not configure production authentication or publish anything outside the machine.

Run after Node and bundled builds:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-xrdp-viewer.mjs sha256:<verified-fingerprint>
```

For a visible interactive window that remains open, add a codec and `--manual`:
`scripts/test-xrdp-viewer.mjs sha256:<verified-fingerprint> h264 --manual`.
See [manual Windows launch commands](DEVELOPMENT.md). This explicit mode enables
keyboard/buttons/wheel and cleans up when the user closes Edge or presses Ctrl+C.

Linux browser execution requires an installed compatible Chromium and has not been
verified. The default API CLI still has no authenticated connection backend.
See ITERATION_005.md for actual test evidence.

## Open acceptance work

Codec/hardware selection, configurable quality/FPS,
cursor extraction/overlay, input, audio, modern GFX, negotiated dynamic resize and
encode/queue latency instrumentation remain pending. Classic paint/resize callbacks
are wired, but current XRDP checks do not prove a dynamic resize. No 30-minute
interactive Windows/XRDP soak gate is claimed. Large image records can still delay
other records on the shared inherited output pipe; priority scheduling is pending.

H.264/AVCC worker transport and WebCodecs are now verified on Windows/XRDP;
see MEDIA_H264.md. The harness prefers H.264 when supported and keeps an explicit
JPEG fallback. The local lab script accepts an optional jpeg/h264/h264-reset mode.

Protected `/metrics` now reports JPEG capture/write/render-credit durations separately
from AVC. Changed-frame captures and unchanged polls use different histogram stages.
See [metric definitions](SESSION_API.md); full dirty-revision/queue latency remains open.
