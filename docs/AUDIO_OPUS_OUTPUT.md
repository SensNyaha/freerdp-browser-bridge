# Explicit Opus output queue and dispatcher mode

Iteration 79 (2026-10-11) prepares SPECIFICATION §2.6, MEDIA_PIPELINE §6 and
ADR-008. `OutputQueue` and `OutputDispatcher` accept an explicit immutable
`OutputAudioCodec::opus` at construction. Default construction remains PCM,
including the production worker. No capability/settings/public selector changes.

Opus mode validates enabled source state, config and kind-36 packets using the
bounded codec-1 parsers before copying storage; PCM records are refused. PCM mode
continues refusing enabled Opus records. Disabled all-zero source descriptors are
shared. Header request correlation, first discontinuity, increasing config epoch,
global PTS progress and ordinary 20-ms intervals remain unchanged.

The same audio config and packet slots are reused; no lane/record capacity is
added. Control FIFO still precedes audio config/packet, then cursor and video.
An occupied **Opus** packet slot returns full without replacing data or advancing
admission clock. Rewriting a compressed packet's discontinuity metadata cannot
reset encoder prediction. The publisher instead keeps one retry, replaces it
with fresh captured PCM, resets prediction and encodes that replacement with
discontinuity. Exact retries remain admissible after credit returns. Ordinary
PCM coalescing behavior stays unchanged.

Accepting a later config discards older unsent samples. Discard/reset clears
pending audio and requires a marked next packet, while preserving lifetime
epoch/PTS refusal. Existing mutex, one writer, copied ownership, drain/failure
and in-flight write behavior remain shared. Dispatcher mode is fixed before use;
no profile switching within an active lane is allowed.

Four portable output cases cover mixed profiles, immutable mode refusal,
priority, copied packet bytes, 100 blocked exact retries without memory/clock
growth, epoch/reset/clock rules, malformed sizes/TOC/reserved/correlation and
actual dispatcher header/body writes. A native actual-source/SDK publisher-to-queue
fixture proves two blocked captures keep one accepted packet, one latest retry
and fresh recovery. The recovered all-silence Opus bytes match an independent
fresh encoder, demonstrating prediction reset before encode rather than a flag
rewrite. No remote RDP audio is involved.

The libFuzzer target prepares explicit Opus queue branches; local sanitizer/fuzz
execution remains unavailable. Production codec selection/lifecycle, private
Node forwarding, public negotiation, audible RDP/microphone, loss fidelity,
resource/platform/latency and soak acceptance remain open.
