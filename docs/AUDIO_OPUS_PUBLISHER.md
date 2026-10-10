# Isolated native Opus publisher

Iteration 78 implements SPECIFICATION §2.6 and MEDIA_PIPELINE §6/8 after the
private encoder and wire/browser preparations. This owner is not selected by
the worker; the active output queue remains PCM-only and refuses Opus records.

`OpusPublisher` composes the existing serialized `PcmPublisher` capture, epoch,
source revision, monotonic-clock, latest-frame, reset-barrier and send-credit
rules. It adapts fixed source/config descriptors to codec 1 and encodes only
after state and config credit. No second RDPSND source, timer or capture queue is
created. The private encoder accepts the validated fixed 3,840-byte PCM record;
the existing PCM parser checks whole frame accounting and exact zero-filled
underflow tail before prediction changes.

The owner holds one heap-backed **1,299-byte** encoded retry record in addition
to the existing bounded PCM publisher and codec scratch. A blocked consumer
retries exactly those encoded bytes without re-encoding or advancing prediction.
A fresh capture replaces that record and is marked discontinuous by the reused
PCM publisher. Config carries the queried encoder lookahead. Source accounting,
epoch, discontinuity and capture PTS remain unchanged in private Opus metadata.

The external discard callback must finish clearing unsent consumer audio before
the barrier clears the encoded cache and permits fresh status/config/samples.
False leaves the barrier active and cannot publish an older encoded record.
Accepted reset clears the local cache immediately; the next pump still completes
the consumer barrier. New config epoch resets codec prediction, and repeated
blocked config does not repeatedly reset the encoder. No already transmitted
record is recalled or replayed. A consumer must copy borrowed bytes before
returning true; false must retain no borrowed span.

Source/send failures retire the composed publisher and clear encoded scratch;
empty callbacks, wrong thread, reentrant pump/reset and invalid clocks preserve
ownership. Epoch/status exhaustion fails before capture or encoding. Callback
type-erasure construction failure before entering the source pump returns invalid
without changing source/codec state. SDK internal allocations/CPU and deliberate
SDK allocation-fault injection remain open.

Actual public RDPSND device callbacks and private libopus are used in native
fixtures. They verify status-before-config-before-packet, stereo SDK decode,
source/silence counts, exact blocked retry, ordinary prediction continuity,
fresh replacement, stopped/reset barriers, config/state backpressure, thread /
reentrant refusal and failure/exhaustion. There is no real SVC/RDP transport in
these tests. Worker/IPC selection, public negotiation, actual audible RDP,
microphone, loss recovery fidelity, resource/platform/latency and soak remain open.
