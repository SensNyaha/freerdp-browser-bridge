# Iteration 46 — bounded PCM packet continuity

Date: 2026-10-10. Continues SPECIFICATION §2.6 / §3.3 bounded audio/discontinuity
handling and ARCHITECTURE §5. [Continuity contract](AUDIO_PCM.md#packet-continuity).

Fixed selected-format metadata permits source frame/alignment checks before
upstream Open/Play. An allocation-free owner clock distinguishes counter wraps
from epoch/gap/block/format/type changes using bounded metadata and monotonic arrival
milliseconds. A reset discards stale PCM/interpolation history before the new packet;
WaveInfo advances once and raw Wave does not repeat the observation. No browser PTS
or AV sync mapping is inferred from legacy build-time timestamps.

Pure fixtures cover first/reset, 6,500 consecutive packets, 16/32-bit timestamp
and 8-bit block wraps, clock epochs, gaps, format/rate/type changes, exact jitter
boundaries, batched arrivals, atomic metadata rejection and uint64 arrival overflow.
Actual linked guarded RDPSND + fake SVC covers contiguous PCM, source epoch/gap,
lost/repeated blocks, both wrap widths, clock-type switch and rejection of malformed
alignment/over-budget packets before device Open or wave confirmation.

The current preparation profile caps a source PDU at 100 ms, matching conversion
capacity. Larger valid RDP bursts need bounded splitting before activation. A
separate gap was found in server table renegotiation: an upstream already-open
index may retain its old device format. This must be resolved/refused before audio
is activated. Earlier core bounds, upstream overrun behavior, worker/media/browser
clock/scheduling, microphone and actual Stage 5/6 acceptance remain open.

Verification:

- Portable audio **39 cases / 414,511 assertions**.
- Native RDPSND **36 cases / 1,352 assertions**.
- Foundation CTest **5/5**, bundled **12/12**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **125.13 s**.

Logs are ignored build/iteration-046-*.log; worker audio remains disabled.
