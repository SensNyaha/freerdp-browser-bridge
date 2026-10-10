# Iteration 36 — bounded PCM normalization foundation

Date: 2026-10-10. Implements an isolated preparation block for SPECIFICATION §2.6,
ARCHITECTURE §5 and Stage 6. Stage 5 physical/remote keyboard and touch acceptance
gates remain open; no prerequisite is marked complete by this audio work.

The native library normalizes PCM8/PCM16 mono/stereo at 8..48 kHz into S16LE
48 kHz stereo with fixed output storage, complete preflight bounds and a rational
stream phase. Unsupported formats/rates are refused. Reset and configuration
transitions discard history. No worker backend, wire transport or audio capability
is enabled. [Contract and remaining limits](AUDIO_PCM.md).

Verification:

- Portable audio **9 cases / 2,638 assertions**: all PCM8 values, PCM16 signed
  extremes and stereo identity, independent 8 kHz interpolation vector, fragmented
  44.1 kHz packets, ten seconds without clock drift, capacity/invalid rejection
  without mutation, reset and format transitions.
- Foundation CTest **5/5**, bundled CTest **11/11**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **109.13 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs: ignored build/iteration-036-*.log. No actual RDP audio or browser audio test
has run. The normalizer is not linked into the worker at this stage.
