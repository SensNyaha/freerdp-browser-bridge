# Bounded IPC-to-RDP microphone handoff

Iteration 104 implements the isolated handoff foundation for SPECIFICATION §2.6 /
ARCHITECTURE §5 / MEDIA_PIPELINE §7. It is not selected by the worker and adds no
wire kind, microphone capability, host capture or browser permission flow.

CaptureHandoff owns one heap-allocated 3,840-byte PCM slot. Caller serializes
producer and RDP-owner operations with its mutex; the class is not internally
thread-safe. Enqueue validates the fixed [private codec](MICROPHONE_PCM_WIRE.md)
before copying samples, requires a nonzero request ID and supplied current ready
epoch, and refuses a second slot with busy. Empty return means queued, not
accepted by AUDIN. Producer bytes may be reused immediately after the copy.

The slot has a 20 ms dispatch window based on the monotonic worker arrival clock.
Before invoking the bounded owner Submit callback, service rechecks current
epoch/readiness and rejects backward or expired clocks. Expiry at the exact
deadline returns busy and clears PCM; clock/deadline overflow cannot wrap. The
capture timestamp remains unchanged and belongs to the browser input clock,
not this admission clock. Callback status/exception is checked, one correlated
completion is returned, and samples are wiped after borrowed bytes return.
There is no retry, replacement FIFO, sleep, timer or per-call owned allocation.

Accepted means the RDP-owner callback admitted samples into its bounded source
queue, not a channel write or remote microphone consumption. Logical source
refusals map to stale/unavailable/invalid. Missing/throwing callback is unavailable;
unknown callback result is invalid. A caller dropping packets after busy must
mark a fresh discontinuity; blindly replaying packets or skipping capture-clock
history is not permitted. Lifetime counters saturate and carry no payload,
request/epoch identity or peer labels.

While Submit borrows PCM, nested enqueue is busy, nested service is empty and
retire is refused. Slot ownership/byte counters still include that borrow.
Retire requires no pending/in-flight packet; shutdown first services pending
with ready=false, retaining its completion for the caller to deliver. The owner
must outlive every call; destroying it inside Submit terminates rather than
wiping borrowed data. Ordinary destruction wipes storage but generates no reply:
production must drain/cancel RPC ownership explicitly before destruction.

Four portable cases verify independent copying, refusal preserving the first
slot, exact deadlines/whole-u64 clocks, changed epochs/readiness, exceptions and
unknown outcomes, shutdown drain, reentrancy and 1,000 fixed-storage transfers.
An actual linked AUDIN/fake-DVC fixture serializes a separate producer with the
RDP owner, delivers exact synthetic PCM through the public guarded channel, and
rejects a packet pending across a capture reset. No FreeRDP API runs on producer.

Worker mutex/wakeup and completion delivery, published microphone epoch/readiness,
finite shutdown deadlines, Node single-flight/rate limits, current control lease,
browser permission/capture/resampling/Opus input and real microphone/LAN latency
acceptance remain open. The 20 ms slot window does not establish an end-to-end
latency bound or the earlier upstream DVC allocation/transport limits.
