# Iteration 86 — serialized audio session reset ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6 after private
Node activation `5b6d8f7`.

AudioSession exposes a serialized reset schedule to its selected PCM/Opus publisher.
It refuses foreign/reentrant, retiring/retired and failed publication ownership.
Successful calls clear prepared publisher storage, preserve lifetime clock/counters
and use the existing later-pump unsent-output barrier. A native-only saturating
source reset count contains no data or identifiers. No IPC/public selector is added.

Three new cases pass **158 assertions** with native/public context ownership and
actual linked RDPSND/fake-SVC source callbacks. Both codecs preserve old bounded
output until discard credit returns, emit waiting only after removal, produce no
samples before fresh Play, then emit ready/config/new-epoch discontinuity. The
recovered Opus bytes exactly match an independent fresh encoder with the new PCM,
proving prediction reset rather than a flag rewrite. Foreign/reentrant and
pending/done retirement refusal and publication-failure immutability pass.

Inspection confirmed that the existing reset packetizer already waits for fresh
samples; no publisher readiness change was needed. The source fixture uses its
standard 20-ms Wave2 payload; a one-frame variant did not produce immediate Play
through the linked channel and was not used to claim partial-wave acceptance.
Bundled CTest **16/16** and full `pnpm check` **236/236** pass with no skipped
tests. MSVC /W4 /WX, /analyze, clang-format, strict TypeScript, lint, format and
`git diff --check` pass. Foundation code is unchanged, with its latest CTest
evidence in Iteration 85.

Private reset IPC/queue/correlation, public compressed delivery/attachment recovery,
audible RDP/microphone, resource/platform/LAN latency/A/V scheduling and soak remain
open. XRDP lab connectivity remains unavailable per Iteration 85.
[Contract](AUDIO_SESSION_CODECS.md#owner-reset-scheduling-iteration-86).
