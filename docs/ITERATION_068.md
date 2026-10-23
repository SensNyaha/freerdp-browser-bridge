# Iteration 68 — bounded PCM record credit

Date: 2026-10-10. Implements SPECIFICATION §2.6, ARCHITECTURE §5/11 and
MEDIA_PIPELINE §6/8 after typed backend/lease ownership `bce1d30`.

`PcmMediaSender` prepares ordered RWB1 stream 3 delivery with one receiver credit
shared by source status, configuration and PCM. It retains scalar metadata and at
most one copied 3,840-byte pending sample packet. Replacements clear old samples
and force discontinuity. Stop/reset clears unsent samples/configuration; a record
already admitted to the consumer remains owned until its exact ACK. Initial
attachment replays metadata only and marks the first future sample discontinuous.

The configuration record waits for a sample so its timestamp remains the captured
sample clock, independent of later source observation time. Temporary refusal
consumes no sequence/credit. Bad ACK, replay/order, uncertain write, a receiver
deadline of at most two seconds or sequence exhaustion retires the owner. Invalid
clock/reentrant calls cannot consume pending output. Close clears sample storage.
No socket, timer, public selector or Worklet activation is added in this block.
Consumers must admit records into bounded ordered storage and drive progress;
this preparatory owner does not establish end-to-end audible/latency acceptance.

Seven pure cases cover an independent config hex vector, strict bounds, copied
sample ownership, 100 latest-packet replacements, metadata/sample credit ordering,
stop while old credit is held, recovery, temporary refusal, attachment replay,
malformed events, exact ACK deadlines, exhausted sequences and reentry/faults.
Narrow tests pass **7/7**; full `pnpm check` passes **197/197**, including
actual native lifecycle/TLS and real Edge synthetic Worklet fixtures. Strict
TypeScript, lint, format and `git diff --check` pass.
Native code/layout is unchanged from iteration 66 CTest **14/14** bundled and
**6/6** foundation. Public WS/browser selection, actual audible RDP, microphone,
Opus, metrics and platform/resource/latency/soak acceptance remain open.
