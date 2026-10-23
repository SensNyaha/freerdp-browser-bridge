# Iteration 70 — Worklet admission acknowledgements

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 after socket negotiation `4f84935`.

The isolated browser PCM owner optionally selects `recordCredit: true`, requiring
source status and an `onRecordAck(sequence)` callback. It admits at most one
unacknowledged RWB1 record. Each source state maps to a reset command, config to
configuration, and samples to a copied/transferable PCM command. The callback runs
only after the exact accepted Worklet reply; stats replies grant no wire credit.
Wrong/rejected replies, protocol bursts, command deadlines and callback exceptions
close the port/context. Explicit close/context loss grants no pending ACK.

The receiver callback can synchronously admit its next record without retiring or
overwriting the new command. Default packet-only/coalescing mode is preserved.
No public harness/native activation or audio selector is added in this block.

Three new pure cases verify deferred/exact wire ACKs for status/config/PCM/Close,
second-record refusal, bad/rejected replies, callback exceptions, close, option
requirements, stats versus record credit and synchronous next-record admission.
A new actual Edge/AudioWorklet fixture uses an explicit button click, verifies no
ACK during record parsing, then one ACK after each command, Close queue clearing,
stats independence and context-loss cleanup. It uses synthetic zero PCM, not RDP
audio or audible acceptance. Narrow source-port/Edge tests pass **11/11**.
Full `pnpm check` passes **208/208**, including the two iteration 69 socket-owner
cases, actual native lifecycle/TLS and real Edge fixtures. Strict TypeScript,
lint, format and `git diff --check` pass. Native code/layout is unchanged.

Harness gesture/record routing, public native selection, actual audible RDP,
microphone/Opus, metrics and platform/resource/latency/soak acceptance remain open.
