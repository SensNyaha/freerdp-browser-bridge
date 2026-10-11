# Iteration 121 — bounded browser microphone capture Worklet

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
isolated sender `934f311`.

The fixed 48 kHz packetizer clips/duplicates Float32 mono/stereo into 960-frame
S16LE packets with absolute sample-frame timestamps. It owns a collector and one
latest complete block; one transferred packet may wait for port ACK. Age/credit,
epoch, clock, sample/parser and disposal checks bound stale data and ownership.
The connected Worklet output is silent. No resampler, physical device permission,
socket, native public selection or viewer activation is introduced.

Focused **9/9** pass: six pure capture cases, two simulated processor/parser
cases and one actual Edge synthetic offline/live Worklet case. Edge checks exact
captured bytes and silence, latest port credit, new epoch with old credit held,
pause/disposal and 44.1 kHz refusal. Any getUserMedia call fails that fixture.
This does not establish physical capture, browser permission ownership,
sender/socket/native composition, ready AUDIN or remote/audible/LAN acceptance.

The initial full run passed 362/363. Existing PCM reset lease verification
timed out waiting for exactly four events; standalone PCM/Opus reset tests then
passed 2/2. Inspection identified that initial config and initial packet arrive
as separate IPC records, but the test subscribed to reset events after waiting
only for config. It now observes the initial epoch-1 packet before subscribing,
preserving all exact reset ordering and correlation assertions.

Final bundled `pnpm check` passes **363/363**, without skips. Unchanged bundled
CTest passes **17/17**, foundation **6/6**. Formatting and diff checks pass.

Main-thread permission/track/context lifetime and wall-clock deadlines, native
resampling/wider formats, viewer/native activation, Opus input and actual
microphone/resource/platform gates remain open.
[Current contract](MICROPHONE_CAPTURE.md).
