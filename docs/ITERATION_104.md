# Iteration 104 — bounded microphone handoff

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after private PCM codec `26612de`.

CaptureHandoff owns one fixed PCM slot with a 20 ms dispatch window. Producer
copies once after codec/current-epoch validation; owner service rechecks live
readiness/epoch/deadline before bounded source admission. Refused or expired
packets are not retried. Reentry cannot overwrite borrowed PCM, and completions /
shutdown drain wipe samples after callbacks return. Current worker still replies
unavailable: no microphone capability or wire activation is added.

Four portable cases pass **4,145 assertions**, including fixed-storage sustained
transfer, deadline/whole-u64 boundaries, exceptions/unknown status, reentrancy
and shutdown. One actual linked AUDIN/fake-DVC case passes **46 assertions**:
separate serialized producer and RDP owner deliver exact synthetic PCM through
the guarded public channel, then refuse a packet pending across capture reset.
IPC now has **80 cases / 72,296 assertions**; AUDIN **38 / 3,390**. Bundled CTest
passes **17/17**, foundation **6/6**; /W4 /WX, MSVC /analyze, clang-format and diff
checks pass. This is not real worker input dispatch or browser/remote capture.
Full bundled `pnpm check` passes **282/282** Node cases without skips.

Worker mutex/wakeup/completions/status publication, finite shutdown deadlines,
Node single-flight/rate/deadline limits, current lease and explicit browser
permission/capture/resampling/Opus input and actual microphone/LAN acceptance
remain open. [Handoff contract](AUDIO_CAPTURE_HANDOFF.md).
