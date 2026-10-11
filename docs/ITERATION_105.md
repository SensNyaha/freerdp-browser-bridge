# Iteration 105 — microphone status and publication authority

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after bounded handoff `1c3102f`.

RWI1 kind 41 has a fixed 40-byte schema-1 input readiness/epoch record with zero
unsolicited ID. Native/TypeScript profile/framing/progression checks reuse proven
PCM state validation with input semantics. CaptureStatePublisher holds one latest
candidate and one admitted snapshot. Backpressure preserves old authority;
successful send commits the candidate; uncertain exceptions are terminal without
replay. Reentry cannot change borrowed metadata. Handoff still rechecks actual
source readiness/epoch when admitted metadata becomes stale across reset.

Four portable cases pass **140 assertions**, three Node boundary/progression /
framing cases pass, and one actual linked AUDIN/fake-DVC case passes **51
assertions**. IPC now has **84 cases / 72,436 assertions**; AUDIN **39 / 3,441**.
Bundled CTest passes **17/17**, foundation **6/6**; /W4 /WX, MSVC /analyze,
TypeScript, clang-format and diff checks pass. Full bundled `pnpm check` passes
**285/285**, without skips. Fuzz dispatch/corpus seed are prepared and the seed
helper ran; local Clang/sanitizer campaign remains unrun.

Revision exhaustion is guarded but was not reached through u64 observations.
No worker/public state emission, microphone capability, permission or capture
is activated. Worker owner/mutex/wakeup/publication deadlines, Node/lease/browser
capture/resampling/Opus input and actual microphone/LAN acceptance remain open.
Tests use synthetic samples and fake DVC transport.
[Input status contract](MICROPHONE_STATE.md).
