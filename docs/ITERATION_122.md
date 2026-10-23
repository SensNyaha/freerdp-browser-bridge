# Iteration 122 — explicit microphone permission and track owner

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
capture Worklet `5256459`.

The isolated permission owner gates the sole getUserMedia call on explicit
browser user activation and current host eligibility. It owns track/listener
cleanup, cancelled late streams, single-flight unresolved promises and finite
activation/retirement deadlines. Scope failure prevents reacquisition. No
production graph, sender/socket composition, viewer/native selection or physical
capture is introduced.

Focused **9/9** pass: eight pure fake-API cases and one actual Edge fixture with
replaced getUserMedia and a synthetic MediaStreamDestination track. Checks cover
gesture/eligibility, cancellation/timeouts/late streams, track/grant loss,
unresolved activation, retirement failure, invalid results and reentrant
callbacks. Edge's initial gesture-free assertion failed because automation
evaluation carried transient user activation; the fixture now waits for its
observed expiry before testing refusal. The corrected focused run passes 9/9.
No original getUserMedia or physical microphone is invoked.

Bundled `pnpm check` passes **372/372**, without skips. Unchanged bundled CTest
passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

Host graph/server-grant scope and main-thread watchdog, sender/capture/viewer /
native composition, physical/device/remote/LAN acceptance, native resampling,
Opus input and platform/upstream limits remain open.
[Current contract](MICROPHONE_PERMISSION.md).
