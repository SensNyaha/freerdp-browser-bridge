# Iteration 79 — explicit bounded Opus output mode

Date: 2026-10-11. Implements SPECIFICATION §2.6, MEDIA_PIPELINE §6 and ADR-008
after publisher `c1bbfe1`; production dispatcher remains in default PCM mode.

Immutable explicit codec selection enables guarded Opus status/config/packet
admission in the same output slots. Opposite-mode profiles are refused before
owned copying. Opus packet admission returns full while its slot is occupied;
no compressed discontinuity metadata is rewritten. The publisher replaces its
own pending capture and encodes with reset prediction when appropriate. PCM
coalescing, control/audio/cursor/video priority and dispatcher lifetime stay intact.

Four portable cases pass **197 assertions**; complete bundled IPC is **55 cases /
7,136 assertions**. Seven actual-source/SDK publisher cases pass **125 assertions**.
The new pipeline fixture keeps one accepted packet plus one latest encoded retry
through two blocked captures, then recovers the freshest timestamp with
discontinuity. Its recovered bytes match an independent fresh silence encoder.
Tests additionally verify copied ownership, 100 identical full retries, admission
clock preservation, mixed profiles, malformed bounds/TOC/correlation, reset/epoch
history, maximum packet and actual dispatcher header/body writes.

An initial full-slot test incorrectly advanced unmarked packet timestamps across
multiple intervals; the queue correctly returned invalid rather than full. It now
retries the same valid next packet and separately verifies invalid gaps. Debug
MSVC analysis also caught a test's combined 17,028-byte stack; its two queue owners
were moved to RAII heap storage instead of changing the stack warning threshold.

Bundled CTest passes **16/16**, foundation CTest **6/6** and full `pnpm check`
**225/225**, including actual Edge SDK/Opus decoding. MSVC /W4 /WX, /analyze,
clang-format, strict TypeScript, lint, format and `git diff --check` pass.
Private native ZIP relocation passes **1/1**. Actual authorized XRDP/Edge H.264
with idle PCM passes with **20 rendered frames**, real pixels, cursor replay and
reattachment, one motion and one reset. Browser audio activation and waiting
status admission pass with **zero sample packets**; audible acceptance is false
and no remote sound or keyboard/button/wheel input is generated.
Fuzzer branches prepare explicit Opus mode but have not run
locally. No RWI1/RWB1 schema, HELLO, settings or public selection is activated.
Actual audible RDP/microphone, native lifecycle codec selection, loss fidelity,
core/codec resources, platforms, LAN latency and soak remain open.
[Output contract](AUDIO_OPUS_OUTPUT.md).
