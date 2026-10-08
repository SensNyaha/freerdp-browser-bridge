# Iteration 9 — scene latency, SIMD dispatch and bounded update batches

Date: 2026-10-08. Implements MEDIA_PIPELINE §4, PERFORMANCE §2.3/8 and
ADR-003 without changing the native framebuffer ownership or render-credit model.
Addresses reported previous-scene remnants and slow tile-by-tile scene replacement.
This is a Windows performance correction; the Stage 4/10 acceptance gates remain open.
Implementation and verified tests: build correction `be42b9d`, media correction `06233ce`.

## Findings and implementation

The pinned FreeRDP 3.32.1 transport_check_fds reads one PDU per call and signals
its reread event when more bytes are available. The bridge previously checked it
once per loop and could encode before reading subsequent queued updates. It now
drains ready FreeRDP handles before capture, bounded to 8 ms or 256 checks, and
services input before/after the batch. Stop, disconnect and read/wait failures
terminate the batch. A single expensive check can exceed 8 ms. This coalesces
already received updates; it cannot make server/network tile delivery atomic.
FreeRDP itself resets GDI ninvalid in update_begin_paint; that was not the defect.

The OpenH264 upstream Windows Meson branch built NASM objects but omitted X86_ASM
from C++ compilation. Its CPU detector therefore returned zero and selected scalar
functions. Release /O2 was present, so debug compilation was not the cause.
The overlay adds matching C++ X86_ASM/HAVE_AVX2 and NASM HAVE_AVX2 definitions on
Windows x86/x64. Selection remains runtime CPU gated; AVX2 is not required.
The new patch and SHA-256 provenance are included in the relocated package.
OpenH264 remains pinned to 2.6.0#4. Linux is unchanged and unverified here.

The encoder supports 1–4 threads, default 4, with fixed-number slices and one
reference. Small surfaces (<320 wide or <192 high) retain a single slice/thread.
Bitrate, colour conversion, no-B-frame/no-skip policy and recovery remain unchanged.
No transmitted predictive access unit is discarded, and no raw image enters Node.

## Measurements

Machine: Intel Core Ultra 7 255H, 16 reported logical processors; Windows x64,
MSVC 19.44 Release /O2, OpenH264 2.6.0. Each benchmark row is one run of the
same 40-frame 1920×1080 deterministic dense grid, moving window and scene changes.
Pixel generation is outside measured encoding. Lazy initialization is included.
These are encode measurements, not sustained browser FPS or network guarantees.
Thermal/scheduling variation is not controlled; this is not a CI performance gate.

| Provider build / threads | Encode mean, ms | Encode p95, ms | Compression p95, ms | Encoded bytes |
|---|---:|---:|---:|---:|
| Old scalar / 1 | 138.006 | 192.802 | 187.626 | 189435 |
| Old scalar / 2 | 86.258 | 110.105 | 94.057 | 189112 |
| Old scalar / 4 | 63.780 | 73.592 | 68.645 | 190224 |
| SIMD / 1 | 23.181 | 28.021 | 21.830 | 189435 |
| SIMD / 2 | 22.616 | 36.606 | 22.059 | 187796 |
| SIMD / 4 | 20.072 | 26.326 | 15.314 | 189369 |

Local reproduction after a bundled build: `build/bundled/h264-benchmark.exe`.
The benchmark is test-only and is not installed in the native package.
BGRA conversion and packetization are separately timed; SIMD/4 conversion p95
was 9.232 ms. Additional conversion tuning remains possible after measurement.

An earlier SIMD run under a different host load measured 43.351 ms p95 at four
threads. The table records the final fully recompiled provider run; variation
reinforces that these samples are not an FPS guarantee.

The relocation probe exposed stale caller ABI objects: Ninja's old /showIncludes
prefix was decoded as OEM text even though the installed Russian MSVC emitted
UTF-8. The runtime probe object listed zero header dependencies and predated the
EncoderOptions change. CMake now probes the actual installed language with explicit
UTF-8 decoding, rejects invalid encoding and supplies the matching Ninja prefix.
No English language pack or global locale change is required. Full recompilation
restored the 32×16 probe; Ninja now lists 110 project/dependency headers including
video_encoder.hpp and avc_decode_probe.hpp. Small-surface decode regression tests
also cover 16×16, 32×16, 64×32, 128×64, 320×194 and 640×194.

