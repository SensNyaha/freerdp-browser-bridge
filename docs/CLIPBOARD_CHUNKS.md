# Prepared RWC1 clipboard chunks and IPC reservation

Implements byte framing/reservation for SPECIFICATION §2.7. Independent Node and
browser codecs exist; no active WebSocket transfer, credit or browser clipboard
API is installed by them. Public native selection still refuses before startup.
[Controller ownership](CLIPBOARD_SESSION.md), [private transport](CLIPBOARD_IPC.md).

All integers are big-endian. Each record is at most 4,096 bytes:

| Offset | Size | Value |
| --- | --- | --- |
| 0 | 4 | ASCII RWC1 |
| 4 | 2 | version 1 |
| 6 | 2 | reserved flags, zero |
| 8 | 4 | original control request sequence, 0..2³²−1 |
| 12 | 4 | byte offset into the declared item |
| 16 | 4 | chunk byte count, 1..4,076 |
| 20 | count | raw bytes, without JSON/base64 |

Exact length/version/flags/count and the absolute 16 MiB offset/end bound are
checked before returning borrowed views. Encoding validates before allocating
one bounded record and copies caller bytes. Empty text uses no chunks. A chunk
may split a UTF-8 scalar; the complete item must be validated against UTF-8 and
normalized/terminated UTF-16 quotas before native dispatch. Do not decode each
chunk separately to a string. Independent vectors and a full 16 MiB / 4,117-record
hash reconstruction pass; that is byte framing, not socket flow control.

The reserved window is eight chunks, at most 32,768 wire / 32,608 payload bytes.
The codec allocates no total-item buffer or queue and does not enforce credit.
The future transfer owner must admit one item before allocation, bind current
control/source identities, validate sequence/offset/ACKs, bound queued records and
apply finite whole-transfer/progress deadlines. A codec success grants no authority.

`SessionManagerOptions.workerFactory` receives frozen `SessionWorkerLimits`:
only `clipboardItemBytes` for non-off selection (default 1 MiB, range 1..16 MiB),
or `{}` when omitted/off. It receives no credentials, target or mutable config.
Existing zero-argument factories remain compatible.

`new NativeSessionWorker(options, limits)` reserves **65,536 + item maximum + 48**
Node IPC write bytes (RWI1 envelope 24 + clipboard metadata 24). The largest profile
is 16,842,800 bytes: one clipboard record plus ordinary control headroom. Pending
request/carrier limits remain. Explicit host `maxWriteBytes` is preserved when
sufficient; a smaller override refuses before private process construction.
Defaults without reservation retain 64 KiB. Supplying limits does not activate
native clipboard; updated example factories only forward numeric reservations.

A synthetic child/private framed-IPC test uses the reserved process directly for
full valid 16 MiB UTF-8 set/revoke, heartbeat and empty-runtime cleanup. It neither
invokes public native start nor claims actual RDP/OS clipboard support. Existing
framing cannot preempt a transmitted record; total memory/CPU, latency, real
network and platform acceptance remain open.
