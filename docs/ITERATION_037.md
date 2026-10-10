# Iteration 37 — bounded PCM handoff and underflow behavior

Date: 2026-10-10. Continues SPECIFICATION §2.6 / ARCHITECTURE §5 preparation with
a fixed 120 ms native S16LE ring. No waits or per-call allocations are introduced.
Implementation commit: `6f0a7a3`.
Overflow refuses a whole incoming packet; underflow yields counted silence. Reset
discards backlog and marks the next nonempty read as discontinuous. Lifetime
metrics are bounded/saturating. [Exact contract](AUDIO_PCM.md#bounded-pcm-handoff-queue).

Verification:

- Portable audio **16 cases / 9,633 assertions**, including seven new queue cases:
  exact ceiling, both wrap paths, silence/marker behavior, invalid-call atomicity,
  reset, 2,000 randomized operations against an independent FIFO, and borrowed
  normalizer buffer handoff.
- Foundation CTest **5/5**, bundled **11/11**, /W4 /WX /analyze.
- pnpm check **141/141**, no skipped/cancelled tests, **109.36 s**; TypeScript,
  lint/format and native/fake/Edge regressions passed.

Logs: ignored build/iteration-037-*.log. The queue is not linked into the worker.
RDPSND registration, media transport, AudioWorklet, Opus, audin, public metrics,
actual audible output/microphone and LAN latency acceptance remain open. Stage 5
physical/remote input gates remain open too.
