# Native AVC encoder

The first software provider implements MEDIA_PIPELINE section 4 and ADR-003:
encoding stays in C++, before Node. This block is verified on Windows x64.
Browser media negotiation still supports JPEG only. A bundled codec provider
does not imply a usable AVC transport or a completed interactive desktop.

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

## Remaining integration

AVC capture/force-IDR IPC, RWB1 config/access-unit forwarding, codec negotiation,
WebCodecs support checks/rendering and predictive backpressure recovery remain
pending. Hardware auto/prefer/off selection and encoder timing instrumentation
are also pending. Linux integration and actual XRDP → AVC → browser validation
have not run. See ITERATION_006.md for the accepted native test evidence.
