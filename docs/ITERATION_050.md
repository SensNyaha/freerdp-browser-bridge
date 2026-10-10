# Iteration 50 — bounded PCM IPC and browser record codecs

Date: 2026-10-10. Implements the codec portion of SPECIFICATION §2.6,
PROTOCOL §4/6 and MEDIA_PIPELINE §6/8 under ADR-008's bounded-queue policy.
Continues native packetization `ff49604` (iteration 49).

Native and TypeScript use the same schema-1 config (20 bytes) and PCM packet
(24-byte metadata + 3,840 S16LE stereo samples). Exact envelope lengths are checked
before allocating a body. Epoch, frame/silence accounting, reserved fields, clock
overflow and zero-filled silence tail are checked before transport copying.

RWB1 stream 3 config/PCM encoders preserve worker timestamps, refuse mismatched
epochs and sequence overflow, copy borrowed PCM and mark new attachments
discontinuous. Public packet payloads contain only sample bytes. Worker selection,
advertised capability, audio scheduling, Node backpressure and AudioWorklet remain
open; no audible playback or end-to-end transport acceptance is claimed.

Independent native/TypeScript golden vectors and all truncations are covered;
native paced PCM is encoded without sample conversion. Fuzzer dispatch and seeds
include audio, but local Clang/sanitizer/fuzzer execution is still unavailable.

Verification: IPC **31 cases / 4,479 assertions**, Node audio codec **4/4**.
Foundation CTest **5/5**, bundled **13/13**, /W4 /WX /analyze.
pnpm check with bundled worker **145/145**, no skips/cancellations, **118.69 s**.
The separate foundation-worker run passes **138**, with **7** explicitly skipped
FreeRDP-only integration tests; these are exercised in the bundled run.
clang-format, whitespace checks and audio corpus generation pass. Ignored logs:
`build/iteration-050-*.log`. Other Stage 5/6, platform, resource and soak gates remain.
