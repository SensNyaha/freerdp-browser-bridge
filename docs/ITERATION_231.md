# Iteration 231 — guarded native clipboard activation

2026-10-15. Implements raw native selection/dispatch for SPECIFICATION §2.7,
using the serialized owner from `cc0223a`.
[Wire and lifetime contract](CLIPBOARD_IPC.md#raw-native-selection-iteration-231).

Connection schema 10 adds independent directions and an explicit item maximum.
Only guarded Windows/Linux builds with compiled CLIPRDR and bounded output
callbacks accept the profile. It selects the custom public Unicode owner,
synchronous SDK dispatch and guarded receive route before connect. The root IPC
thread moves one admitted payload and wakes the RDP loop. Actual source state,
revision and policy are rechecked there. Callback retirement precedes SDK cleanup
and thread join, including strict TLS rejection before GDI activation. Existing
certificate defaults and all earlier connection schema masks are preserved.

Four actual worker/local TLS cases pass on each platform: both one-way profiles,
bidirectional selection with Opus output/PCM microphone/200 ms buffer, and
shutdown during a certificate prompt. Early/late clipboard commands return
unavailable without text; heartbeat, strict certificate rejection, zero TLS
application bytes and empty runtime cleanup pass. These do not implement a
remote desktop or exercise an actual server clipboard.

The linked text suite now passes nine cases / 659 assertions. A valid UTF-16
response whose UTF-8 expansion exceeds the configured quota completes as refused
without retiring the owner; the following read succeeds. Protocol/config tests
cover all 1,024 candidate flag masks, quota extrema, truncation and old-schema
refusal. Windows foundation CTest passes 14/14, linked Windows 29/29 and Linux
30/30. Six local non-PIE sanitizer clipboard executables pass with the SDK itself
uninstrumented. Seeded instrumented IPC fuzz completes 1,101,319 executions in
21 seconds, coverage 1,866 / 3,365 features and peak RSS 277 MiB, exit zero.

Full bundled Linux `pnpm check` passes 574 with 54 platform skips / 628 cases.
Full bundled Windows passes 579 with 49 platform skips / 628 cases. Fresh installed
relocation passes 1/1 on each platform with private FreeRDP/ZLIB and without
dependency PATH. Evidence: `build/iteration-231-*`.

HELLO/private typed Node selection and public/browser clipboard remain disabled.
Actual remote transfer, controller/media revocation and resource/platform gates
remain open; this is not Stage 7 acceptance or a total RSS/latency bound. No OS
clipboard, physical device or lab secret is accessed by this block's tests.
