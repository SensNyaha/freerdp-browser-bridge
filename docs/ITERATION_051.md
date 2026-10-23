# Iteration 51 — bounded browser PCM queue and actual AudioWorklet

Date: 2026-10-10. Implements the browser consumer portion of SPECIFICATION §2.6,
MEDIA_PIPELINE §6/8 and bounded queue ownership from ARCHITECTURE §7.
Continues PCM codecs `655ef81` (iteration 50).

The isolated browser consumer owns one 120 ms stereo S16 ring, starts with 40 ms
prebuffer, converts exact signed sample values, counts underflow silence and skips
old complete intervals on overflow. Epoch/PTS/storage checks preserve state on
invalid input. Discontinuity discards old samples and resets playback buffering.
Variable engine block sizes are handled without process-loop sample allocation.

The real AudioWorklet has bounded initial handoff, private command acknowledgments
and explicit reset/disposal. Edge OfflineAudioContext renders exact opposite stereo
extremes and a second independent PCM vector, then zero silence. A 44.1 kHz context
and oversized initial handoff render only silence. Live AudioContext is resumed
from a user click; actual worklet command/reset/stats/dispose ACKs and malformed
PCM refusal pass. Every fixture command is single-flight; ports/nodes/context
and browser/server are closed.

Narrow verification: five pure cases plus actual Edge fixture **6/6**.
pnpm check **151/151**, no skips/cancellations, **117.63 s**; whitespace checks pass.
Native implementation is unchanged; iteration 50's CTest 5/5 and 13/13 remains
the latest native regression. No redundant native suite is claimed for this block.
Logs: ignored `build/iteration-051-*.log`.

This is actual browser processing of synthetic PCM, not audible RDP integration
or a timed audio/latency soak. No production viewer/server audio is activated.
Bounded production MessagePort ownership, public browser parser, worker/Node
delivery, other rates/browser devices, microphone and actual Stage 5/6 gates remain.
