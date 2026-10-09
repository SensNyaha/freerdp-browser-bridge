# RWI1 foundation wire contract

This completes unspecified details of PROTOCOL.md §6 without changing its envelope.
All multi-byte fields and all lifecycle payload integers use network byte order (big endian).
The header is exactly 24 bytes: magic at 0, u16 version at 4, u16 kind at 6, u32 flags at 8,
u64 requestId at 12, u32 length at 20. Version is 1; flags must be 0. Unknown kind/version/flags
are fatal protocol errors. Request IDs correlate exactly one request/reply; replies echo the ID.

| Kind | Value | Payload |
|---|---:|---|
| HELLO | 1 | u16 minVersion, u16 maxVersion, u32 requiredFeatures (must be 0 in foundation) |
| HELLO_ACK | 2 | build report below, at most 4096 bytes |
| HEARTBEAT | 3 | empty |
| HEARTBEAT_ACK | 4 | empty |
| SHUTDOWN | 5 | empty |
| SHUTDOWN_ACK | 6 | empty |
| ERROR | 7 | u32 errorCode: 2 incompatible negotiation, 3 invalid lifecycle state, 4 media encode failure, 5 media/input not connected, 6 input queue full, 8 input paused during display transition |
| CONFIGURE | 8 | connection schema v1/v2/v3 below; maximum 2048 bytes |
| CONFIGURE_ACK | 9 | empty |
| SECRET | 10 | canonical UTF-8 password, no NUL, 0..4096 bytes |
| SECRET_ACK | 11 | empty |
| CONNECT | 12 | empty |
| CONNECT_ACK | 13 | empty; connection proceeds asynchronously |
| STATE | 14 | u16 state, u16 bridge reason, u32 native error; requestId=0 |
| CERTIFICATE | 15 | u64 challenge, u16 flags, 32-byte SHA-256; requestId=0 |
| CERTIFICATE_DECISION | 16 | u64 challenge, 32-byte SHA-256, u8 accept (0/1) |
| CERTIFICATE_DECISION_ACK | 17 | empty |
| CAPTURE | 18 | u64 last browser revision; zero forces an initial full image |
| FRAME | 19 | 24-byte metadata + 0..8 MiB JPEG; echoes CAPTURE requestId |
| CAPTURE_AVC | 20 | u64 last revision, u8 force-IDR (0/1), three reserved zero bytes |
| FRAME_AVC | 21 | 28-byte metadata + AVC config + access unit; echoes CAPTURE_AVC requestId |
| INPUT | 22 | exactly 12 bytes; [input layout](INPUT.md) |
| INPUT_ACK | 23 | empty; FreeRDP input API succeeded; echoes INPUT requestId |
| PIPELINE_STATS | 24 | empty; requires diagnostics capability |
| PIPELINE_STATS_ACK | 25 | exactly eight u64 counters/timings (64 bytes), described below |
| CURSOR_UPDATE | 26 | 40-byte metadata + optional RGBA8, maximum 589,864 bytes; requestId=0; [cursor layout](CURSOR.md) |
| DISPLAY_UPDATE | 27 | exactly 32 bytes, server-observed display/reset and negotiated limits; requestId=0 |
| DISPLAY_RESIZE | 28 | exactly u16 width, u16 height; one pending request per worker |
| DISPLAY_RESIZE_RESULT | 29 | u16 result, u16 reserved=0; echoes DISPLAY_RESIZE requestId |