Actual read-only XRDP → private IPC → WS → Edge runs used the existing authorized
local helper and fingerprint. Each ran 15 seconds after first image, including
initial desktop updates and encoder startup; reattachment and input move/reset
also passed. No clicks, wheel or keyboard actions were sent to the operational desktop.

| Worker | Encodes | Encode mean, ms | Encode p95, ms | Max encode, ms | Edge decode/draw p95, ms | Max read batch |
|---|---:|---:|---:|---:|---:|---:|
| Before | 45 | 159.863 | 474.918 | 1506.348 | 2.6 | 1 |
| Intermediate SIMD build | 50 | 44.612 | 90.458 | 102.554 | 4.9 | 16 |
| Final tracked build, SIMD/4 | 47 | 34.841 | 84.861 | 131.718 | 2.4 | 15 |

The intermediate build preceded the stale-header fix; its default caller thread
setting was not verified and is not used as final four-thread acceptance evidence.

These live runs do not replay identical server scenes and are supporting evidence,
not a controlled before/after scene benchmark. Encodes depend on dirty revisions;
dividing their count by duration does not establish maximum FPS.
The real p95 is still above the PERFORMANCE 40 ms bridge budget, which also
includes forwarding/queue delay. The reported user's precise scene transition
requires manual comparison; absence of every possible artifact is not established.

## Diagnostics and regression coverage

Private capability-gated IPC exposes eight counters/timings, exactly 64 bytes,
with a fixed 128-sample encode p95 ring. Browser decode/draw timings also retain
at most 128 samples. No identity, credentials, pixels or input values are recorded.
See [IPC_FOUNDATION.md](IPC_FOUNDATION.md) for the additive wire contract.

Native tests check 64 queued scene tiles become one complete latest-state batch,
time/count bounds, stop/read failure, fixed IPC lengths before allocation and ring
eviction. H.264 tests decode 30 moving-window/scene-change frames at each of
1/2/4 threads and sample the former window location, requiring restored background
luma rather than retained old content. Existing padded stride, IDR, GOP, resize
and malformed-input tests remain in place.

## Verification

- Build dependency correction: commit `be42b9d`.
- `pnpm check`, linked profile: build/lint/format pass, 62/62 tests pass.
- Foundation Node profile: 55 pass, 7 linked-only tests skipped. The initial
  concurrent runs timed out in fake media tests; the sequential rerun passed
  with unchanged deadlines. This is not a claim about measured queue latency.
- MSVC /W4 /WX /analyze: foundation CTest 2/2, linked CTest 4/4. Native IPC:
  15 cases / 174 assertions; AVC: 2 / 19; JPEG: 1 / 13; H.264: 4 / 206.
- Relocation under a path containing spaces with dependency PATH removed:
  native AVC/JPEG/ZLIB roundtrips pass, and both overlay patch hashes match.
- Actual final H.264 lab check: 1920×1080 rendering, zero decoder resets,
  reattachment, one pointer move and release reset pass; runtime directory empty.
- Final explicit decoder-error recovery: 49 rendered AVC frames, exactly one
  reset, fresh attachment and clean shutdown pass. Encode p95 30.118 ms and
  Edge decode/draw p95 1.7 ms in this different live workload; it does not replace
  the plain-run comparison or establish the full bridge latency budget.
- Final JPEG fallback: 58 rendered frames, encode p95 9.554 ms, Edge decode/draw
  p95 19.3 ms, reattachment and clean shutdown pass. Input remains motion/reset only.

## Remaining acceptance

Controlled interactive scene replay, queue delay, time-to-first-frame, idle CPU,
RSS, sustained scroll FPS/bitrate, five-minute congestion, concurrent sessions,
30-minute interactive soak, Linux and other browsers are still pending. This
iteration does not check off those requirements or enable the full RDP capability.
