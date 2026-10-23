# Iteration 106 — RDP-owner microphone session

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after input-status publication `bafdfe0`.

MicrophoneSession composes guarded AUDIN loading, virtual source, rational
capture cadence, input-epoch reset and admitted metadata authority. Owner-only
operations protect borrowed callbacks and actual readiness. Retirement stops
capture before reverse-order provider release, retries one failed close per
owner call, independently waits for closed metadata and uses a finite deadline.
Uncertain publication stops capture without replay. The wrapper survives delayed
host callbacks after native retirement.

Six actual linked AUDIN/fake-DVC cases pass **199 assertions** with synthetic
samples. AUDIN is now **45 cases / 3,640 assertions**. Bundled CTest passes
**17/17**, foundation **6/6**; /W4 /WX, MSVC /analyze, clang-format and diff
checks pass. Full bundled `pnpm check` passes **285/285** without skips.

Closed-metadata expiry is tested after handles were released; live-handle expiry
still requires outer worker cleanup ownership. No worker selection, private
dispatch activation, public capability or physical/browser capture is added.
Worker snapshot/mutex/wakeup/finite shutdown, production callback CPU budget,
earlier core resource limits, browser capture/resampling/Opus input and actual
remote microphone/LAN acceptance remain open.
[Owner contract](MICROPHONE_SESSION.md).
