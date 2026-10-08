# RWI1 foundation wire contract

This completes unspecified details of PROTOCOL.md §6 without changing its envelope.
All multi-byte fields and all lifecycle payload integers use network byte order (big endian).
The header is exactly 24 bytes: magic at 0, u16 version at 4, u16 kind at 6, u32 flags at 8,
u64 requestId at 12, u32 length at 20. Version is 1; flags must be 0. Unknown kind/version/flags
are fatal protocol errors. Request IDs correlate exactly one request/reply; replies echo the ID.

| Kind | Value | Payload |
|---|---:|---|
| HELLO | 1 | u16 minVersion, u16 maxVersion, u32 requiredFeatures (must be 0 in foundation) |
| HELLO_ACK | 2 | build report below, at most 4096 bytes |
| HEARTBEAT | 3 | empty |
| HEARTBEAT_ACK | 4 | empty |
| SHUTDOWN | 5 | empty |
| SHUTDOWN_ACK | 6 | empty |
| ERROR | 7 | u32 errorCode: 2 incompatible negotiation, 3 invalid lifecycle state |

HELLO_ACK: u16 negotiatedVersion (1), u16 capabilities (bit 0 lifecycle, bit 1 usable RDP).
Then seven strings: bridgeVersion, gitCommit, freeRdpVersion, targetFreeRdpVersion, os, arch,
transport. Each string has u16 byte length followed by UTF-8 bytes, maximum 256 bytes.
Empty freeRdpVersion means the worker is not linked to FreeRDP. Linked libraries alone never
set the usable RDP bit. No trailing bytes or unknown mandatory bits are permitted.

Worker accepts HELLO exactly once, then HEARTBEAT and SHUTDOWN. Wrong direction/state closes
the worker after a numeric ERROR where possible. Invalid envelopes/truncated records close it
with exit code 2 and a fixed diagnostic; input bytes are never interpolated into errors.

## Framed-stream fallback

Current tested Windows transport is inherited anonymous stdin/stdout pipes; stdout contains
only complete RWI1 records. stderr is separate and drained without forwarding raw diagnostics.
The same stream parser supports fragmented and coalesced records. Header validation happens
before allocation; there is at most one 24-byte header and one bounded body in the parser.
Node has a default cap of 32 pending requests and 64 KiB stream write backlog. Heartbeats are
not accumulated while another heartbeat is outstanding. Timeout/protocol violation kills the
worker and rejects pending requests; no request retries are implicit.

Worker EOF is a parent-death signal. Linux additionally uses PR_SET_PDEATHSIG. Node allocates
one private runtime directory with an exclusive non-secret ownership marker. Worker removes
only this marker and an empty directory on graceful exit/EOF; Node handles abnormal worker
cleanup. Sandboxes/spools and cleanup after simultaneous parent+worker hard kill remain later
work. Windows privacy currently relies on inherited user ACLs; explicit restricted ACL policy
is still required before multi-user production deployment.

On Windows, supervised workers use `detached: true` together with `windowsHide: true` and
retained IPC handles. This avoids libuv's parent-job teardown killing the worker before EOF
cleanup can run. Node still owns worker shutdown and awaits process close. Startup negotiation
has its own 10-second deadline; ordinary requests default to 2 seconds.

Linux SOCK_SEQPACKET is not implemented yet. Native lifecycle tests validate actual C++ process
integration, not RDP connectivity. FreeRDP channels/codecs/devices remain unsupported until
their separate build and integration gates pass.
