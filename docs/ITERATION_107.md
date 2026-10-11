# Iteration 107 — bounded AUDIN callback profile

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after RDP-owner microphone session `7cb9395`.

MicrophoneSession now selects a 480..4,800-frame PCM16 48 kHz callback profile.
Valid smaller Open requests get a checked HRESULT failure before upstream Open;
the negotiated format table survives for a later admissible retry. Full malformed
record validation precedes policy refusal. Compatibility fixtures retain the
original 1-frame profile. The owner deadline getter requires admitted readiness
and the actual epoch, including reset/foreign/reentrant refusal.

Two portable profile cases pass **87 assertions**; three actual linked AUDIN /
fake-DVC profile cases pass **222 assertions**, plus an additional reset deadline
check in the existing owner fixture. Bundled CTest passes **17/17**, foundation
**6/6**; /W4 /WX, MSVC /analyze, clang-format and diff checks pass. Full bundled
`pnpm check` passes **285/285** without skips.
Fuzz dispatch now covers both profiles and the retry-after-refusal phase; local
Clang/sanitizer campaign remains unrun.

The minimum steady callback interval is 10 ms within a stable source epoch,
not a global CPU bound across server renegotiations/earlier core work. No worker
selection, microphone capability, public capture or real device acceptance is
activated. Worker snapshot/mutex/wakeup/deadline integration, live transport /
resource limits, browser capture/resampling/Opus input and actual microphone /
LAN acceptance remain open. [Profile contract](AUDIO_AUDIN_PROFILE.md).
