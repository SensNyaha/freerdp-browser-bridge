# Iteration 81 — one-time native audio output selection

Date: 2026-10-11. Implements SPECIFICATION §2.6, MEDIA_PIPELINE §6 and ADR-008
after AudioSession ownership `671dbfc`.

Default output owners permit one explicit PCM/Opus choice before the first
accepted audio record. Constructor choice and accepted enabled/disabled state,
config or samples lock the mode permanently. Invalid selection or refused/full
audio admission leaves the startup window available. Discard/take never reopen
it or erase lifetime epoch/PTS guards. The existing queue, non-audio records,
statistics and in-flight writer remain intact. Dispatcher uses its producer
try-lock; Windows pipe delegates selection without I/O or extra storage.

Four portable cases pass **176 assertions**; an actual Windows byte-pipe case
passes **9 assertions**, reading exact heartbeat/config bytes after graceful
drain. Coverage includes mixed profile refusal, repeated/late choice, disabled
state, full FIFO, preservation of ordering/statistics/clock, selection inside a
non-audio write callback and closed-owner refusal. Complete IPC suite passes
**59 cases / 7,312 assertions**.

Bundled CTest **16/16**, foundation **6/6** and full `pnpm check` **225/225**
pass, with no skipped tests. MSVC /W4 /WX, /analyze, clang-format, strict
TypeScript, lint, format and `git diff --check` pass.

Production worker still uses default PCM. Private configuration and Node
selection, public negotiation, audible RDP, microphone, loss fidelity, resource
limits, platforms, LAN latency, A/V scheduling and soak remain open.
[Contract](AUDIO_OPUS_OUTPUT.md#one-time-startup-selection-iteration-81).