HELLO_ACK: u16 negotiatedVersion (1), u16 capabilities (bit 0 lifecycle, bit 1 usable browser RDP,
bit 2 experimental connection core, bit 3 experimental JPEG capture, bit 4 experimental AVC capture,
bit 5 experimental basic input, bit 6 pipeline diagnostics, bit 7 experimental cursor,
bit 8 experimental configurable video quality, bit 9 experimental Display Control IPC).
Then seven strings: bridgeVersion, gitCommit, freeRdpVersion, targetFreeRdpVersion, os, arch,
transport. Each string has u16 byte length followed by UTF-8 bytes, maximum 256 bytes.
Empty freeRdpVersion means the worker is not linked to FreeRDP. Linked libraries alone never
set the usable RDP bit. Bundled builds set bits 2/3/4/5/6/7/8 and bit 9 when DISP is compiled,
not bit 1. Bits 3/4/5/6/7/8/9 require bit 2. Bit 9 is a private IPC implementation claim,
not remote negotiation or completed browser resize acceptance.
No trailing bytes or unknown mandatory bits are permitted.

Worker accepts HELLO exactly once, then HEARTBEAT and SHUTDOWN. Connection-core workers
also accept CONFIGURE once, SECRET once after configuration, and CONNECT once after SECRET.
Certificate decisions require the pending challenge/fingerprint. Incoming requests
have nonzero IDs; unsolicited events reserve ID zero. Wrong direction/state closes
the worker after a numeric ERROR where possible. Invalid envelopes/truncated records close it
with exit code 2 and a fixed diagnostic; input bytes are never interpolated into errors.

## Framed-stream fallback

Current tested Windows transport is inherited anonymous stdin/stdout pipes; stdout contains
only complete RWI1 records. stderr is separate and drained without forwarding raw diagnostics.
The same stream parser supports fragmented and coalesced records. Header validation happens
before allocation; there is at most one 24-byte header and one bounded body in the parser.
Node has a default cap of 32 pending requests and 64 KiB stream write backlog. Heartbeats are
not accumulated while another heartbeat is outstanding. Timeout/protocol violation kills the
worker and rejects pending requests; no request retries are implicit.

Worker EOF is a parent-death signal. Linux additionally uses PR_SET_PDEATHSIG. Node allocates
one private runtime directory with an exclusive non-secret ownership marker. Worker removes
only this marker and an empty directory on graceful exit/EOF; Node handles abnormal worker
cleanup. Sandboxes/spools and cleanup after simultaneous parent+worker hard kill remain later
work. Windows privacy currently relies on inherited user ACLs; explicit restricted ACL policy
is still required before multi-user production deployment.

On Windows, supervised workers use `detached: true` together with `windowsHide: true` and
retained IPC handles. This avoids libuv's parent-job teardown killing the worker before EOF
cleanup can run. Node still owns worker shutdown and awaits process close. Startup negotiation
has its own 10-second deadline; ordinary requests default to 2 seconds.

Linux SOCK_SEQPACKET is not implemented yet. Native lifecycle tests validate actual C++ process
integration, not RDP connectivity. FreeRDP channels/codecs/devices remain unsupported until
their separate build and integration gates pass. See CONNECTION_CORE.md for the
experimental connection slice, distinct from full usable browser RDP.

## Connection payload v1/v2/v3

CONFIGURE: u16 schemaVersion=1; three u16-length UTF-8 strings host (max 253 bytes),
username/domain (max 256 bytes each); u16 port, width, height, colorDepth;
u8 security (0 auto, 1 NLA, 2 TLS), certificate policy (0 strict, 1 prompt),
minimum TLS (2 for 1.2, 3 for 1.3), reserved=0; u32 connectMs and tcpAckMs.
Port is 1..65535; dimensions 1..7680 and 1..4320; depth 16/24/32;
timeouts 100..120000 ms. Strings reject NUL/noncanonical UTF-8. Host rejects
ASCII controls/whitespace. Trailing bytes and unknown/reserved values fail.

Schema v2 uses the same fields with schemaVersion=2, followed by exactly 12 bytes:
u8 h264Fps (1..30), u8 jpegFps (1..20), u8 jpegQuality (1..100), u8 reserved=0,
u32 targetBitrate and u32 maxBitrate in bits/s. Target is 100,000..20,000,000;
maximum is target..20,000,000. The Node mapper sends v2 only when quality settings
are supplied and HELLO advertises bit 8; otherwise it sends v1. New native workers
still accept v1 with defaults 30/20 FPS, JPEG quality 80 and both rates 4,000,000.
New Node readers accept older capability reports without bit 8; explicit quality
then fails before CONFIGURE/SECRET rather than being ignored. Older Node readers
that reject unknown capability bits must be upgraded with the native worker.
The RWI1 envelope and media records remain version 1. See [quality profiles](VIDEO_QUALITY.md).

