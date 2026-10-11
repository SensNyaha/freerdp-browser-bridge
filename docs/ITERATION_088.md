# Iteration 88 — bounded RDP-thread audio reset dispatch

Date: 2026-10-11. Implements raw recovery placement for SPECIFICATION §2.6 and
MEDIA_PIPELINE §6 after private codecs `2573a5f`.

One fixed ResetControl slot accepts only connected, enabled/ready, already
output-accepted status with matching epoch. RDP service rechecks the epoch,
availability, one-second deadline and current sink readiness before resetting
AudioSession. Replies preserve correlation and leave the mutex before sending.
Success suppresses repeated scheduling against an epoch whose barrier/status is
still pending. Closing drains the request as unavailable before owner retirement.
No HELLO bit or high-level/public selector is enabled in this raw wiring block.

Portable tests cover one-slot capacity, duplicate scheduling, unpublished status,
epoch/status changes while pending, deadline/backward/overflow clocks, cancellation,
empty/failing/throwing callbacks and u64 exhaustion. Linked static RDPSND/fake-SVC
tests cover both codecs, output-blocked status admission, scheduled owner reset,
fresh waiting/Play readiness and cancelled retirement. The actual local native TLS
refusal test also requests reset after terminal audio Close and expects unavailable.
These fixtures do not establish audible/actual remote recovery.

MSVC compilation caught a signed/unsigned assertion literal and an ambiguous
audio namespace; both were corrected without weakening warnings. Full CTest
exposed an existing tiny-Wave2 replay timing assumption. Pinned public source
rdpsnd_detect_overrun rounds two frames to 0 ms and subtracts elapsed time in an
unsigned remaining-duration calculation before its >10-ms underrun branch.
The Close/replay fixture now waits 12 ms to leave that upstream window. No
production sleep or dependency patch is added; upstream timing remains a retained
limitation.

New portable control tests pass **3 cases / 112 assertions**; IPC totals are
**66 cases / 9,679 assertions**. The new linked case passes **78 assertions**.
Bundled CTest **16/16**, foundation **6/6** and narrow Node **9/9** pass.
Full `pnpm check` passes **240/240** with no skipped tests. MSVC /W4 /WX,
/analyze, clang-format, strict TypeScript, lint, format and `git diff --check` pass.

The user restored the authorized XRDP lab. TCP 3389 returned True and both private
Opus and PCM helpers pass actual connection, waiting status epoch/revision 1,
heartbeat, 1024×768 capture, orderly shutdown and terminal source Close. Each
observed zero configs/packets/frames of audio. Reports remain Git-ignored in
.local-tests. No remote input or sound was generated; browser playback/audible
acceptance remain false. Actual ready-source reset is still unverified remotely.

Private capability/API correlation, public compressed delivery/recovery, actual
audible RDP, microphone, resource/platform/LAN/A/V scheduling and soak remain open.
[Contract](AUDIO_RESET.md#rdp-thread-scheduling-iteration-88).
