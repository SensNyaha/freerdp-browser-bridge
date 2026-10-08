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
| CONFIGURE | 8 | connection schema v1 below; maximum 2048 bytes |
| CONFIGURE_ACK | 9 | empty |
| SECRET | 10 | canonical UTF-8 password, no NUL, 0..4096 bytes |
| SECRET_ACK | 11 | empty |
| CONNECT | 12 | empty |
| CONNECT_ACK | 13 | empty; connection proceeds asynchronously |
| STATE | 14 | u16 state, u16 bridge reason, u32 native error; requestId=0 |
| CERTIFICATE | 15 | u64 challenge, u16 flags, 32-byte SHA-256; requestId=0 |
| CERTIFICATE_DECISION | 16 | u64 challenge, 32-byte SHA-256, u8 accept (0/1) |
| CERTIFICATE_DECISION_ACK | 17 | empty |

HELLO_ACK: u16 negotiatedVersion (1), u16 capabilities (bit 0 lifecycle, bit 1 usable browser RDP,
bit 2 experimental connection core).
Then seven strings: bridgeVersion, gitCommit, freeRdpVersion, targetFreeRdpVersion, os, arch,
transport. Each string has u16 byte length followed by UTF-8 bytes, maximum 256 bytes.
Empty freeRdpVersion means the worker is not linked to FreeRDP. Linked libraries alone never
set the usable RDP bit. Bundled connection-core builds set bit 2, not bit 1.
No trailing bytes or unknown mandatory bits are permitted.

Worker accepts HELLO exactly once, then HEARTBEAT and SHUTDOWN. Connection-core workers
also accept CONFIGURE once, SECRET once after configuration, and CONNECT once after SECRET.
Certificate decisions require the pending challenge/fingerprint. Incoming requests
have nonzero IDs; unsolicited events reserve ID zero. Wrong direction/state closes
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
their separate build and integration gates pass. See CONNECTION_CORE.md for the
experimental connection slice, distinct from full usable browser RDP.

## Connection payload v1

CONFIGURE: u16 schemaVersion=1; three u16-length UTF-8 strings host (max 253 bytes),
username/domain (max 256 bytes each); u16 port, width, height, colorDepth;
u8 security (0 auto, 1 NLA, 2 TLS), certificate policy (0 strict, 1 prompt),
minimum TLS (2 for 1.2, 3 for 1.3), reserved=0; u32 connectMs and tcpAckMs.
Port is 1..65535; dimensions 1..7680 and 1..4320; depth 16/24/32;
timeouts 100..120000 ms. Strings reject NUL/noncanonical UTF-8. Host rejects
ASCII controls/whitespace. Trailing bytes and unknown/reserved values fail.

STATE: 1 connecting, 2 awaiting-user, 3 connected, 4 closed, 5 failed.
Reasons: 0 none, 1 connection, 2 authentication, 3 certificate, 4 timeout,
5 protocol, 6 cancelled, 7 disconnected. Failed requires a nonzero reason;
other states require reason zero. Native error is an internal numeric diagnostic.

CERTIFICATE flags: bit 0 chain/server-purpose/validity verification failure,
bit 1 hostname/IP mismatch. No PEM, subject, username or secret is forwarded.
Decisions are consumed once and permit session-only trust. Persistent trust/TOFU
and changed-fingerprint history remain pending.
