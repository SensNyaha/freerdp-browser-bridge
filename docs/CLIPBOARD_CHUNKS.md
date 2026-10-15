# RWC1 clipboard chunks and IPC reservation

Implements byte framing/reservation for SPECIFICATION §2.7. Iteration 235 prepared
independent Node/browser codecs; Iteration 236 installs the server transfer/credit
owner for explicit backends. Iteration 237 activates the native adapter with a
matching reservation and both HELLO capabilities. Browser integration remains
gated. A codec alone grants no authority.
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

The window is eight chunks, at most 32,768 wire / 32,608 payload bytes.
The codec allocates no total-item buffer or queue and does not enforce credit.
The server owner admits one item before allocation, binds current control/source
identities, validates sequence/offset/ACKs and applies finite transfer/progress
deadlines. [Active control contract](CLIPBOARD_CONTROL.md).

`SessionManagerOptions.workerFactory` receives frozen `SessionWorkerLimits`:
only `clipboardItemBytes` for non-off selection (default 1 MiB, range 1..16 MiB),
or `{}` when omitted/off. It receives no credentials, target or mutable config.
Existing zero-argument factories remain compatible.

`new NativeSessionWorker(options, limits)` reserves **65,536 + item maximum + 48**
Node IPC write bytes (RWI1 envelope 24 + clipboard metadata 24). The largest profile
is 16,842,800 bytes: one clipboard record plus ordinary control headroom. Pending
request/carrier limits remain. Explicit host `maxWriteBytes` is preserved when
sufficient; a smaller override refuses before private process construction.
Defaults without reservation retain 64 KiB. Explicit text selection now requires
a matching reservation and both `clipboardText` / `clipboardRevoke` capabilities;
updated example factories forward numeric reservations. Unsupported formats and
old peers fail before private settings/secret submission.

A synthetic child/private framed-IPC test now uses actual native-adapter start for
full valid 16 MiB UTF-8 set/revoke, heartbeat and empty-runtime cleanup. This does
not claim actual RDP/OS clipboard support. Existing
framing cannot preempt a transmitted record; total memory/CPU, latency, real
network and platform acceptance remain open.