Schema v3 contains the v2 fields with schemaVersion=3 and an additional u32 flags:
bit 0 enables session-authorized dynamic-resolution requests; all other bits must be zero.
Node sends v3 only for `display.dynamicResolution=true` and HELLO bit 9, supplying default
quality values when no quality override was given. Absent/false opt-in retains v1/v2 compatibility.
Native v1/v2 default to disabled; v3 with zero flags is also accepted. Explicit opt-in against
an older worker fails before CONFIGURE/SECRET. Upgrade Node and worker together because older
Node readers reject unknown mandatory HELLO bits. Automatic FreeRDP window-driven resizing
remains disabled; layout writes are performed by the RDP thread.

## Display Control payloads

DISPLAY_UPDATE offsets: u64 generation at 0, u64 framebufferRevision at 8, u16 actual width
at 16, u16 actual height at 18, u8 flags at 20 (bit 0 session opt-in, bit 1 negotiated and
observed Display Control ready), u8 reserved=0 at 21, u16 maxWidth at 22, u16 maxHeight at 24,
u16 reserved=0 at 26, u32 maxArea at 28. Both u64 values are nonzero. Actual dimensions use
the framebuffer ceiling 7680×4320. Negotiated limits are 3840×2160 with area 1..8,294,400;
all limit fields are zero when readiness is absent. Generation increments on successful
GDI resize/reset even when dimensions are unchanged. FramebufferRevision is the dirty revision
at that observation, not a continuously updated paint counter. Caps-only changes retain both
values and actual geometry. New generations require a strictly greater framebufferRevision.
Scale/rotation/multimonitor are not negotiated by this slice; layouts use fixed 100% scales.

DISPLAY_RESIZE geometry is checked on the RDP thread against negotiated caps and the current
provider intersection: even width 200..3840 and height 200..2160, within maxArea. Semantic
geometry failure is nonfatal. Results: 0 applied, 1 unchanged, 2 unavailable, 3 invalid,
4 busy, 5 send-failed, 6 timeout, 7 disconnected. A successful SendMonitorLayout is not a reply.
Only a subsequent matching successful GDI observation completes applied; its DISPLAY_UPDATE
precedes the result and further capture replies. No-op unchanged requires actual matching
dimensions with no pending request. Timeout after five seconds leaves actual state intact;
a late remote resize still publishes authoritative metadata. Teardown resolves queued/pending
requests as disconnected where the IPC transport remains writable.

One fixed request slot and one active confirmation are protected from concurrent IPC access;
they cannot both hold different requests. FreeRDP calls and observation stay on the RDP thread.
Tracked input is released before sending a layout. While a request is queued/active, new and
already queued non-reset input is rejected with ERROR 8; reset remains accepted. Rejected input
is never replayed after the transition. Node treats ERROR 8 as a nonfatal input operation error.
Resize IPC has a minimum 6.5-second transport deadline, separate from the ordinary two-second
deadline; heartbeat/shutdown remain independently serviced. A typed timeout does not fail the
worker. A missing reply or malformed/false applied result does fail IPC supervision.

`WorkerProcess.display`, its `display` event and `resizeDisplay(width,height)` are experimental
private host APIs. The public session attachment, control WS, browser scale/state replay,
media discontinuity and controller ownership integration remain pending; see [Display Control](DISPLAY_CONTROL.md).

STATE: 1 connecting, 2 awaiting-user, 3 connected, 4 closed, 5 failed.
Reasons: 0 none, 1 connection, 2 authentication, 3 certificate, 4 timeout,
5 protocol, 6 cancelled, 7 disconnected. Failed requires a nonzero reason;
other states require reason zero. Native error is an internal numeric diagnostic.

