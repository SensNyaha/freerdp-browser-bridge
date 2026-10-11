# Iteration 103 — bounded private microphone PCM codec

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after native capture reset `493f3dc`.

Additive RWI1 kinds 39/40 carry exact schema-1 captured PCM and correlated typed
results. Both header parsers enforce exact lengths and nonzero IDs before body
allocation. PCM reuses the proven audio packet layout with exactly 960 real
frames and zero output-silence accounting. Native/TypeScript decode borrows input
storage. Results enter the existing bounded control FIFO; PCM requests cannot
enter that output queue. Real workers validate PCM then reply unavailable and
remain responsive to heartbeat/shutdown. Microphone settings/capability and
public RWB1 MIC_PACKET remain unactivated.

Three native cases pass **6,778 assertions**; IPC now has **76 cases / 68,151
assertions**. Five Node boundary/golden/framing cases and one real-worker
lifecycle case pass on the foundation runtime. Bundled CTest passes **17/17**,
foundation **6/6**; /W4 /WX, MSVC /analyze, TypeScript and formatting checks pass.
Fuzz target dispatch and two valid synthetic corpus seeds are prepared; the seed
helper ran, but no local Clang/sanitizer campaign ran. These are codec/lifecycle
fixtures, not actual AUDIN/browser/remote microphone acceptance.
Full bundled `pnpm check` passes **282/282** Node cases without skips.

Bounded worker input handoff, epoch/readiness status, callback/CPU/wakeup budgets,
Node correlation/rate/deadlines, current lease and explicit browser permission /
capture/resampling/Opus input and real microphone/LAN acceptance remain open.
[Wire contract](MICROPHONE_PCM_WIRE.md).
