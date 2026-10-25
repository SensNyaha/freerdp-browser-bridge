# Linux framed-stream output foundation

Implements ARCHITECTURE §2/§5 and Stage 1's bounded stream fallback. The primary
Linux SOCK_SEQPACKET transport remains required and unimplemented. This driver
is selected by Linux foundation/linked workers in iteration 192. It advertises
no new RDP/audio capability or public wire format.

`LinuxStreamOutput` accepts an inherited writable FIFO or AF_UNIX SOCK_STREAM
descriptor, including Node's ordinary stdio socketpairs. Read-only, regular /
character files, network sockets and datagram/seqpacket descriptors are refused.
The caller retains its descriptor and provides exclusive write ownership until
finish/destruction. Producer calls must retire before owner teardown.

The owner duplicates its descriptor with close-on-exec, temporarily selects
nonblocking writes on the shared open description and restores the original
flags after the writer joins. One private nonblocking eventfd wakes one writer.
The existing OutputDispatcher owns fixed priority lanes and one in-flight record;
producers retain try-lock admission and never wait on descriptor writes.

Header and body share one steady-clock deadline. Partial writes use bounded
chunks, poll readiness and EINTR handling. A stalled/broken peer makes fixed
dispatcher failure; a partially written envelope is not a sent record and cannot
be retried as a complete message. SIGPIPE is blocked only in the private writer
thread, preserving caller/global signal policy.

Only the construction thread may finish/destroy the owner. Finish refuses new
admission, drains accepted records under one deadline, then wakes/cancels an
unfinished writer and joins under a finite grace period. Live callback ownership
is never released on uncertain completion. The destructor terminates the owned
process if it cannot join safely. Codec selection/discard remains the existing
bounded dispatcher contract; the fixture's Opus choice is not Linux audio
activation.

Six real FIFO/socketpair cases verify fragmented byte preservation, graceful /
repeated close, descriptor flags, producer progress under a stalled peer,
whole-record/drain deadlines, broken peers, signal-mask preservation, invalid
descriptor/type/timeout/owner refusal and twenty lifetimes without leaked FDs.
[Foundation evidence](history/iterations/151-200.md#iteration-191), [worker activation](history/iterations/151-200.md#iteration-192). Actual connected-worker
failure/cleanup, primary seqpacket, real media/transport and broader platform /
resource/soak gates remain open.