CERTIFICATE flags: bit 0 chain/server-purpose/validity verification failure,
bit 1 hostname/IP mismatch. No PEM, subject, username or secret is forwarded.
Decisions are consumed once and permit session-only trust. Persistent trust/TOFU
and changed-fingerprint history remain pending.

## JPEG capture payload

FRAME: u64 revision (nonzero), u64 monotonic timestampUs, u16 width, u16 height,
u8 codec (0 unchanged, 1 JPEG), three reserved zero bytes, then complete JPEG bytes.
Dimensions retain the connection bounds. Unchanged replies have exactly 24 bytes;
JPEG replies have 28..8388632 bytes and SOI/EOI markers. Header limits are checked
before allocation. Native JPEG encoding has a fixed 8 MiB destination and disallows
provider reallocation. An overflow/provider error returns ERROR 4, without terminating
the RDP session. A connect/disconnect race returns ERROR 5.

There is at most one CAPTURE pending in Node and native code. The RDP thread owns
paint revisions and reads/encodes the current BGRA framebuffer after processing updates;
there is no raw-frame queue. The worker enforces a 50 ms minimum interval. A fresh
attachment requests revision zero; subsequent requests pass its last received revision.
Equal revisions return only metadata. Resize increments revision. See MEDIA_JPEG.md
for browser credit and RWB1 framing; H.264/cursor/GFX acceptance remains separate.

## AVC capture payload

FRAME_AVC: u64 revision (nonzero), u64 monotonic timestampUs, u16 width, u16 height,
u8 status (0 unchanged, 1 delta, 2 IDR), u8 reserved=0, u16 configLength,
u32 accessUnitLength, then config and access-unit bytes. Unchanged replies have
exactly 28 bytes and zero lengths. Changed replies contain the bounded AVCC
configuration and length-prefixed complete access unit from MEDIA_H264.md.
Config is at most 2,059 bytes; access unit at most 8 MiB. The header permits
28..8,390,695 bytes, checked before allocation.

Dimensions are even, 16..3840 by 16..2160. Node validates parameter-set lengths,
profile fields, NAL lengths/types/count (maximum 1,024), forbidden bits, absence
of embedded Annex-B start codes and IDR/status agreement. It forwards only
encoded data. New viewers and explicit reset request force-IDR even when the
desktop revision is unchanged. Codec failure returns ERROR 4, drops the native
predictive encoder and preserves RDP; the next encoder starts independently.

JPEG and AVC share one pending request across codecs. All encoding runs on the
RDP thread. AVC uses a 34 ms minimum interval; the event wait wakes at the pending
frame deadline. No attachment means no requests or encoding. Capture revision
zero also forces initial IDR. Browser delivery/recovery is defined in MEDIA_H264.md.

## Bounded pipeline diagnostics

PIPELINE_STATS is available after HELLO on linked workers, including before connection.
It returns lifetime RDP check count, dirty paint count, encoded-frame count, encode mean
microseconds, recent encode p95 microseconds, lifetime encode maximum microseconds,
maximum checks per read batch and maximum read-batch microseconds, in that order.
All fields are big-endian u64; Node rejects unsafe integers and inconsistent bounds.
The p95 uses nearest rank over at most 128 recent encodes. Encoding includes lazy
provider initialization and pixel conversion, excludes IPC serialization/write and
unchanged captures. No pixels, host, user, certificate or input values are included.
Foundation workers do not advertise diagnostics; this is private IPC, not a browser endpoint.

Before capture, the worker drains ready FreeRDP handles for up to 8 ms or 256 checks.
One expensive FreeRDP check can exceed the time budget. Media/input wakeups are excluded
from the ready test; input is serviced before and after the bounded batch. Capture then
samples the latest GDI state. This coalesces already received tiles without waiting for
network packets that have not arrived, and does not drop transmitted predictive units.
