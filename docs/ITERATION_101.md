# Iteration 101 — rational capture cadence

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after scoped AUDIN ownership `9a9f99b`.

CaptureCadence retains exact sixth-microsecond phase for 48 kHz and computes the
next future deadline in constant work. Due owner ticks emit at most one checked
AUDIN PCM pair. Missed callbacks skip bounded queued samples without reading or
counting silence; no catch-up loop or timer/thread is introduced. Format changes
establish a fresh epoch/clock, while backward/exhausted clocks or failed writes
stop capture. Foreign/reentrant calls preserve queue and deadlines.

Five portable cadence cases pass **109,175 assertions**, comparing against
independent absolute timelines and covering the full u64 clock range. One new
portable capture-skip case passes **26 assertions**. Three actual linked AUDIN /
fake-DVC cases pass **145 assertions**, including exact fresh PCM after a delay,
mono epoch reset, failures and callback ownership. An existing public device
reentrancy case also checks that skip cannot mutate borrowed PCM. AUDIN now has
**34 cases / 3,214 assertions**. Bundled CTest passes **17/17**, foundation **6/6**;
/W4 /WX, MSVC /analyze, clang-format and diff checks pass.
Full bundled `pnpm check` passes **276/276** Node cases without skips.

No microphone wire/capability or worker/browser capture is activated. Production
callback/CPU budgets and wakeup integration, conservative stall dropping versus
capture clock mapping, earlier core limits, permission/reset ownership, private
IPC, resampling/Opus input and real microphone/LAN acceptance remain open.
[Cadence contract](AUDIO_CAPTURE_CADENCE.md).
