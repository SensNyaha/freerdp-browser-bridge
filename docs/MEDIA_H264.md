# Native AVC encoder

The first software provider implements MEDIA_PIPELINE section 4 and ADR-003:
encoding stays in C++, before Node. This block is verified on Windows x64.
The worker/Node/WebSocket/WebCodecs path now renders actual 1080p XRDP in Edge.
The full usable-desktop capability remains false until cursor/input and the
remaining interactive acceptance gates pass.

## Provider contract

VideoEncoder consumes bounded BGRA8 with an explicit stride and worker-clock
timestamp in microseconds. SoftwareH264Encoder owns an OpenH264 context,
I420 conversion storage and an AVC packetizer. Output spans are valid until
the next encode; transport consumers must take their own bounded copies.
No raw frames cross into JavaScript.

Dimensions must be even, from 16x16 through 3840x2160. Missing pixels, insufficient
stride and non-increasing timestamps are rejected before encoding. BGRA is
converted to limited-range Rec.601 I420; the matching colour description is
written to SPS VUI. Alpha and row padding are ignored.

EncoderOptions accepts 1–60 FPS, 100,000–20,000,000 bits/s and 1–2-second GOP.
Defaults are 30 FPS, 4 Mbit/s and 2 seconds. These are encoder settings, not a
measured browser FPS guarantee. FPS scheduling/congestion control is separate
work. OpenH264 rate control uses the target/max bitrate fields; an instantaneous
transport byte budget is not enforced by the provider itself.

The provider uses screen-content mode, one spatial/temporal layer, Baseline
CAVLC, one reference, one thread and no B-frames. Frame skipping is disabled.
The first frame, resolution changes and explicit recovery requests force IDR.
A worker-clock deadline also forces IDR when a static interval would otherwise
stretch the GOP beyond two seconds. Resolution changes rebuild the encoder and
parameter sets. OpenH264 may insert additional IDRs on scene changes.
After a provider failure, the consumer must recreate the encoder
and restart from config/IDR before continuing a predictive stream.

## AVCC output

AvcPacketizer accepts one complete Annex-B NAL per append, including 3- or 4-byte
start codes. It rejects embedded start codes, forbidden-zero-bit violations,
SVC/unsupported NAL types and missing parameter sets or slice data.

SPS/PPS are extracted into an AVCDecoderConfigurationRecord with deterministic
profile/compatibility/level, four-byte NAL lengths and one SPS/PPS pair.
Parameter sets are bounded to 1,024 bytes each. Complete access units use
four-byte big-endian lengths, contain no Annex-B prefixes, and are bounded
to 8 MiB including length fields. Keyframe state comes from IDR NALs.
The provider cross-checks it against OpenH264's frame classification.

## Private dependency and reproducibility

OpenH264 2.6.0#4 is selected from the pinned vcpkg baseline. The checked-in
overlay copies that exact port and adds only a Windows NASM include-path fix.
Meson resolves the workspace alias to an absolute Unicode path, which Windows
NASM cannot use for includes. The patch calculates the relative include path
before constructing the NASM generator, retaining SIMD assembly.

The native package carries the OpenH264 DLL, copyright, overlay sources and
the applied patch SHA-256 in native-features.json. The relocated runtime probe
performs an actual BGRA → AVC → decoded I420 roundtrip and reports the loaded
DLL path. FreeRDP's WITH_OPENH264 decoder setting remains separate from this
outbound bridge provider.

## Capture, negotiation and records

CAPTURE_AVC/FRAME_AVC and the h264Capture HELLO bit are defined in
IPC_FOUNDATION.md. Native encoding remains lazy and runs on the RDP update
thread. JPEG and AVC share one pending capture. A new media attachment starts
from revision zero and force-IDR; static revisions otherwise produce no video.

Send the versioned media.hello envelope with data.codecs containing h264 and/or
jpeg, one or two unique entries. The server selects H.264 first when offered
and supported by the session backend; otherwise it selects JPEG when offered.
No supported codec produces MEDIA_NOT_IMPLEMENTED before media.ready.
Startup capability discovery shares the five-second negotiation deadline.

For H.264, media.ready reports codec=h264, maxFps=30, maxInFlight=1 and
maxPayloadBytes=8388608. A 34 ms native/poll interval keeps the ceiling below
30 FPS; this is not a measured motion/CPU performance guarantee. Returning render
credit schedules against the previous pull deadline, avoiding a second full
frame interval after decode. Slow consumers pause requests and coalesce RDP
revisions without dropping a transmitted predictive unit.

RWB1 VIDEO_CONFIG has schema u8=1, codec u8=1, width/height u16, reserved u16=0,
then AVCDecoderConfigurationRecord. VIDEO_ACCESS_UNIT carries the complete
AVCC access unit. Config uses DISCONTINUITY=2; IDR uses KEYFRAME=1, plus
DISCONTINUITY after config. Deltas use flags=0. Config precedes initial IDR,
dimension/config changes and decoder reset. Stream ID is 1; sequences start at
zero per attachment. Worker microsecond timestamps are preserved.

One unacknowledged access unit holds all credit. media.ack acknowledges that
unit's sequence after drawing and closing the decoded frame. The ACK deadline
is five seconds. WS encoded backlog is bounded to 8 MiB + 2,059 + 128 bytes;
the stored previous config is a small owned copy. Stale/replayed ACKs fail media.

## WebCodecs and recovery

The reference harness checks generic H.264 support before advertising it,
then checks the exact codec string/profile/level and description from config.
It configures VideoDecoder with optimizeForLatency and feeds timestamped
EncodedVideoChunks. VideoFrame output must match the pending timestamp and
display dimensions; it is drawn and closed in finally before credit returns.
The input queue allows at most three messages / 8 MiB + 8 KiB and one decode.

It does not flush after each frame: WebCodecs flush requires a keyframe on the
next decode. The behavior is defined in the [WebCodecs specification](https://www.w3.org/TR/webcodecs/).
This path is verified in Edge; other browser/decoder implementations may buffer
output differently and require separate low-latency acceptance.

A decode error or 1.5-second output deadline sends media.reset with the failed
access-unit sequence. The server consumes that credit once, clears the config
cache, and forces a new config/IDR even on an unchanged revision. At most three
resets are allowed per attachment. Invalid/stale resets or exhausted recovery
close media while preserving the RDP session. Reattachment uses fresh tokens
and a new independent config/IDR. The host can explicitly attach with
codecs=['jpeg'] when AVC is unavailable.

Hardware auto/prefer/off selection, dynamic congestion bitrate control,
encoder timing instrumentation, Linux integration, other browsers and the
30-minute interactive acceptance gate remain pending. See ITERATION_006.md
for native codec evidence and ITERATION_007.md for the actual browser path.
