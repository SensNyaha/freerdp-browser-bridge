# Iteration 62 — PCM source status and epoch ownership

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 bounded discontinuity delivery after source snapshots `d577699`.

The serialized native publisher can now offer fixed AUDIO_STATE metadata ahead
of PCM config/samples. Source stop works without fresh samples. It reserves the
next epoch until actual capture, coalesces unaccepted state changes, increments
only accepted status revisions and preserves the consumer discard barrier before
status. Packetizer skips now also clear older unsent consumer PCM before their
new epoch, including in packet-only foundation mode. Storage adds only 40 bytes.
This mode is not selected by the worker and does not activate audio.

Eight new owner/queue cases and one actual linked RDPSND/fake-SVC case exercise
metadata-only reset/retirement, reserved epochs, blocked/latest state, full control
FIFO, source and packetizer discard credit, all unavailable reasons, reentry/foreign
threads, clocks, callback faults and 64-bit exhaustion. Real static RDPSND supplies
Wave2, raw suspend/resume, Close and fresh recovery; it is not audible remote audio.
RDPSND **61 cases / 8,980 assertions** pass; focused source-status checks are
**3 cases / 188 assertions**. Bundled CTest **14/14**, foundation CTest **6/6**,
bundled `pnpm check` **166/166** (no skips, 137.37 s), /W4 /WX /analyze,
clang-format, strict TypeScript, ESLint, Prettier and diff checks pass.
Logs: ignored `build/iteration-062-*.log`.

Public media state framing, Node supervision/listeners/replay, browser reset and
worker configuration/selection remain open. Actual audible RDP, microphone,
larger source packets, upstream allocation limits and LAN latency are unverified.
