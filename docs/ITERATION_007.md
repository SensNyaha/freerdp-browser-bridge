# Iteration 7 — AVC worker transport and WebCodecs

Date: 2026-10-08. Implements MEDIA_PIPELINE sections 3–5, PROTOCOL RWB1 AVC
records and ADR-003 encoding before Node. The primary AVC path now renders
real 1920x1080 XRDP in Edge. JPEG remains an explicitly selectable fallback.

Native CAPTURE_AVC/FRAME_AVC records and the h264Capture capability extend the
existing negotiated IPC. AVC has explicit length/config/classification checks
before forwarding, plus bounded allocation. All encoding stays on the RDP
thread. New viewers and decoder resets request a fresh IDR even on static
desktop revisions. The RDP loop wakes at pending frame deadlines.

The WebSocket negotiates only codecs actually supported by the trusted session
backend. A backend without media now reports MEDIA_NOT_IMPLEMENTED before
media.ready. Render ACK grants one access-unit credit. Congested viewers stop
capture requests; desktop changes coalesce. AVC scheduling uses a 34 ms deadline
from the last pull, avoiding an additional full interval after decoding.

The harness checks generic and exact WebCodecs configurations, serializes at
most three inbound messages, and feeds one timestamped chunk. It draws/closes
VideoFrames before ACK. Decode failure requests a sequence-bound reset; native
returns new config/IDR. Recovery is limited to three attempts, without closing
the underlying RDP session. Reattachment uses new scoped tokens and a fresh
independent decode chain.

## Verification

- MSVC /W4 /WX /analyze: foundation and bundled builds pass.
- Native: 8 IPC cases / 119 assertions, 2 AVC / 19, 1 JPEG / 13 and 2 H.264 / 66.
  Foundation CTest passes both targets; bundled passes all four.
- Bundled pnpm check: 52/52 tests; TypeScript build, lint and format pass.
- Foundation Node profile: 45 passing / 7 linked-connection tests skipped.
- Independent AVC IPC/RWB1 vectors cover lengths, parameter sets, keyframe
  agreement, embedded Annex-B rejection and NAL-count/allocation bounds.
- Explicit fake media tests cover codec negotiation/JPEG fallback, one-frame
  credit, static revisions, resize config/IDR, stale/reset limit rejection,
  missing forced IDR and provider-failure isolation.
- Actual XRDP → native H.264 → WS → Edge canvas: 1920x1080, 7 rendered frames /
  182,297 AVC bytes in the initial successful check; image variation and
  reattachment to the same RDP session pass.
- Actual decoder-fault check: the test injects one damaged EncodedVideoChunk,
  then verifies 10 rendered frames / 149,094 AVC bytes, exactly one reset and
  successful reattachment. This is a real WebCodecs/native encoder recovery,
  not a fake desktop.
- Follow-up with 15 seconds for remote login/painting: 43 rendered AVC frames /
  857,621 bytes, exactly one decoder reset and successful reattachment. The
  actual remote application desktop was visually inspected after login;
  the earlier short checks could capture activation/login screens.
- JPEG regression: 21 rendered frames / 3,068,418 JPEG bytes, image variation
  and reattachment pass. These separate runs are not a codec/FPS benchmark.
- Relocation test passes with private JPEG/AVC DLLs, licenses and no dependency
  PATH. The native ZIP remains about 5.6 MiB / 14.1 MiB installed, excluding Node.

Lab helpers read only the authorized ignored credentials and accept the
previously user-approved exact certificate. No remote keyboard/pointer commands
are sent. Screenshots remain ignored .local-tests/xrdp-browser*.png.

## Remaining gates

The advertised AVC ceiling is 30 FPS, not a measured sustained motion rate.
Encode/queue timing and motion/bitrate benchmarks, hardware selection, adaptive
congestion, cursor/input/audio, modern GFX, actual dynamic RDP resize, Linux/
other browsers and the 30-minute interactive gate remain pending. Full usable
rdp capability stays false. Shared inherited-pipe priority scheduling remains open.

Contracts: MEDIA_H264.md, MEDIA_JPEG.md, IPC_FOUNDATION.md and SESSION_API.md.

Native/IPC implementation commit: 5d3596a.
