# Iteration 102 — capture reset with receiver preservation

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after rational cadence `5756814`.

Native capture reset validates the exact current input epoch and RDP owner,
wipes old PCM and capture-clock history, restores prebuffering and reserves a
fresh epoch while preserving the negotiated AudinReceive callback. Scheduled
capture supplies silence until new PCM arrives. Stale/invalid/foreign/reentrant
requests do not mutate ownership. The gate removes the previous deadline and
deadline snapshots now require matching source/cadence epochs after format
changes as well. Successful resets have a saturating payload-free counter.

Three new public-device / actual linked AUDIN/fake-DVC cases pass **126
assertions**. Existing reentrant/foreign device cases add four assertions.
AUDIN now has **37 cases / 3,344 assertions**. Bundled CTest passes **17/17**,
foundation **6/6**;
/W4 /WX, MSVC /analyze, clang-format and diff checks pass. Tests use synthetic
PCM/silence; no browser/host microphone or remote application was used.
Full bundled `pnpm check` passes **276/276** Node cases without skips.

Epoch exhaustion stops rather than wraps, but u64 device-open/reset exhaustion
was not reached in linked fixtures. Worker/private IPC correlation, current
lease/permission admission, rate/deadline limits, browser capture/resampling /
Opus input and real microphone/LAN/reset acceptance remain open. No public or
private wire/capability is activated. [Reset contract](AUDIO_CAPTURE_RESET.md).
