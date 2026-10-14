# Linux primary IPC carrier

Iteration 195 selects this carrier in Linux worker only with the exact private
argument `--ipc-seqpacket-fd=3`, an already connected inherited AF_UNIX packet
descriptor. HELLO then reports `unix-seqpacket-rws1`. Default invocation/CLI/Node
remain framed pipes. The priority output owner retains its fixed queues, 1 s
write deadline and finite drain/cancellation. The receive owner observes idle
output failures and parent loss before processing further input. Actual process
tests pass; Node integration and connected RDP acceptance remain open.
[Worker evidence](ITERATION_195.md).

Iteration 194 adds the tested `LinuxSeqpacketEndpoint` kernel-socket adapter.
It duplicates only connected Unix packet sockets, preserves descriptor flags,
uses fixed receive scratch and vectored borrowed writes, rejects truncation and
ancillary data, and distinguishes idle/EOF from partial failures. Reads retain
the original partial-record deadline; writes have one finite whole-record
deadline and optional cancellation checked within 20 ms while blocked. Both
timeouts are 20..5,000 ms, default 1,000 ms. Each instance belongs to one thread;
the caller retains its original descriptor. Socket creation/inheritance, worker
and Node selection remain open. [Actual socket evidence](ITERATION_194.md).

Iteration 193 implements the portable RWS1 carrier codec beneath the unchanged
RWI1 envelope (PROTOCOL section 6). Neither codec nor endpoint is selected by current workers or Node:
the tested bounded framed-stream fallback remains active. Socket creation,
descriptor inheritance, OS read/write deadlines and supervisor activation are
separate required acceptance gates.

Linux AF_UNIX SOCK_SEQPACKET preserves ordered message boundaries. Large encoded
RWI1 records therefore need bounded carrier chunks rather than reliance on one
multi-megabyte kernel message. [Linux unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html).

Each datagram begins with this 16-byte versioned prefix, all integers big endian:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | ASCII `RWS1` |
| 4 | 4 | Logical message ID, first 1, strictly consecutive |
| 8 | 4 | Total bytes of this RWI1 record, including its 24-byte header |
| 12 | 4 | Offset of this chunk within the RWI1 record |

The remainder is 1..16,384 record bytes: at most 16,400 bytes per datagram.
Total record size is at least 24 and at most 8,390,719 bytes, encompassing the
existing largest AVC envelope. The first chunk starts at offset zero and contains
the entire RWI1 header. Its kind-specific length/version/flags are checked, and
`length + 24` must equal the carrier total, before exposing data to a body parser.
Subsequent chunks require the same total and exact next offset. Only one record
may be partial. Interleaving, duplicates, omissions, replacement, restart or ID
wrap/reuse permanently invalidate the transport; no resynchronization occurs.
Clean EOF requires a record boundary; partial EOF is a framing failure.

`SeqpacketInspector` retains fixed scalar state, no record/body storage, and
returns a borrowed span into caller-owned bounded datagram scratch. Callers must
consume or copy that span before receiving again. Rejected RWI1 headers may use
the existing exception path; this is not a claim that every error path avoids
heap allocation. The OS adapter must reject MSG_TRUNC/MSG_CTRUNC, impose finite
whole-record deadlines and preserve exclusive record-write ownership. Those OS
properties are not established by codec fixtures alone; iteration 194 verifies
the endpoint against actual kernel sockets.

The carrier adds no public browser fields, RWI1 kinds, session capabilities or
FreeRDP arguments. It carries encoded media and private secret messages through
the existing message-class bounds; it must never introduce credential logging or
retry an uncertain partial secret write.
