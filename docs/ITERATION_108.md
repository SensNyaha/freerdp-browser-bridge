# Iteration 108 — bounded private microphone worker integration

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after bounded AUDIN callback profile `bc5d1dc`.

Raw CONFIGURE schema 7 adds independent PCM input flag 16. Connection selects
the guarded virtual AUDIN source on the RDP owner. One mutex serializes status
publication/admitted producer authority and a one-slot PCM handoff. Actual source
readiness/epoch/deadline is rechecked before queue admission. Existing event wakeup
and scheduled capture deadlines drive the loop. Ending drains the slot and
retires microphone before output audio/touch with finite ownership cleanup.

One portable configuration case passes **194 assertions**. Two Node codec cases
pass independent golden/selection/validation checks. Three actual native process
tests pass early/late input refusal and closed metadata ordering after strict
TLS refusal with output off/PCM/Opus, plus heartbeat/shutdown/cleanup. They perform
no device capture or remote audio application actions. Bundled CTest passes
**17/17**, foundation **6/6**; /W4 /WX, MSVC /analyze, clang-format and diff checks
pass. Full bundled `pnpm check` passes **290/290**, without skips. A schema-7
fuzz corpus seed was generated;
local Clang/sanitizer fuzz campaign remains unrun.

The first full Node run had one existing unsupported-reconnect test exceed its
5 s condition wait. It passed in isolation (213 ms) and in the complete sequential
retry (193 ms); no assertions or timeout were changed. Foundation compilation
overlapped the first run, but the timing cause has not been established.

No microphone HELLO bit, private WorkerProcess selection or public browser /
permission/capture is activated. Raw private opt-in is experimental. Connected
worker wakeup/latency, real negotiated transport/lost-write and live-handle fault
acceptance, earlier core bounds, private reset, Node/lease/browser resampling /
Opus input and actual microphone/LAN/platform acceptance remain open.
[Worker contract](MICROPHONE_WORKER.md).
