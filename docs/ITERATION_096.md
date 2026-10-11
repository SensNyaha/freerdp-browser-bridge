# Iteration 96 — public AUDIN device ABI

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after capture foundation `1780eb2`.

AudinSource projects the bounded virtual capture source through pinned public
IAudinDevice/AudinReceive. Supported PCM descriptors are copied, every Open
reserves a fresh epoch and Close wipes samples. One owner determines pacing;
callback reentrancy cannot invalidate borrowed samples. Failed callbacks stop
without retry. Owner retirement destroys resources before a delayed foreign-thread
host Free while preserving the externally owned ABI wrapper.

Six synthetic public-ABI cases pass **2,043 assertions**. Bundled native CTest
passes **17/17**, foundation **6/6**, with /W4 /WX and MSVC /analyze. Relocated
private ZIP probe passes **1/1** and clang-format checks pass. Full bundled
`pnpm check` passes **276/276** Node cases without skips.

No worker activation, wire change, host capture or remote microphone was added.
Earlier format/DSP allocations and detached-success behavior in pinned AUDIN
remain recorded gaps. Guarded provider/DVC, worker scheduling/IPC, browser
permission/capture and actual acceptance remain open.
[Contract and test boundaries](AUDIO_AUDIN_ADAPTER.md).
