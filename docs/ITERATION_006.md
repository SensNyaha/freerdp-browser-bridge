# Iteration 6 — private native H.264 software provider

Date: 2026-10-08. Implements MEDIA_PIPELINE section 4, native AVC packetization,
ADR-003 encoding before Node and ADR-010 private native dependencies.

The replaceable C++ VideoEncoder interface now has an OpenH264 software provider
with BGRA/I420 conversion, Baseline AVC, bounded output, 1–2-second GOP, force-IDR
and encoder/config reconstruction on resize. SPS/PPS and complete access units
are emitted as AVCC. Browser-facing media remains the verified JPEG path.

OpenH264 2.6.0#4 ships privately with its DLL and copyright. A version-controlled
overlay preserves the pinned upstream port and repairs Windows NASM includes
in Unicode workspaces without removing SIMD assembly. The package includes the
overlay and its patch checksum.

## Verification

- Dependency build passes in the actual workspace with Cyrillic and spaces.
- MSVC /W4 /WX /analyze: foundation and bundled builds pass.
- Foundation CTest: IPC and AVC; bundled CTest: IPC, AVC, JPEG and H.264.
- AVC packetizer: 2 cases / 19 assertions, including independent config/access-unit
  golden bytes, embedded start codes, unsupported NALs and aggregate 8 MiB bounds.
- Real OpenH264 encode/decode: 2 cases / 66 assertions. Padded red BGRA, changed
  pixels in a predictive P-frame, forced IDR, worker-clock GOP deadline, 1080p
  reconfiguration and decoding by a fresh independent attachment are checked.
  Invalid dimensions/options, source bounds and timestamp regression are rejected.
- pnpm check passes in foundation mode: 41 passing / 7 linked cases skipped.
  Bundled Node tests: 48/48 passing.
- Relocated bundle test passes with dependency PATH removed. Actual JPEG and
  AVC roundtrips and loaded DLL paths are checked; licenses and the packaged
  overlay checksum match the feature report.
- Native ZIP: approximately 5.6 MiB; installed files: approximately 14.1 MiB.
  These figures exclude Node.js, audio and future hardware providers.

The real XRDP/JPEG evidence remains in ITERATION_005.md. This iteration uses
synthetic frame data and a real native codec, not an actual XRDP AVC stream.
No browser AVC FPS, Linux acceptance or 30-minute interactive soak is claimed.

Contract: MEDIA_H264.md. Next block: bounded AVC IPC/media negotiation and the
reference WebCodecs decoder, including reattach/config/IDR recovery.

Implementation commit: eb4974e.
